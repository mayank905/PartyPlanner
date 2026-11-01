"""Calibrated heuristic coordinator blueprints, priority-aware tradeoff synthesizers, and sunset alignment."""

from __future__ import annotations

import math
import uuid
from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel

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

CURRENCY_SYMBOLS: Dict[CurrencyCode, str] = {
    CurrencyCode.INR: "₹",
    CurrencyCode.USD: "$",
    CurrencyCode.EUR: "€",
    CurrencyCode.GBP: "£",
}

CategorySpecTuple = Tuple[str, str, float, PricingModel, str]


class LLMInitialPlanBlueprint(BaseModel):
    """Structured output schema for initial event plan generation."""

    categories: List[BudgetCategorySchema]
    vendors: List[VendorCandidateSchema]
    milestones: List[MilestoneTaskSchema]
    run_of_show: List[RunOfShowItemSchema]


class LLMTradeoffDeck(BaseModel):
    """Structured output schema for AI-generated tradeoff options."""

    tradeoff_options: List[TradeoffOptionSchema]


class LLMVendorScoutList(BaseModel):
    """Structured output schema for category vendor scouting."""

    vendors: List[VendorCandidateSchema]


class LLMRunOfShowDeck(BaseModel):
    """Structured output schema for day-of run-of-show optimization."""

    run_of_show: List[RunOfShowItemSchema]


class LLMChatResponse(BaseModel):
    """Structured output schema for AI coordinator chat turns."""

    reply_markdown: str
    suggested_tradeoff: Optional[TradeoffOptionSchema] = None


def _get_wedding_category_specs(
    profile: ConstraintProfileSchema,
    weather: WeatherContextSchema,
) -> List[CategorySpecTuple]:
    """Return baseline category specifications for an Intimate Wedding."""
    city = profile.location_city
    dietary = ", ".join(profile.dietary_restrictions) or "Customizable menu"
    vibe = ", ".join(profile.vibe_tags[:2]) or "Bespoke"
    return [
        (
            "cat-catering",
            "Catering & Royal Feast",
            0.30,
            PricingModel.PER_CAPITA,
            f"Multi-course live counters & {city} regional specialties ({dietary})",
        ),
        (
            "cat-venue",
            "Venue & Heritage Lawn",
            0.26,
            PricingModel.TIERED_CAPACITY,
            f"Heritage courtyard & mandap lawn in {city} with backup indoor hall",
        ),
        (
            "cat-decor",
            "Decor & Floral Design",
            0.16,
            PricingModel.FLAT_FEE,
            f"Mandap florals, ambient lighting & {vibe} styling",
        ),
        (
            "cat-photo",
            "Photography & Cinema",
            0.12,
            PricingModel.FLAT_FEE,
            f"Candid photography + golden-hour couple reels aligned to {weather.sunset_time_local} sunset",
        ),
        (
            "cat-music",
            "Music & Sangeet Entertainment",
            0.09,
            PricingModel.FLAT_FEE,
            "Live acoustic folk ensemble + DJ sound & lighting rig",
        ),
        (
            "cat-contingency",
            "Logistics & Weather Contingency",
            0.07,
            PricingModel.TIERED_CAPACITY,
            f"Guest hospitality, valet & waterproof shamiana buffer ({weather.outdoor_risk_level.value} weather risk)",
        ),
    ]


def _get_birthday_category_specs(city: str) -> List[CategorySpecTuple]:
    """Return baseline category specifications for a Milestone Birthday."""
    return [
        (
            "cat-catering",
            "Catering & Craft Cocktails",
            0.36,
            PricingModel.PER_CAPITA,
            f"Gourmet tapas, grazing tables & signature bar in {city}",
        ),
        (
            "cat-venue",
            "Venue & Private Lounge",
            0.26,
            PricingModel.TIERED_CAPACITY,
            f"Private rooftop or boutique terrace in {city}",
        ),
        (
            "cat-music",
            "Live Band, DJ & AV",
            0.14,
            PricingModel.FLAT_FEE,
            "Live band/DJ + tribute montage projection",
        ),
        (
            "cat-decor",
            "Styling, Lighting & Cake",
            0.12,
            PricingModel.FLAT_FEE,
            "Custom sculptural tier cake, neon/floral backdrop & table styling",
        ),
        (
            "cat-photo",
            "Event Photography & Reels",
            0.07,
            PricingModel.FLAT_FEE,
            "Candid coverage + instant polaroid guestbook station",
        ),
        (
            "cat-contingency",
            "Hospitality & Contingency",
            0.05,
            PricingModel.FLAT_FEE,
            "Valet, return favors & weather cover buffer",
        ),
    ]


