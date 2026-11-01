"""Gemini 3 5-model cascade orchestrator with deterministic heuristic coordinator fallback."""

from __future__ import annotations

from functools import lru_cache
import logging
import os
import uuid
from typing import Any, Callable, List, Optional, Tuple, Type, TypeVar
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.domain.schemas import (
    BudgetCategorySchema,
    ConstraintProfileSchema,
    ConstraintViolationSchema,
    MilestoneTaskSchema,
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
from app.services.heuristic_coordinator import (
    CURRENCY_SYMBOLS,
    LLMChatResponse,
    LLMInitialPlanBlueprint,
    LLMRunOfShowDeck,
    LLMTradeoffDeck,
    LLMVendorScoutList,
    _build_heuristic_chat_reply,
    _build_heuristic_initial_plan,
    _build_heuristic_scout_vendors,
    _build_heuristic_tradeoffs,
    realign_run_of_show_to_sunset,
)

logger = logging.getLogger(__name__)

DEFAULT_MODEL_CASCADE: List[str] = [
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
]

RESILIENT_MODE = "resilient_coordinator"
LIVE_GEMINI_MODE = "live_gemini"
STRUCTURED_OUTPUT_TEMPERATURE = 0.35

T = TypeVar("T", bound=BaseModel)


class CoordinatorSettings(BaseSettings):
    """Environment-backed configuration for the Gemini API key and model cascade."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
    gemini_api_key: str = ""
    gemini_model_cascade: str = ""


@lru_cache(maxsize=1)
def _get_cached_settings() -> CoordinatorSettings:
    """Load CoordinatorSettings from disk once and cache across requests."""
    return CoordinatorSettings()


@lru_cache(maxsize=8)
def _get_cached_genai_client(api_key: str) -> Any:
    """Create and reuse a google.genai Client instance per API key."""
    from google import genai

    return genai.Client(api_key=api_key)


def get_model_cascade() -> List[str]:
    """Return the configured 5-model Gemini cascade in priority order."""
    settings = _get_cached_settings()
    env_val = (os.environ.get("GEMINI_MODEL_CASCADE") or settings.gemini_model_cascade).strip()
    if env_val:
        models = [m.strip() for m in env_val.split(",") if m.strip()]
        if models:
            return models
    return list(DEFAULT_MODEL_CASCADE)


def resolve_api_key(header_key: Optional[str] = None) -> Optional[str]:
    """Resolve Gemini API key from request header, environment, or .env configuration."""
    if header_key and header_key.strip():
        return header_key.strip()
    settings = _get_cached_settings()
    env_key = (os.environ.get("GEMINI_API_KEY") or settings.gemini_api_key).strip()
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
        return None, RESILIENT_MODE, RESILIENT_MODE

    cascade = custom_cascade or get_model_cascade()

    try:
        client = (
            client_factory(resolved_key)
            if client_factory is not None
            else _get_cached_genai_client(resolved_key)
        )
    except Exception as exc:
        logger.warning("Failed to initialize Gemini client; using resilient coordinator: %s", exc)
        return None, RESILIENT_MODE, RESILIENT_MODE

    for model_name in cascade:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_schema": response_schema,
                    "temperature": STRUCTURED_OUTPUT_TEMPERATURE,
                },
            )
            if getattr(response, "parsed", None) is not None:
                parsed = response.parsed
                if isinstance(parsed, response_schema):
                    return parsed, model_name, LIVE_GEMINI_MODE
                return response_schema.model_validate(parsed), model_name, LIVE_GEMINI_MODE
            if getattr(response, "text", None):
                return response_schema.model_validate_json(response.text), model_name, LIVE_GEMINI_MODE
        except Exception as exc:
            logger.info("Model '%s' failed in cascade (%s); advancing to next tier.", model_name, exc)
            continue

    return None, RESILIENT_MODE, RESILIENT_MODE


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

    return _build_heuristic_scout_vendors(profile, category, custom_focus), model_name, mode


def optimize_timeline_schedule(
    profile: ConstraintProfileSchema,
    weather: WeatherContextSchema,
    milestones: List[MilestoneTaskSchema],
    run_of_show: List[RunOfShowItemSchema],
    api_key: Optional[str] = None,
) -> Tuple[List[MilestoneTaskSchema], List[RunOfShowItemSchema], str, str]:
    """
    Recalculate MilestoneTask countdowns and optimize RunOfShowItem schedule around local sunset and weather risk via ModelCascade.
    """
    updated_milestones = recalculate_milestones_for_date(milestones, profile.event_date)
    prompt = (
        f"Optimize the 4-block day-of Run-of-Show schedule for a {profile.guest_count}-guest {profile.event_vertical.value} "
        f"in {profile.location_city} on {profile.event_date}. Local sunset is at {weather.sunset_time_local} and outdoor "
        f"weather risk is {weather.outdoor_risk_level.value} ({weather.precipitation_prob_pct:.0f}% rain probability)."
    )
    parsed, model_name, mode = invoke_gemini_cascade(
        prompt=prompt,
        response_schema=LLMRunOfShowDeck,
        api_key=api_key,
    )
    if parsed is not None and len(parsed.run_of_show) >= 3:
        return updated_milestones, parsed.run_of_show, model_name, mode

    realigned_ros = realign_run_of_show_to_sunset(run_of_show, weather, profile.location_city)
    return updated_milestones, realigned_ros, model_name, mode


def chat_with_coordinator(
    message: str,
    profile: ConstraintProfileSchema,
    categories: List[BudgetCategorySchema],
    violations: List[ConstraintViolationSchema],
    weather: WeatherContextSchema,
    vendors: Optional[List[VendorCandidateSchema]] = None,
    run_of_show: Optional[List[RunOfShowItemSchema]] = None,
    api_key: Optional[str] = None,
) -> Tuple[str, Optional[TradeoffOptionSchema], str, str]:
    """
    Answer a Host's question in the AI Coordinator Chat Drawer grounded in the active EventPlan state,
    returning markdown advice and an executable TradeoffOption card when appropriate.
    """
    symbol = CURRENCY_SYMBOLS.get(profile.currency_code, "₹")
    total_est = sum(c.estimated_amount for c in categories)
    cat_summary = "; ".join(
        f"{c.name}: alloc={symbol}{c.allocated_amount:,.0f}, est={symbol}{c.estimated_amount:,.0f} ({c.pricing_model.value})"
        for c in categories
    )
    vendor_summary = "; ".join(
        f"{v.name} [{v.category_name}, {v.selection_status.value}, max_cap={v.max_capacity}]"
        for v in (vendors or [])
    )
    ros_summary = "; ".join(
        f"{r.start_time} {r.title} ({'Outdoor' if r.is_outdoor else 'Indoor'})"
        for r in (run_of_show or [])
    )
    viol_summary = "; ".join(f"{v.violation_type.value}: {v.title}" for v in violations) or "None"

    prompt = (
        f"You are the AI Celebration Coordinator for an event in {profile.location_city} on {profile.event_date}.\n"
        f"Current Plan Context: {profile.guest_count} guests, Budget Limit {symbol}{profile.total_budget_limit:,.0f}, "
        f"Current Estimated Spend {symbol}{total_est:,.0f}, Priorities: {', '.join(profile.priority_ranking)}.\n"
        f"WeatherContext: Sunset {weather.sunset_time_local}, Outdoor Risk {weather.outdoor_risk_level.value} "
        f"({weather.precipitation_prob_pct:.0f}% rain prob).\n"
        f"BudgetCategories: {cat_summary}\n"
        f"VendorCandidates: {vendor_summary}\n"
        f"RunOfShowItems: {ros_summary}\n"
        f"Active Violations ({len(violations)}): {viol_summary}\n"
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

    reply, primary_tradeoff = _build_heuristic_chat_reply(profile, categories, violations, weather)
    return reply, primary_tradeoff, model_name, mode


__all__ = [
    "CURRENCY_SYMBOLS",
    "CoordinatorSettings",
    "DEFAULT_MODEL_CASCADE",
    "LLMChatResponse",
    "LLMInitialPlanBlueprint",
    "LLMRunOfShowDeck",
    "LLMTradeoffDeck",
    "LLMVendorScoutList",
    "_build_heuristic_initial_plan",
    "_build_heuristic_tradeoffs",
    "chat_with_coordinator",
    "generate_initial_plan",
    "get_model_cascade",
    "invoke_gemini_cascade",
    "optimize_timeline_schedule",
    "propose_tradeoffs",
    "realign_run_of_show_to_sunset",
    "resolve_api_key",
    "scout_vendors_for_category",
]
