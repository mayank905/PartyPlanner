from __future__ import annotations

import math
import os
import uuid
from datetime import date, timedelta
from typing import Any, Callable, List, Optional, Tuple, Type, TypeVar
from pydantic import BaseModel, Field

from app.domain.schemas import (
    BudgetCategorySchema,
    CategoryMutationSchema,
    ConstraintProfileSchema,
    ConstraintViolationSchema,
    CurrencyCode,
    EventVertical,
    MilestoneTaskSchema,
    OutdoorRiskLevel,
    PricingModel,
    RunOfShowItemSchema,
    SelectionStatus,
    TradeoffOptionSchema,
    VendorCandidateSchema,
    WeatherContextSchema,
)
from app.services.constraint_engine import (
    calculate_category_estimate,
    recalculate_milestones_for_date,
)

DEFAULT_MODEL_CASCADE: List[str] = [
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
]

CURRENCY_SYMBOLS = {
    CurrencyCode.INR: "₹",
    CurrencyCode.USD: "$",
    CurrencyCode.EUR: "€",
    CurrencyCode.GBP: "£",
}

T = TypeVar("T", bound=BaseModel)


def get_model_cascade() -> List[str]:
    env_val = os.environ.get("GEMINI_MODEL_CASCADE", "").strip()
    if env_val:
        models = [m.strip() for m in env_val.split(",") if m.strip()]
        if models:
            return models
    return list(DEFAULT_MODEL_CASCADE)


def resolve_api_key(header_key: Optional[str] = None) -> Optional[str]:
    if header_key and header_key.strip():
        return header_key.strip()
    env_key = os.environ.get("GEMINI_API_KEY", "").strip()
    return env_key if env_key else None


def invoke_gemini_cascade(
    prompt: str,
    response_schema: Type[T],
    api_key: Optional[str] = None,
    custom_cascade: Optional[List[str]] = None,
    client_factory: Optional[Callable[[str], Any]] = None,
) -> Tuple[Optional[T], str, str]:
    """
    Attempt structured generation sequentially across the 5-model Gemini 3 cascade.
    Returns (parsed_output_or_None, active_model_name, coordinator_mode).
    If a model fails due to quota (429), availability (404/503), or network error,
    automatically advances to the next model in the cascade before falling back.
    """
    resolved_key = resolve_api_key(api_key)
    if not resolved_key:
        return None, "resilient_coordinator", "resilient_coordinator"

    cascade = custom_cascade or get_model_cascade()

    try:
        if client_factory is not None:
            client = client_factory(resolved_key)
        else:
            from google import genai
            client = genai.Client(api_key=resolved_key)
    except Exception:
        return None, "resilient_coordinator", "resilient_coordinator"

    for model_name in cascade:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_schema": response_schema,
                    "temperature": 0.35,
                },
            )
            if getattr(response, "parsed", None) is not None:
                parsed = response.parsed
                if isinstance(parsed, response_schema):
                    return parsed, model_name, "live_gemini"
                return response_schema.model_validate(parsed), model_name, "live_gemini"
            if getattr(response, "text", None):
                return response_schema.model_validate_json(response.text), model_name, "live_gemini"
        except Exception:
            # Advance to next model in cascade on 429/404/503 or schema error
            continue

    return None, "resilient_coordinator", "resilient_coordinator"


class LLMInitialPlanBlueprint(BaseModel):
    categories: List[BudgetCategorySchema]
    vendors: List[VendorCandidateSchema]
    milestones: List[MilestoneTaskSchema]
    run_of_show: List[RunOfShowItemSchema]


class LLMTradeoffDeck(BaseModel):
    tradeoff_options: List[TradeoffOptionSchema]


class LLMVendorScoutList(BaseModel):
    vendors: List[VendorCandidateSchema]


class LLMChatResponse(BaseModel):
    reply_markdown: str
    suggested_tradeoff: Optional[TradeoffOptionSchema] = None