def _get_tech_fest_category_specs(city: str) -> List[CategorySpecTuple]:
    """Return baseline category specifications for a Campus or Tech Fest."""
    return [
        (
            "cat-catering",
            "Catering & High-Tea Refreshments",
            0.32,
            PricingModel.PER_CAPITA,
            f"All-day specialty coffee, lunch buffet & networking high-tea in {city}",
        ),
        (
            "cat-venue",
            "Auditorium & Breakout Venue",
            0.28,
            PricingModel.TIERED_CAPACITY,
            f"Main hall + breakout spaces in {city} with high-speed Wi-Fi",
        ),
        (
            "cat-av",
            "AV, Stage & Livestream Production",
            0.18,
            PricingModel.FLAT_FEE,
            "LED backdrop, wireless mics, multi-cam recording & stage lighting",
        ),
        (
            "cat-swag",
            "Attendee Kits, Badges & Signage",
            0.10,
            PricingModel.PER_CAPITA,
            "Custom lanyards, eco-merch kits & wayfinding totems",
        ),
        (
            "cat-photo",
            "Media & Event Documentation",
            0.06,
            PricingModel.FLAT_FEE,
            "Keynote photography & highlight reel editing",
        ),
        (
            "cat-contingency",
            "Operations & Contingency Buffer",
            0.06,
            PricingModel.FLAT_FEE,
            "Backup power, extra seating & weather contingency",
        ),
    ]


def _get_vertical_category_specs(
    profile: ConstraintProfileSchema,
    weather: WeatherContextSchema,
) -> List[CategorySpecTuple]:
    """Return baseline category specifications calibrated to the selected event vertical."""
    if profile.event_vertical == EventVertical.INTIMATE_WEDDING:
        return _get_wedding_category_specs(profile, weather)
    if profile.event_vertical == EventVertical.MILESTONE_BIRTHDAY:
        return _get_birthday_category_specs(profile.location_city)
    return _get_tech_fest_category_specs(profile.location_city)


def _compute_normalized_weights(
    specs: List[CategorySpecTuple],
    priority_ranking: List[str],
) -> List[float]:
    """Boost top-priority categories while normalizing all category weights to sum to 1.0."""
    priority_names = [p.lower() for p in priority_ranking]
    raw_weights: List[float] = []
    for _, name, base_w, _, _ in specs:
        bonus = 0.0
        for idx, pname in enumerate(priority_names[:2]):
            if pname in name.lower() or name.lower() in pname:
                bonus = 0.025 if idx == 0 else 0.015
        raw_weights.append(base_w + bonus)
    weight_sum = sum(raw_weights)
    return [w / weight_sum for w in raw_weights]


