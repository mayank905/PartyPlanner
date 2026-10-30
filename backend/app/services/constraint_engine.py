from __future__ import annotations

import math
from datetime import date, timedelta
from typing import List, Optional, Tuple

from app.domain.schemas import (
    BudgetCategorySchema,
    ConstraintProfileSchema,
    ConstraintViolationSchema,
    MilestoneTaskSchema,
    OutdoorRiskLevel,
    PricingModel,
    SelectionStatus,
    VendorCandidateSchema,
    ViolationSeverity,
    ViolationType,
    WeatherContextSchema,
)


def calculate_category_estimate(category: BudgetCategorySchema, guest_count: int) -> float:
    """
    Deterministically compute estimated cost for a BudgetCategory based on its PricingModel.
    - FLAT_FEE: base_cost
    - PER_CAPITA: base_cost + (per_head_cost * guest_count)
    - TIERED_CAPACITY: base_cost + ceil(guest_count / tier_step) * tier_cost
    """
    if category.pricing_model == PricingModel.FLAT_FEE:
        return round(category.base_cost, 2)
    if category.pricing_model == PricingModel.PER_CAPITA:
        return round(category.base_cost + (category.per_head_cost * guest_count), 2)
    if category.pricing_model == PricingModel.TIERED_CAPACITY:
        step = max(1, category.tier_step)
        tiers = math.ceil(guest_count / step)
        return round(category.base_cost + (tiers * category.tier_cost), 2)
    return round(category.base_cost, 2)


def calculate_vendor_estimate(vendor: VendorCandidateSchema, guest_count: int) -> float:
    """Compute a vendor's total quote for the active guest count."""
    if vendor.pricing_model == PricingModel.FLAT_FEE:
        return round(vendor.base_cost, 2)
    if vendor.pricing_model == PricingModel.PER_CAPITA:
        return round(vendor.base_cost + (vendor.per_head_cost * guest_count), 2)
    if vendor.pricing_model == PricingModel.TIERED_CAPACITY:
        tiers = math.ceil(guest_count / 50)
        return round(vendor.base_cost + (tiers * vendor.per_head_cost), 2)
    return round(vendor.base_cost, 2)


def recalculate_milestones_for_date(
    milestones: List[MilestoneTaskSchema],
    event_date_str: str,
    reference_date: Optional[date] = None,
) -> List[MilestoneTaskSchema]:
    """
    Re-anchor MilestoneTask due dates relative to event_date and flag compressed tasks
    whose target due_date is earlier than reference_date and not yet completed.
    """
    ref = reference_date or date.today()
    try:
        ev_date = date.fromisoformat(event_date_str[:10])
    except ValueError:
        ev_date = ref + timedelta(days=90)

    updated: List[MilestoneTaskSchema] = []
    for ms in milestones:
        due = ev_date - timedelta(days=ms.days_before_event)
        is_compressed = (not ms.completed) and (due < ref)
        updated.append(
            ms.model_copy(
                update={
                    "due_date": due.isoformat(),
                    "is_compressed": is_compressed,
                }
            )
        )
    return updated