def _build_heuristic_initial_plan(
    profile: ConstraintProfileSchema,
    weather: WeatherContextSchema,
) -> LLMInitialPlanBlueprint:
    """
    Calibrated regional coordinator blueprint tailored to the user's vertical,
    budget, guest count, priority ranking, and live WeatherContext.
    """
    total = profile.total_budget_limit
    guests = max(1, profile.guest_count)
    city = profile.location_city

    if profile.event_vertical == EventVertical.INTIMATE_WEDDING:
        specs = [
            ("cat-catering", "Catering & Royal Feast", 0.30, PricingModel.PER_CAPITA, f"Multi-course live counters & {city} regional specialties ({', '.join(profile.dietary_restrictions) or 'Customizable menu'})"),
            ("cat-venue", "Venue & Heritage Lawn", 0.26, PricingModel.TIERED_CAPACITY, f"Heritage courtyard & mandap lawn in {city} with backup indoor hall"),
            ("cat-decor", "Decor & Floral Design", 0.16, PricingModel.FLAT_FEE, f"Mandap florals, ambient lighting & {', '.join(profile.vibe_tags[:2]) or 'Bespoke'} styling"),
            ("cat-photo", "Photography & Cinema", 0.12, PricingModel.FLAT_FEE, f"Candid photography + golden-hour couple reels aligned to {weather.sunset_time_local} sunset"),
            ("cat-music", "Music & Sangeet Entertainment", 0.09, PricingModel.FLAT_FEE, "Live acoustic folk ensemble + DJ sound & lighting rig"),
            ("cat-contingency", "Logistics & Weather Contingency", 0.07, PricingModel.TIERED_CAPACITY, f"Guest hospitality, valet & waterproof shamiana buffer ({weather.outdoor_risk_level.value} weather risk)"),
        ]
    elif profile.event_vertical == EventVertical.MILESTONE_BIRTHDAY:
        specs = [
            ("cat-catering", "Catering & Craft Cocktails", 0.36, PricingModel.PER_CAPITA, f"Gourmet tapas, grazing tables & signature bar in {city}"),
            ("cat-venue", "Venue & Private Lounge", 0.26, PricingModel.TIERED_CAPACITY, f"Private rooftop or boutique terrace in {city}"),
            ("cat-music", "Live Band, DJ & AV", 0.14, PricingModel.FLAT_FEE, "Live band/DJ + tribute montage projection"),
            ("cat-decor", "Styling, Lighting & Cake", 0.12, PricingModel.FLAT_FEE, "Custom sculptural tier cake, neon/floral backdrop & table styling"),
            ("cat-photo", "Event Photography & Reels", 0.07, PricingModel.FLAT_FEE, "Candid coverage + instant polaroid guestbook station"),
            ("cat-contingency", "Hospitality & Contingency", 0.05, PricingModel.FLAT_FEE, "Valet, return favors & weather cover buffer"),
        ]
    else:
        specs = [
            ("cat-catering", "Catering & High-Tea Refreshments", 0.32, PricingModel.PER_CAPITA, f"All-day specialty coffee, lunch buffet & networking high-tea in {city}"),
            ("cat-venue", "Auditorium & Breakout Venue", 0.28, PricingModel.TIERED_CAPACITY, f"Main hall + breakout spaces in {city} with high-speed Wi-Fi"),
            ("cat-av", "AV, Stage & Livestream Production", 0.18, PricingModel.FLAT_FEE, "LED backdrop, wireless mics, multi-cam recording & stage lighting"),
            ("cat-swag", "Attendee Kits, Badges & Signage", 0.10, PricingModel.PER_CAPITA, "Custom lanyards, eco-merch kits & wayfinding totems"),
            ("cat-photo", "Media & Event Documentation", 0.06, PricingModel.FLAT_FEE, "Keynote photography & highlight reel editing"),
            ("cat-contingency", "Operations & Contingency Buffer", 0.06, PricingModel.FLAT_FEE, "Backup power, extra seating & weather contingency"),
        ]

    # Slightly boost top priority categories while keeping sum of weights == 1.0
    priority_names = [p.lower() for p in profile.priority_ranking]
    raw_weights: List[float] = []
    for _, name, base_w, _, _ in specs:
        bonus = 0.0
        for idx, pname in enumerate(priority_names[:2]):
            if pname in name.lower() or name.lower() in pname:
                bonus = 0.025 if idx == 0 else 0.015
        raw_weights.append(base_w + bonus)
    weight_sum = sum(raw_weights)
    norm_weights = [w / weight_sum for w in raw_weights]

    categories: List[BudgetCategorySchema] = []
    vendors: List[VendorCandidateSchema] = []

    for (cat_id, name, _, model, notes), weight in zip(specs, norm_weights):
        allocated = round(total * weight, 0)
        target_est = round(allocated * 0.94, 0)

        if model == PricingModel.FLAT_FEE:
            base_cost = target_est
            per_head = 0.0
            tier_step = 50
            tier_cost = 0.0
        elif model == PricingModel.PER_CAPITA:
            base_cost = round(target_est * 0.18, 0)
            per_head = round((target_est - base_cost) / guests, 0)
            tier_step = 50
            tier_cost = 0.0
        else:
            tiers = max(1, math.ceil(guests / 50))
            base_cost = round(target_est * 0.60, 0)
            tier_cost = round((target_est - base_cost) / tiers, 0)
            per_head = 0.0
            tier_step = 50

        cat_schema = BudgetCategorySchema(
            id=cat_id,
            name=name,
            allocated_amount=allocated,
            committed_amount=0.0,
            estimated_amount=0.0,
            pricing_model=model,
            base_cost=base_cost,
            per_head_cost=per_head,
            tier_step=tier_step,
            tier_cost=tier_cost,
            notes=notes,
        )
        cat_schema.estimated_amount = calculate_category_estimate(cat_schema, guests)
        categories.append(cat_schema)

        # Create 2 realistic regional vendor options per category (Value vs. Signature)
        vendors.append(
            VendorCandidateSchema(
                id=f"ven-{cat_id}-a",
                category_id=cat_id,
                category_name=name,
                name=f"{city} Heritage & Co. — {name.split('&')[0].strip()} Signature",
                pricing_model=model,
                base_cost=base_cost,
                per_head_cost=per_head if model == PricingModel.PER_CAPITA else tier_cost,
                max_capacity=max(guests + 25, profile.venue_capacity_min),
                lead_time_days=45 if "venue" in cat_id else 21,
                tradeoff_notes=f"Matches baseline allocation in {city}; includes dedicated day-of coordinator.",
                selection_status=SelectionStatus.SHORTLISTED,
            )
        )
        vendors.append(
            VendorCandidateSchema(
                id=f"ven-{cat_id}-b",
                category_id=cat_id,
                category_name=name,
                name=f"Studio Utsav {city} — Curated Value Tier",
                pricing_model=model,
                base_cost=round(base_cost * 0.82, 0),
                per_head_cost=round((per_head if model == PricingModel.PER_CAPITA else tier_cost) * 0.84, 0),
                max_capacity=max(guests + 10, 90),
                lead_time_days=14,
                tradeoff_notes="Saves ~16–18% via streamlined package; slightly fewer custom add-ons.",
                selection_status=SelectionStatus.SHORTLISTED,
            )
        )

    raw_milestones = [
        MilestoneTaskSchema(
            id="ms-1",
            title=f"Lock {city} Primary Venue & Sign Capacity Contract",
            days_before_event=120,
            due_date=profile.event_date,
            category_name=categories[1].name,
            critical_path=True,
            completed=False,
            depends_on=[],
        ),
        MilestoneTaskSchema(
            id="ms-2",
            title="Finalize Catering Menu Tasting & Dietary Counters",
            days_before_event=75,
            due_date=profile.event_date,
            category_name=categories[0].name,
            critical_path=True,
            completed=False,
            depends_on=["ms-1"],
        ),
        MilestoneTaskSchema(
            id="ms-3",
            title="Book Photography, Cinema & Sound Production Team",
            days_before_event=60,
            due_date=profile.event_date,
            category_name=categories[3].name,
            critical_path=False,
            completed=False,
            depends_on=["ms-1"],
        ),
        MilestoneTaskSchema(
            id="ms-4",
            title="Approve Decor Moodboard & Weather Backup Shamiana",
            days_before_event=30,
            due_date=profile.event_date,
            category_name=categories[2].name,
            critical_path=True,
            completed=False,
            depends_on=["ms-1"],
        ),
        MilestoneTaskSchema(
            id="ms-5",
            title="Lock Final Guest Headcount & Seating Chart with Caterer",
            days_before_event=14,
            due_date=profile.event_date,
            category_name=categories[0].name,
            critical_path=True,
            completed=False,
            depends_on=["ms-2"],
        ),
        MilestoneTaskSchema(
            id="ms-6",
            title="Conduct Master Run-of-Show Walkthrough with All Vendors",
            days_before_event=3,
            due_date=profile.event_date,
            category_name=categories[-1].name,
            critical_path=True,
            completed=False,
            depends_on=["ms-4", "ms-5"],
        ),
    ]
    milestones = recalculate_milestones_for_date(raw_milestones, profile.event_date)

    sunset_str = weather.sunset_time_local or "18:10"
    try:
        sh, sm = [int(x) for x in sunset_str.split(":")[:2]]
    except Exception:
        sh, sm = 18, 10
    golden_hour_start = f"{max(0, sh - 1):02d}:{sm:02d}"

    run_of_show = [
        RunOfShowItemSchema(
            id="ros-1",
            start_time="15:30",
            duration_minutes=60,
            title="Vendor Load-In, Soundcheck & Weather Contingency Inspection",
            category_name=categories[1].name,
            is_outdoor=True,
            notes=f"Verify backup cover ({weather.outdoor_risk_level.value} outdoor risk in {city}).",
        ),
        RunOfShowItemSchema(
            id="ros-2",
            start_time="16:30",
            duration_minutes=45,
            title="Guest Arrival, Welcome Refreshments & Acoustic Prelude",
            category_name=categories[0].name,
            is_outdoor=True,
            notes="Serve chilled welcome drinks and light dietary-labeled canapés.",
        ),
        RunOfShowItemSchema(
            id="ros-3",
            start_time=golden_hour_start,
            duration_minutes=60,
            title=f"Golden-Hour Ceremony & Portraits (Aligned to {sunset_str} Sunset)",
            category_name=categories[3].name,
            is_outdoor=True,
            notes=f"Timed specifically around {city}'s {sunset_str} local sunset for natural golden light.",
        ),
        RunOfShowItemSchema(
            id="ros-4",
            start_time="18:45",
            duration_minutes=75,
            title="Toasts, Sangeet Performances & Interactive Entertainment",
            category_name=categories[4].name,
            is_outdoor=False,
            notes="Transition to illuminated courtyard / indoor stage.",
        ),
        RunOfShowItemSchema(
            id="ros-5",
            start_time="20:00",
            duration_minutes=90,
            title="Grand Celebration Feast & Live Chef Counters",
            category_name=categories[0].name,
            is_outdoor=False,
            notes=f"Dedicated stations for {', '.join(profile.dietary_restrictions) or 'all guest preferences'}.",
        ),
        RunOfShowItemSchema(
            id="ros-6",
            start_time="21:30",
            duration_minutes=60,
            title="After-Party Dance Floor & Sparkler Send-Off",
            category_name=categories[-1].name,
            is_outdoor=False,
            notes="Final vendor settlement and guest transport dispatch.",
        ),
    ]

    return LLMInitialPlanBlueprint(
        categories=categories,
        vendors=vendors,
        milestones=milestones,
        run_of_show=run_of_show,
    )