def _build_category_and_vendors(
    spec: CategorySpecTuple,
    weight: float,
    profile: ConstraintProfileSchema,
) -> Tuple[BudgetCategorySchema, List[VendorCandidateSchema]]:
    """Construct a calibrated BudgetCategorySchema and its initial shortlisted VendorCandidates."""
    cat_id, name, _, model, notes = spec
    guests = max(1, profile.guest_count)
    city = profile.location_city
    allocated = round(profile.total_budget_limit * weight, 0)
    target_est = round(allocated * 0.94, 0)
    tier_step = 50

    if model == PricingModel.FLAT_FEE:
        base_cost, per_head, tier_cost = target_est, 0.0, 0.0
    elif model == PricingModel.PER_CAPITA:
        base_cost = round(target_est * 0.18, 0)
        per_head = round((target_est - base_cost) / guests, 0)
        tier_cost = 0.0
    else:
        tiers = max(1, math.ceil(guests / tier_step))
        base_cost = round(target_est * 0.60, 0)
        tier_cost = round((target_est - base_cost) / tiers, 0)
        per_head = 0.0

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

    unit_rate = per_head if model == PricingModel.PER_CAPITA else tier_cost
    short_label = name.split("&")[0].strip()
    vendors = [
        VendorCandidateSchema(
            id=f"ven-{cat_id}-a",
            category_id=cat_id,
            category_name=name,
            name=f"{city} Heritage & Co. — {short_label} Signature",
            pricing_model=model,
            base_cost=base_cost,
            per_head_cost=unit_rate,
            max_capacity=max(guests + 25, profile.venue_capacity_min),
            lead_time_days=45 if "venue" in cat_id else 21,
            tradeoff_notes=f"Matches baseline allocation in {city}; includes dedicated day-of coordinator.",
            selection_status=SelectionStatus.SHORTLISTED,
        ),
        VendorCandidateSchema(
            id=f"ven-{cat_id}-b",
            category_id=cat_id,
            category_name=name,
            name=f"Studio Utsav {city} — Curated Value Tier",
            pricing_model=model,
            base_cost=round(base_cost * 0.82, 0),
            per_head_cost=round(unit_rate * 0.84, 0),
            max_capacity=max(guests + 10, 90),
            lead_time_days=14,
            tradeoff_notes="Saves ~16–18% via streamlined package; slightly fewer custom add-ons.",
            selection_status=SelectionStatus.SHORTLISTED,
        ),
    ]
    return cat_schema, vendors


def _build_default_milestones(
    profile: ConstraintProfileSchema,
    categories: List[BudgetCategorySchema],
) -> List[MilestoneTaskSchema]:
    """Build and date-anchor the 6 critical-path and supporting pre-event MilestoneTasks."""
    city = profile.location_city
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
    return recalculate_milestones_for_date(raw_milestones, profile.event_date)


def _parse_sunset_hour_min(sunset_str: str) -> Tuple[int, int]:
    """Parse HH:MM sunset string into integer hour and minute components."""
    try:
        sh, sm = [int(x) for x in sunset_str.split(":")[:2]]
        return sh, sm
    except ValueError:
        return 18, 10