def evaluate_plan_constraints(
    profile: ConstraintProfileSchema,
    categories: List[BudgetCategorySchema],
    vendors: List[VendorCandidateSchema],
    weather: WeatherContextSchema,
    reference_date: Optional[date] = None,
) -> Tuple[List[BudgetCategorySchema], List[ConstraintViolationSchema]]:
    """
    Re-evaluate all BudgetCategory estimates for profile.guest_count and detect all
    ConstraintViolations (BUDGET_OVERFLOW, CATEGORY_OVERFLOW, VENUE_CAPACITY_EXCEEDED,
    LEAD_TIME_COMPRESSED, WEATHER_CONTINGENCY_MISSING).
    """
    ref = reference_date or date.today()
    try:
        ev_date = date.fromisoformat(profile.event_date[:10])
    except ValueError:
        ev_date = ref + timedelta(days=90)
    days_until_event = (ev_date - ref).days

    updated_categories: List[BudgetCategorySchema] = []
    violations: List[ConstraintViolationSchema] = []

    # Map locked vendors by category
    locked_by_category = {
        v.category_id: v for v in vendors if v.selection_status == SelectionStatus.LOCKED
    }

    for cat in categories:
        locked_vendor = locked_by_category.get(cat.id)
        cat_est = calculate_category_estimate(cat, profile.guest_count)
        if locked_vendor is not None:
            vendor_est = calculate_vendor_estimate(locked_vendor, profile.guest_count)
            est = max(cat_est, vendor_est)
            committed = est
        else:
            est = cat_est
            committed = cat.committed_amount

        new_cat = cat.model_copy(
            update={
                "estimated_amount": est,
                "committed_amount": committed,
            }
        )
        updated_categories.append(new_cat)

        if est > new_cat.allocated_amount * 1.05:
            overflow = round(est - new_cat.allocated_amount, 2)
            violations.append(
                ConstraintViolationSchema(
                    id=f"viol-cat-{cat.id}",
                    violation_type=ViolationType.CATEGORY_OVERFLOW,
                    severity=ViolationSeverity.WARNING,
                    title=f"{cat.name} Exceeds Category Allocation",
                    description=(
                        f"At {profile.guest_count} guests, {cat.name} ({cat.pricing_model.value}) "
                        f"scales to {est:,.0f} ({overflow:,.0f} above allocated {new_cat.allocated_amount:,.0f})."
                    ),
                    affected_category_id=cat.id,
                    overflow_amount=overflow,
                )
            )

    total_estimated = round(sum(c.estimated_amount for c in updated_categories), 2)
    if total_estimated > profile.total_budget_limit:
        overflow = round(total_estimated - profile.total_budget_limit, 2)
        violations.append(
            ConstraintViolationSchema(
                id="viol-total-budget",
                violation_type=ViolationType.BUDGET_OVERFLOW,
                severity=ViolationSeverity.CRITICAL,
                title="Total Celebration Budget Exceeded",
                description=(
                    f"Projected total spend is {total_estimated:,.0f} against your hard limit of "
                    f"{profile.total_budget_limit:,.0f} (overflow of {overflow:,.0f})."
                ),
                affected_category_id=None,
                overflow_amount=overflow,
            )
        )

    # Check locked or shortlisted venue capacity and vendor lead times
    for vendor in vendors:
        if vendor.selection_status == SelectionStatus.LOCKED:
            if profile.guest_count > vendor.max_capacity:
                violations.append(
                    ConstraintViolationSchema(
                        id=f"viol-cap-{vendor.id}",
                        violation_type=ViolationType.VENUE_CAPACITY_EXCEEDED,
                        severity=ViolationSeverity.CRITICAL,
                        title=f"Guest Count Exceeds {vendor.name} Max Capacity",
                        description=(
                            f"Locked vendor '{vendor.name}' holds at most {vendor.max_capacity} guests, "
                            f"but current guest count is {profile.guest_count} (+{profile.guest_count - vendor.max_capacity} over)."
                        ),
                        affected_category_id=vendor.category_id,
                        overflow_amount=float(profile.guest_count - vendor.max_capacity),
                    )
                )
            if days_until_event < vendor.lead_time_days:
                violations.append(
                    ConstraintViolationSchema(
                        id=f"viol-lead-{vendor.id}",
                        violation_type=ViolationType.LEAD_TIME_COMPRESSED,
                        severity=ViolationSeverity.WARNING,
                        title=f"Compressed Booking Lead Time for {vendor.name}",
                        description=(
                            f"'{vendor.name}' requires {vendor.lead_time_days} days lead time, "
                            f"but the event date is in {max(0, days_until_event)} days."
                        ),
                        affected_category_id=vendor.category_id,
                        overflow_amount=float(vendor.lead_time_days - days_until_event),
                    )
                )

    # Check weather contingency if outdoor risk is HIGH and no contingency/tent category covers it
    if weather.outdoor_risk_level == OutdoorRiskLevel.HIGH:
        has_contingency_cat = any(
            "contingency" in c.name.lower() or "tent" in c.name.lower() or "weather" in c.notes.lower()
            for c in updated_categories
        )
        if not has_contingency_cat:
            violations.append(
                ConstraintViolationSchema(
                    id="viol-weather-contingency",
                    violation_type=ViolationType.WEATHER_CONTINGENCY_MISSING,
                    severity=ViolationSeverity.WARNING,
                    title="High Outdoor Weather Risk Without Waterproof Contingency",
                    description=(
                        f"{weather.location_city} on {weather.event_date} shows {weather.precipitation_prob_pct:.0f}% "
                        f"rain risk. Add a waterproof shamiana/tent contingency buffer."
                    ),
                    affected_category_id=None,
                    overflow_amount=0.0,
                )
            )

    return updated_categories, violations