def generate_initial_plan(
    profile: ConstraintProfileSchema,
    weather: WeatherContextSchema,
    api_key: Optional[str] = None,
) -> Tuple[LLMInitialPlanBlueprint, str, str]:
    """
    Generate the initial EventPlan blueprint using the 5-model Gemini 3 cascade,
    or fall back seamlessly to the calibrated heuristic coordinator.
    """
    symbol = CURRENCY_SYMBOLS.get(profile.currency_code, "₹")
    prompt = (
        f"You are an expert Celebration & Event Coordinator. Create a complete initial EventPlan blueprint "
        f"for an {profile.event_vertical.value} in {profile.location_city} on {profile.event_date}.\n"
        f"Constraints:\n"
        f"- Currency: {profile.currency_code.value} ({symbol})\n"
        f"- Total Budget Limit: {symbol}{profile.total_budget_limit:,.0f}\n"
        f"- Guest Count: {profile.guest_count}\n"
        f"- Priority Ranking (highest to lowest): {', '.join(profile.priority_ranking)}\n"
        f"- Vibe Tags: {', '.join(profile.vibe_tags)}\n"
        f"- Dietary Restrictions: {', '.join(profile.dietary_restrictions)}\n"
        f"- Weather Context: {weather.temp_high_c}°C/{weather.temp_low_c}°C, {weather.precipitation_prob_pct}% rain risk, "
        f"Sunset at {weather.sunset_time_local} ({weather.outdoor_risk_level.value} risk).\n\n"
        f"Provide 6 BudgetCategories (using FLAT_FEE, PER_CAPITA, and TIERED_CAPACITY pricing models whose total allocated_amount "
        f"equals {profile.total_budget_limit}), at least 6 realistic VendorCandidates, 6 MilestoneTasks, and 6 RunOfShowItems "
        f"aligned with the {weather.sunset_time_local} sunset."
    )

    parsed, model_name, mode = invoke_gemini_cascade(
        prompt=prompt,
        response_schema=LLMInitialPlanBlueprint,
        api_key=api_key,
    )
    if parsed is not None and len(parsed.categories) >= 5 and len(parsed.vendors) >= 5:
        # Ensure deterministic math consistency on LLM-generated categories & milestones
        fixed_cats = [
            c.model_copy(update={"estimated_amount": calculate_category_estimate(c, profile.guest_count)})
            for c in parsed.categories
        ]
        fixed_ms = recalculate_milestones_for_date(parsed.milestones, profile.event_date)
        return (
            LLMInitialPlanBlueprint(
                categories=fixed_cats,
                vendors=parsed.vendors,
                milestones=fixed_ms,
                run_of_show=parsed.run_of_show,
            ),
            model_name,
            mode,
        )

    return _build_heuristic_initial_plan(profile, weather), model_name, mode