def _build_default_run_of_show(
    profile: ConstraintProfileSchema,
    weather: WeatherContextSchema,
    categories: List[BudgetCategorySchema],
) -> List[RunOfShowItemSchema]:
    """Build the 6-block day-of Run-of-Show schedule anchored to local sunset."""
    city = profile.location_city
    sunset_str = weather.sunset_time_local or "18:10"
    sh, sm = _parse_sunset_hour_min(sunset_str)
    golden_hour_start = f"{max(0, sh - 1):02d}:{sm:02d}"
    dietary_note = ", ".join(profile.dietary_restrictions) or "all guest preferences"

    return [
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
            notes=f"Dedicated stations for {dietary_note}.",
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


def _build_heuristic_initial_plan(
    profile: ConstraintProfileSchema,
    weather: WeatherContextSchema,
) -> LLMInitialPlanBlueprint:
    """
    Calibrated regional coordinator blueprint tailored to the user's vertical,
    budget, guest count, priority ranking, and live WeatherContext.
    """
    specs = _get_vertical_category_specs(profile, weather)
    norm_weights = _compute_normalized_weights(specs, profile.priority_ranking)

    categories: List[BudgetCategorySchema] = []
    vendors: List[VendorCandidateSchema] = []

    for spec, weight in zip(specs, norm_weights):
        cat_schema, cat_vendors = _build_category_and_vendors(spec, weight, profile)
        categories.append(cat_schema)
        vendors.extend(cat_vendors)

    milestones = _build_default_milestones(profile, categories)
    run_of_show = _build_default_run_of_show(profile, weather, categories)

    return LLMInitialPlanBlueprint(
        categories=categories,
        vendors=vendors,
        milestones=milestones,
        run_of_show=run_of_show,
    )


def _partition_categories_by_priority(
    categories: List[BudgetCategorySchema],
    priority_ranking: List[str],
) -> Tuple[List[BudgetCategorySchema], List[BudgetCategorySchema]]:
    """Split categories into protected top-priority categories and flexible categories."""
    top_priorities = {p.lower() for p in priority_ranking[:2]}
    protected_cats: List[BudgetCategorySchema] = []
    flexible_cats: List[BudgetCategorySchema] = []

    for c in categories:
        if any(tp in c.name.lower() or c.name.lower() in tp for tp in top_priorities):
            protected_cats.append(c)
        else:
            flexible_cats.append(c)

    if not flexible_cats:
        flexible_cats = categories[2:] if len(categories) > 2 else list(categories)

    return protected_cats, flexible_cats


def _build_priority_shield_option(
    profile: ConstraintProfileSchema,
    categories: List[BudgetCategorySchema],
    protected_cats: List[BudgetCategorySchema],
    flexible_cats: List[BudgetCategorySchema],
    current_total: float,
    target_savings: float,
) -> TradeoffOptionSchema:
    """Option A: Protect top priorities and rebalance flexible categories."""
    symbol = CURRENCY_SYMBOLS.get(profile.currency_code, "₹")
    guests = max(1, profile.guest_count)
    flex_total = max(1.0, sum(c.estimated_amount for c in flexible_cats))
    mutations: List[CategoryMutationSchema] = []
    new_total = 0.0

    for c in categories:
        if c in flexible_cats and target_savings > 0:
            share = c.estimated_amount / flex_total
            cut = min(c.estimated_amount * 0.42, round(target_savings * share * 1.05, 0))
            target_cat_est = max(round(c.estimated_amount - cut, 0), round(c.estimated_amount * 0.55, 0))
            ratio = target_cat_est / max(1.0, c.estimated_amount)
            new_base = round(c.base_cost * ratio, 0)
            new_per_head = round(c.per_head_cost * ratio, 0)
            new_tier_cost = round(c.tier_cost * ratio, 0) if c.tier_cost else None
            mutations.append(
                CategoryMutationSchema(
                    category_id=c.id,
                    category_name=c.name,
                    previous_allocated=c.allocated_amount,
                    new_allocated=target_cat_est,
                    previous_base_cost=c.base_cost,
                    new_base_cost=new_base,
                    previous_per_head_cost=c.per_head_cost,
                    new_per_head_cost=new_per_head,
                    new_tier_cost=new_tier_cost,
                    change_rationale=f"Trim non-priority scope by {(1 - ratio) * 100:.0f}% to absorb {guests}-guest scaling.",
                )
            )
            new_total += target_cat_est
        else:
            mutations.append(
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
            new_total += c.estimated_amount

    return TradeoffOptionSchema(
        id="tradeoff-priority-shield",
        title="Option A: Shield Top Priorities & Re-Tier Flexible Categories",
        badge="Recommended — Priority Aligned",
        summary=(
            f"Protects {', '.join(c.name for c in protected_cats[:2]) or 'top priorities'} at full quality for "
            f"{guests} guests while trimming {', '.join(c.name for c in flexible_cats[:3])} packages."
        ),
        financial_delta=round(new_total - current_total, 2),
        new_total_estimated=round(new_total, 2),
        pros=[
            f"Zero compromise on your highest-ranked priorities ({', '.join(profile.priority_ranking[:2]) or 'Food & Venue'})",
            f"Saves {symbol}{abs(current_total - new_total):,.0f} immediately across flexible buckets",
            f"Keeps full guest list of {guests} intact",
        ],
        cons=[
            "Requires switching Decor/Entertainment to curated package tiers rather than bespoke custom builds",
        ],
        mutations=mutations,
    )


def _build_per_capita_option(
    profile: ConstraintProfileSchema,
    categories: List[BudgetCategorySchema],
    current_total: float,
) -> TradeoffOptionSchema:
    """Option B: Optimize per-capita service format and bundle flat-fee vendors."""
    symbol = CURRENCY_SYMBOLS.get(profile.currency_code, "₹")
    guests = max(1, profile.guest_count)
    mutations: List[CategoryMutationSchema] = []
    new_total = 0.0

    for c in categories:
        if c.pricing_model == PricingModel.PER_CAPITA:
            new_per_head = round(c.per_head_cost * 0.78, 0)
            new_est = round(c.base_cost + new_per_head * guests, 0)
            mutations.append(
                CategoryMutationSchema(
                    category_id=c.id,
                    category_name=c.name,
                    previous_allocated=c.allocated_amount,
                    new_allocated=new_est,
                    previous_base_cost=c.base_cost,
                    new_base_cost=c.base_cost,
                    previous_per_head_cost=c.per_head_cost,
                    new_per_head_cost=new_per_head,
                    change_rationale=(
                        f"Shift from plated/full-service to curated interactive stations "
                        f"(-22% per head: {symbol}{c.per_head_cost:,.0f} -> {symbol}{new_per_head:,.0f})."
                    ),
                )
            )
            new_total += new_est
        else:
            new_est = round(c.estimated_amount * 0.92, 0)
            new_base = round(c.base_cost * 0.92, 0)
            new_tier_cost = round(c.tier_cost * 0.92, 0) if c.tier_cost else None
            mutations.append(
                CategoryMutationSchema(
                    category_id=c.id,
                    category_name=c.name,
                    previous_allocated=c.allocated_amount,
                    new_allocated=new_est,
                    previous_base_cost=c.base_cost,
                    new_base_cost=new_base,
                    previous_per_head_cost=c.per_head_cost,
                    new_per_head_cost=c.per_head_cost,
                    new_tier_cost=new_tier_cost,
                    change_rationale="Negotiate 8% off-peak / bundled vendor discount.",
                )
            )
            new_total += new_est

    return TradeoffOptionSchema(
        id="tradeoff-per-capita-shift",
        title="Option B: Re-Engineer Per-Head Service Format & Bundle Vendors",
        badge="Best Per-Guest Efficiency",
        summary=(
            "Reduces per-capita unit rates by 22% (interactive grazing & live stations instead of formal plated service) "
            "plus an 8% bundled rate on flat-fee vendors."
        ),
        financial_delta=round(new_total - current_total, 2),
        new_total_estimated=round(new_total, 2),
        pros=[
            "Prevents future guest-count spikes from blowing up the budget linearly",
            "Preserves visual decor and photography aesthetics across the venue",
        ],
        cons=[
            "Changes dining format from formal sit-down to curated live stations",
        ],
        mutations=mutations,
    )


def _build_guest_cap_option(
    profile: ConstraintProfileSchema,
    categories: List[BudgetCategorySchema],
    current_total: float,
) -> TradeoffOptionSchema:
    """Option C: Right-size the guest list to preserve 100% luxury vendor specifications."""
    guests = max(1, profile.guest_count)
    trimmed_guests = max(40, int(round(guests * 0.85 / 5) * 5))
    mutations: List[CategoryMutationSchema] = []
    new_total = 0.0

    for c in categories:
        est_at_trimmed = calculate_category_estimate(c, trimmed_guests)
        mutations.append(
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
        new_total += est_at_trimmed

    return TradeoffOptionSchema(
        id="tradeoff-intimate-tier",
        title=f"Option C: Cap Guest List at {trimmed_guests} to Preserve Luxury Tier",
        badge="Zero Vendor Downgrade",
        summary=(
            f"Keeps every vendor package and per-plate menu untouched, resolving capacity and budget pressure "
            f"by right-sizing the guest count from {guests} to {trimmed_guests}."
        ),
        financial_delta=round(new_total - current_total, 2),
        new_total_estimated=round(new_total, 2),
        pros=[
            "Zero reduction in menu richness, photography hours, or floral density",
            "Automatically resolves venue capacity step-up charges",
        ],
        cons=[
            f"Requires trimming {guests - trimmed_guests} seats from the extended invitation list",
        ],
        mutations=mutations,
        suggested_guest_count=trimmed_guests,
    )


def _build_heuristic_tradeoffs(
    profile: ConstraintProfileSchema,
    categories: List[BudgetCategorySchema],
    violations: List[ConstraintViolationSchema],
) -> List[TradeoffOptionSchema]:
    """
    Synthesize 3 concrete, priority-aware TradeoffOptions that resolve active ConstraintViolations
    with exact financial deltas and executable CategoryMutations.
    """
    _ = violations
    current_total = round(sum(c.estimated_amount for c in categories), 2)
    overflow = max(0.0, round(current_total - profile.total_budget_limit, 2))
    target_savings = overflow if overflow > 0 else round(current_total * 0.12, 0)

    protected_cats, flexible_cats = _partition_categories_by_priority(
        categories, profile.priority_ranking
    )

    opt_a = _build_priority_shield_option(
        profile, categories, protected_cats, flexible_cats, current_total, target_savings
    )
    opt_b = _build_per_capita_option(profile, categories, current_total)
    opt_c = _build_guest_cap_option(profile, categories, current_total)

    return [opt_a, opt_b, opt_c]


def _build_heuristic_scout_vendors(
    profile: ConstraintProfileSchema,
    category: BudgetCategorySchema,
    custom_focus: Optional[str] = None,
) -> List[VendorCandidateSchema]:
    """Generate 2 regionally calibrated fallback VendorCandidates for a category."""
    symbol = CURRENCY_SYMBOLS.get(profile.currency_code, "₹")
    suffix = uuid.uuid4().hex[:4]
    focus_label = f" ({custom_focus})" if custom_focus else ""
    short_label = category.name.split("&")[0].strip()
    baseline_est = calculate_category_estimate(category, profile.guest_count)

    return [
        VendorCandidateSchema(
            id=f"ven-scout-{suffix}-1",
            category_id=category.id,
            category_name=category.name,
            name=f"{profile.location_city} Royal Atelier — {short_label}{focus_label}",
            pricing_model=category.pricing_model,
            base_cost=round(category.base_cost * 0.90, 0),
            per_head_cost=round((category.per_head_cost or category.tier_cost) * 0.90, 0),
            max_capacity=max(profile.guest_count + 40, 150),
            lead_time_days=30,
            tradeoff_notes=(
                f"Saves ~10% vs baseline ({symbol}{baseline_est * 0.90:,.0f} "
                f"total at {profile.guest_count} guests); flexible weather rescheduling clause included."
            ),
            selection_status=SelectionStatus.SHORTLISTED,
        ),
        VendorCandidateSchema(
            id=f"ven-scout-{suffix}-2",
            category_id=category.id,
            category_name=category.name,
            name=f"Bespoke Collective {profile.location_city} — {short_label}",
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


def realign_run_of_show_to_sunset(
    run_of_show: List[RunOfShowItemSchema],
    weather: WeatherContextSchema,
    location_city: str,
) -> List[RunOfShowItemSchema]:
    """
    Realign outdoor and golden-hour RunOfShowItems whenever event_date or WeatherContext.sunset_time_local changes.
    """
    sunset_str = weather.sunset_time_local or "18:10"
    sh, sm = _parse_sunset_hour_min(sunset_str)
    golden_hour_start = f"{max(0, sh - 1):02d}:{sm:02d}"
    post_sunset_start = f"{min(23, sh):02d}:{sm:02d}"

    realigned: List[RunOfShowItemSchema] = []
    for idx, item in enumerate(run_of_show):
        if idx == 1 or "golden" in item.title.lower() or "sunset" in item.title.lower():
            realigned.append(
                item.model_copy(
                    update={
                        "start_time": golden_hour_start,
                        "notes": (
                            f"Anchored 60 mins before {sunset_str} local sunset in {location_city}. "
                            + (
                                "Keep waterproof shamiana/verandah backup ready."
                                if weather.outdoor_risk_level != OutdoorRiskLevel.LOW
                                else "Optimal natural light window."
                            )
                        ),
                    }
                )
            )
        elif idx == 2:
            realigned.append(item.model_copy(update={"start_time": post_sunset_start}))
        else:
            realigned.append(item)
    return realigned


def _build_heuristic_chat_reply(
    profile: ConstraintProfileSchema,
    categories: List[BudgetCategorySchema],
    violations: List[ConstraintViolationSchema],
    weather: WeatherContextSchema,
) -> Tuple[str, Optional[TradeoffOptionSchema]]:
    """Build a context-grounded coordinator response with an actionable TradeoffOption."""
    symbol = CURRENCY_SYMBOLS.get(profile.currency_code, "₹")
    total_est = sum(c.estimated_amount for c in categories)
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
    return reply, primary_tradeoff