def _build_heuristic_tradeoffs(
    profile: ConstraintProfileSchema,
    categories: List[BudgetCategorySchema],
    violations: List[ConstraintViolationSchema],
) -> List[TradeoffOptionSchema]:
    """
    Synthesize 3 concrete, priority-aware TradeoffOptions that resolve active ConstraintViolations
    with exact financial deltas and executable CategoryMutations.
    """
    symbol = CURRENCY_SYMBOLS.get(profile.currency_code, "₹")
    guests = max(1, profile.guest_count)
    current_total = round(sum(c.estimated_amount for c in categories), 2)
    overflow = max(0.0, round(current_total - profile.total_budget_limit, 2))
    target_savings = overflow if overflow > 0 else round(current_total * 0.12, 0)

    # Identify protected top-priority categories vs flexible lower-priority categories
    top_priorities = {p.lower() for p in profile.priority_ranking[:2]}
    flexible_cats: List[BudgetCategorySchema] = []
    protected_cats: List[BudgetCategorySchema] = []

    for c in categories:
        if any(tp in c.name.lower() or c.name.lower() in tp for tp in top_priorities):
            protected_cats.append(c)
        else:
            flexible_cats.append(c)

    if not flexible_cats:
        flexible_cats = categories[2:] if len(categories) > 2 else list(categories)

    # Option A: Protect Top Priorities & Rebalance Flexible Categories to Hit Exact Budget Target
    flex_total = max(1.0, sum(c.estimated_amount for c in flexible_cats))
    mutations_a: List[CategoryMutationSchema] = []
    new_total_a = 0.0

    for c in categories:
        if c in flexible_cats and target_savings > 0:
            share = c.estimated_amount / flex_total
            cut = min(c.estimated_amount * 0.42, round(target_savings * share * 1.05, 0))
            target_cat_est = max(round(c.estimated_amount - cut, 0), round(c.estimated_amount * 0.55, 0))
            ratio = target_cat_est / max(1.0, c.estimated_amount)
            new_base = round(c.base_cost * ratio, 0)
            new_per_head = round(c.per_head_cost * ratio, 0)
            new_alloc = target_cat_est
            mutations_a.append(
                CategoryMutationSchema(
                    category_id=c.id,
                    category_name=c.name,
                    previous_allocated=c.allocated_amount,
                    new_allocated=new_alloc,
                    previous_base_cost=c.base_cost,
                    new_base_cost=new_base,
                    previous_per_head_cost=c.per_head_cost,
                    new_per_head_cost=new_per_head,
                    change_rationale=f"Trim non-priority scope by {(1 - ratio) * 100:.0f}% to absorb {guests}-guest scaling.",
                )
            )
            new_total_a += target_cat_est
        else:
            # Synchronize allocated_amount to match scaled estimated_amount for protected categories
            mutations_a.append(
                CategoryMutationSchema(
                    category_id=c.id,
                    category_name=c.name,
                    previous_allocated=c.allocated_amount,
                    new_allocated=c.estimated_amount,
                    previous_base_cost=c.base_cost,
                    new_base_cost=c.base_cost,
                    previous_per_head_cost=c.per_head_cost,
                    new_per_head_cost=c.per_head_cost,
                    change_rationale="Protected priority category — preserves full per-guest quality.",
                )
            )
            new_total_a += c.estimated_amount

    opt_a = TradeoffOptionSchema(
        id="tradeoff-priority-shield",
        title="Option A: Shield Top Priorities & Re-Tier Flexible Categories",
        badge="Recommended — Priority Aligned",
        summary=(
            f"Protects {', '.join(c.name for c in protected_cats[:2]) or 'top priorities'} at full quality for "
            f"{guests} guests while trimming {', '.join(c.name for c in flexible_cats[:3])} packages."
        ),
        financial_delta=round(new_total_a - current_total, 2),
        new_total_estimated=round(new_total_a, 2),
        pros=[
            f"Zero compromise on your highest-ranked priorities ({', '.join(profile.priority_ranking[:2]) or 'Food & Venue'})",
            f"Saves {symbol}{abs(current_total - new_total_a):,.0f} immediately across flexible buckets",
            f"Keeps full guest list of {guests} intact",
        ],
        cons=[
            "Requires switching Decor/Entertainment to curated package tiers rather than bespoke custom builds",
        ],
        mutations=mutations_a,
    )

    # Option B: Optimize Per-Capita Service Style (High-Impact Per-Head Compression)
    mutations_b: List[CategoryMutationSchema] = []
    new_total_b = 0.0
    for c in categories:
        if c.pricing_model == PricingModel.PER_CAPITA:
            new_per_head = round(c.per_head_cost * 0.78, 0)
            new_est = round(c.base_cost + new_per_head * guests, 0)
            mutations_b.append(
                CategoryMutationSchema(
                    category_id=c.id,
                    category_name=c.name,
                    previous_allocated=c.allocated_amount,
                    new_allocated=new_est,
                    previous_base_cost=c.base_cost,
                    new_base_cost=c.base_cost,
                    previous_per_head_cost=c.per_head_cost,
                    new_per_head_cost=new_per_head,
                    change_rationale=f"Shift from plated/full-service to curated interactive stations (-22% per head: {symbol}{c.per_head_cost:,.0f} -> {symbol}{new_per_head:,.0f}).",
                )
            )
            new_total_b += new_est
        else:
            new_est = round(c.estimated_amount * 0.92, 0)
            new_base = round(c.base_cost * 0.92, 0)
            mutations_b.append(
                CategoryMutationSchema(
                    category_id=c.id,
                    category_name=c.name,
                    previous_allocated=c.allocated_amount,
                    new_allocated=new_est,
                    previous_base_cost=c.base_cost,
                    new_base_cost=new_base,
                    previous_per_head_cost=c.per_head_cost,
                    new_per_head_cost=c.per_head_cost,
                    change_rationale="Negotiate 8% off-peak / bundled vendor discount.",
                )
            )
            new_total_b += new_est

    opt_b = TradeoffOptionSchema(
        id="tradeoff-per-capita-shift",
        title="Option B: Re-Engineer Per-Head Service Format & Bundle Vendors",
        badge="Best Per-Guest Efficiency",
        summary=(
            f"Reduces per-capita unit rates by 22% (interactive grazing & live stations instead of formal plated service) "
            f"plus an 8% bundled rate on flat-fee vendors."
        ),
        financial_delta=round(new_total_b - current_total, 2),
        new_total_estimated=round(new_total_b, 2),
        pros=[
            "Prevents future guest-count spikes from blowing up the budget linearly",
            "Preserves visual decor and photography aesthetics across the venue",
        ],
        cons=[
            "Changes dining format from formal sit-down to curated live stations",
        ],
        mutations=mutations_b,
    )

    # Option C: Right-Size Guest Count Tier + Moderate Budget Ceiling Adjustment
    trimmed_guests = max(40, int(round(guests * 0.85 / 5) * 5))
    mutations_c: List[CategoryMutationSchema] = []
    new_total_c = 0.0
    for c in categories:
        est_at_trimmed = calculate_category_estimate(c, trimmed_guests)
        mutations_c.append(
            CategoryMutationSchema(
                category_id=c.id,
                category_name=c.name,
                previous_allocated=c.allocated_amount,
                new_allocated=est_at_trimmed,
                previous_base_cost=c.base_cost,
                new_base_cost=c.base_cost,
                previous_per_head_cost=c.per_head_cost,
                new_per_head_cost=c.per_head_cost,
                change_rationale=f"Retain 100% luxury vendor specifications while capping guest list at {trimmed_guests}.",
            )
        )
        new_total_c += est_at_trimmed

    opt_c = TradeoffOptionSchema(
        id="tradeoff-intimate-tier",
        title=f"Option C: Cap Guest List at {trimmed_guests} to Preserve Luxury Tier",
        badge="Zero Vendor Downgrade",
        summary=(
            f"Keeps every vendor package and per-plate menu untouched, resolving capacity and budget pressure "
            f"by right-sizing the guest count from {guests} to {trimmed_guests}."
        ),
        financial_delta=round(new_total_c - current_total, 2),
        new_total_estimated=round(new_total_c, 2),
        pros=[
            "Zero reduction in menu richness, photography hours, or floral density",
            "Automatically resolves venue capacity step-up charges",
        ],
        cons=[
            f"Requires trimming {guests - trimmed_guests} seats from the extended invitation list",
        ],
        mutations=mutations_c,
        suggested_guest_count=trimmed_guests,
    )

    return [opt_a, opt_b, opt_c]


def propose_tradeoffs(
    profile: ConstraintProfileSchema,
    categories: List[BudgetCategorySchema],
    violations: List[ConstraintViolationSchema],
    api_key: Optional[str] = None,
) -> Tuple[List[TradeoffOptionSchema], str, str]:
    """
    Use the 5-model Gemini 3 cascade to synthesize TradeoffOptions when constraints change,
    falling back to the deterministic priority-aware tradeoff synthesizer.
    """
    symbol = CURRENCY_SYMBOLS.get(profile.currency_code, "₹")
    viol_text = "\n".join(f"- [{v.violation_type.value}] {v.title}: {v.description}" for v in violations)
    cat_text = "\n".join(
        f"- {c.id} ({c.name}): model={c.pricing_model.value}, allocated={symbol}{c.allocated_amount:,.0f}, "
        f"estimated={symbol}{c.estimated_amount:,.0f}, base={c.base_cost}, per_head={c.per_head_cost}"
        for c in categories
    )

    prompt = (
        f"You are an AI Event Coordinator resolving constraint conflicts for a {profile.event_vertical.value} "
        f"in {profile.location_city} ({profile.guest_count} guests, budget limit {symbol}{profile.total_budget_limit:,.0f}).\n"
        f"Host Priority Ranking (protect first, cut last): {', '.join(profile.priority_ranking)}\n"
        f"Current Categories:\n{cat_text}\n"
        f"Active Violations:\n{viol_text or 'User requested proactive optimization'}\n\n"
        f"Propose 3 distinct TradeoffOptions with exact CategoryMutations using existing category_id values."
    )

    parsed, model_name, mode = invoke_gemini_cascade(
        prompt=prompt,
        response_schema=LLMTradeoffDeck,
        api_key=api_key,
    )
    if parsed is not None and len(parsed.tradeoff_options) >= 2:
        return parsed.tradeoff_options, model_name, mode

    return _build_heuristic_tradeoffs(profile, categories, violations), model_name, mode


def scout_vendors_for_category(
    profile: ConstraintProfileSchema,
    category: BudgetCategorySchema,
    custom_focus: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Tuple[List[VendorCandidateSchema], str, str]:
    """
    Discover 2 additional regionally calibrated VendorCandidates for the specified category.
    """
    symbol = CURRENCY_SYMBOLS.get(profile.currency_code, "₹")
    prompt = (
        f"Scout 2 realistic vendor candidates in {profile.location_city} for category '{category.name}' "
        f"(category_id='{category.id}') for a {profile.guest_count}-guest {profile.event_vertical.value} "
        f"with category budget {symbol}{category.allocated_amount:,.0f}. Focus: {custom_focus or 'Best value vs boutique luxury'}."
    )

    parsed, model_name, mode = invoke_gemini_cascade(
        prompt=prompt,
        response_schema=LLMVendorScoutList,
        api_key=api_key,
    )
    if parsed is not None and len(parsed.vendors) >= 1:
        normalized = [
            v.model_copy(
                update={
                    "id": f"ven-{uuid.uuid4().hex[:8]}",
                    "category_id": category.id,
                    "category_name": category.name,
                    "selection_status": SelectionStatus.SHORTLISTED,
                }
            )
            for v in parsed.vendors
        ]
        return normalized, model_name, mode

    # Calibrated regional fallback vendors
    suffix = uuid.uuid4().hex[:4]
    focus_label = f" ({custom_focus})" if custom_focus else ""
    fallback_vendors = [
        VendorCandidateSchema(
            id=f"ven-scout-{suffix}-1",
            category_id=category.id,
            category_name=category.name,
            name=f"{profile.location_city} Royal Atelier — {category.name.split('&')[0].strip()}{focus_label}",
            pricing_model=category.pricing_model,
            base_cost=round(category.base_cost * 0.90, 0),
            per_head_cost=round((category.per_head_cost or category.tier_cost) * 0.90, 0),
            max_capacity=max(profile.guest_count + 40, 150),
            lead_time_days=30,
            tradeoff_notes=(
                f"Saves ~10% vs baseline ({symbol}{calculate_category_estimate(category, profile.guest_count) * 0.90:,.0f} "
                f"total at {profile.guest_count} guests); flexible weather rescheduling clause included."
            ),
            selection_status=SelectionStatus.SHORTLISTED,
        ),
        VendorCandidateSchema(
            id=f"ven-scout-{suffix}-2",
            category_id=category.id,
            category_name=category.name,
            name=f"Bespoke Collective {profile.location_city} — {category.name.split('&')[0].strip()}",
            pricing_model=category.pricing_model,
            base_cost=round(category.base_cost * 1.08, 0),
            per_head_cost=round((category.per_head_cost or category.tier_cost) * 1.05, 0),
            max_capacity=max(profile.guest_count + 80, 220),
            lead_time_days=45,
            tradeoff_notes=(
                f"Premium tier in {profile.location_city} with higher guest capacity ceiling and full backup crew."
            ),
            selection_status=SelectionStatus.SHORTLISTED,
        ),
    ]
    return fallback_vendors, model_name, mode


def chat_with_coordinator(
    message: str,
    profile: ConstraintProfileSchema,
    categories: List[BudgetCategorySchema],
    violations: List[ConstraintViolationSchema],
    weather: WeatherContextSchema,
    api_key: Optional[str] = None,
) -> Tuple[str, Optional[TradeoffOptionSchema], str, str]:
    """
    Answer a Host's question in the AI Coordinator Chat Drawer grounded in the active EventPlan state,
    returning markdown advice and an executable TradeoffOption card when appropriate.
    """
    symbol = CURRENCY_SYMBOLS.get(profile.currency_code, "₹")
    total_est = sum(c.estimated_amount for c in categories)
    prompt = (
        f"You are the AI Celebration Coordinator for an event in {profile.location_city} on {profile.event_date}.\n"
        f"Current Plan Context: {profile.guest_count} guests, Budget Limit {symbol}{profile.total_budget_limit:,.0f}, "
        f"Current Estimated Spend {symbol}{total_est:,.0f}, Sunset {weather.sunset_time_local}, "
        f"Outdoor Risk {weather.outdoor_risk_level.value}.\n"
        f"Active Violations: {len(violations)}\n"
        f"Host Question: {message}\n\n"
        f"Provide concise, practical coordinator guidance with exact numbers in {symbol}, and include a suggested_tradeoff "
        f"if the user is asking about a what-if scenario, budget cut, or guest change."
    )

    parsed, model_name, mode = invoke_gemini_cascade(
        prompt=prompt,
        response_schema=LLMChatResponse,
        api_key=api_key,
    )
    if parsed is not None and parsed.reply_markdown:
        return parsed.reply_markdown, parsed.suggested_tradeoff, model_name, mode

    # Resilient context-grounded coordinator response with inline TradeoffOption
    tradeoffs = _build_heuristic_tradeoffs(profile, categories, violations)
    primary_tradeoff = tradeoffs[0] if tradeoffs else None
    top_priority = profile.priority_ranking[0] if profile.priority_ranking else categories[0].name

    reply = (
        f"### Coordinator Analysis for **{profile.location_city}** ({profile.guest_count} Guests)\n\n"
        f"* **Current Financial Position**: Estimated spend is **{symbol}{total_est:,.0f}** against your ceiling of "
        f"**{symbol}{profile.total_budget_limit:,.0f}** "
        f"({'within budget' if total_est <= profile.total_budget_limit else f'{symbol}{total_est - profile.total_budget_limit:,.0f} over limit'}).\n"
        f"* **Priority Protection**: Because **{top_priority}** is ranked #1 in your priorities, I recommend keeping its per-guest specification intact and absorbing changes in lower-priority categories.\n"
        f"* **Weather & Timing Note**: Local sunset in {profile.location_city} is at **{weather.sunset_time_local}** "
        f"({weather.outdoor_risk_level.value} rain risk at {weather.precipitation_prob_pct:.0f}%). Schedule outdoor transitions at least 45 minutes prior.\n\n"
        f"I have attached an actionable **Tradeoff Option** below—click **Preview Diff** to inspect the exact category adjustments before applying."
    )
    return reply, primary_tradeoff, model_name, mode
