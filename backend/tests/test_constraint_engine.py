from datetime import date, timedelta
from app.domain.schemas import (
    BudgetCategorySchema,
    ConstraintProfileSchema,
    CurrencyCode,
    EventVertical,
    MilestoneTaskSchema,
    PricingModel,
    SelectionStatus,
    VendorCandidateSchema,
    ViolationSeverity,
    ViolationType,
    WeatherContextSchema,
    OutdoorRiskLevel,
)
from app.services.constraint_engine import (
    calculate_category_estimate,
    evaluate_plan_constraints,
    recalculate_milestones_for_date,
)


def test_pricing_models_scale_accurately_with_guest_count():
    """Verify FLAT_FEE, PER_CAPITA, and TIERED_CAPACITY deterministic formulas."""
    flat_cat = BudgetCategorySchema(
        id="cat-photo",
        name="Photography & Cinema",
        allocated_amount=150000,
        committed_amount=0,
        estimated_amount=120000,
        pricing_model=PricingModel.FLAT_FEE,
        base_cost=120000,
        per_head_cost=0,
        tier_step=50,
        tier_cost=0,
    )
    per_capita_cat = BudgetCategorySchema(
        id="cat-catering",
        name="Catering & Royal Feast",
        allocated_amount=400000,
        committed_amount=0,
        estimated_amount=330000,
        pricing_model=PricingModel.PER_CAPITA,
        base_cost=50000,
        per_head_cost=3500,
        tier_step=50,
        tier_cost=0,
    )
    tiered_cat = BudgetCategorySchema(
        id="cat-venue",
        name="Venue & Mandap Lawn",
        allocated_amount=350000,
        committed_amount=0,
        estimated_amount=300000,
        pricing_model=PricingModel.TIERED_CAPACITY,
        base_cost=200000,
        per_head_cost=0,
        tier_step=50,
        tier_cost=50000,
    )

    # At 80 guests:
    # Flat = 120,000
    # Per Capita = 50,000 + (3,500 * 80) = 330,000
    # Tiered = 200,000 + ceil(80/50)*50,000 = 200,000 + 2*50,000 = 300,000
    assert calculate_category_estimate(flat_cat, guest_count=80) == 120000
    assert calculate_category_estimate(per_capita_cat, guest_count=80) == 330000
    assert calculate_category_estimate(tiered_cat, guest_count=80) == 300000

    # At 120 guests:
    # Flat remains 120,000
    # Per Capita = 50,000 + (3,500 * 120) = 470,000
    # Tiered = 200,000 + ceil(120/50)*50,000 = 200,000 + 3*50,000 = 350,000
    assert calculate_category_estimate(flat_cat, guest_count=120) == 120000
    assert calculate_category_estimate(per_capita_cat, guest_count=120) == 470000
    assert calculate_category_estimate(tiered_cat, guest_count=120) == 350000


def test_evaluate_plan_constraints_detects_budget_venue_leadtime_and_weather_violations():
    """Verify all ConstraintViolation types are surfaced when constraints change."""
    today = date(2026, 10, 30)
    # Event is only 30 days away
    event_date = today + timedelta(days=30)

    profile = ConstraintProfileSchema(
        event_vertical=EventVertical.INTIMATE_WEDDING,
        currency_code=CurrencyCode.INR,
        total_budget_limit=800000,  # ₹8,00,000 limit
        guest_count=120,
        event_date=event_date.isoformat(),
        location_city="Udaipur",
        venue_capacity_min=120,
        dietary_restrictions=["Jain", "Vegan"],
        vibe_tags=["Heritage Courtyard", "Sunset Sangeet"],
        priority_ranking=["Catering & Royal Feast", "Photography & Cinema", "Venue & Mandap Lawn", "Decor & Florals"],
    )

    categories = [
        BudgetCategorySchema(
            id="cat-venue",
            name="Venue & Mandap Lawn",
            allocated_amount=300000,
            committed_amount=350000,
            estimated_amount=300000,
            pricing_model=PricingModel.TIERED_CAPACITY,
            base_cost=200000,
            per_head_cost=0,
            tier_step=50,
            tier_cost=50000,
        ),
        BudgetCategorySchema(
            id="cat-catering",
            name="Catering & Royal Feast",
            allocated_amount=350000,
            committed_amount=0,
            estimated_amount=330000,
            pricing_model=PricingModel.PER_CAPITA,
            base_cost=50000,
            per_head_cost=3500,
            tier_step=50,
            tier_cost=0,
        ),
        BudgetCategorySchema(
            id="cat-photo",
            name="Photography & Cinema",
            allocated_amount=150000,
            committed_amount=0,
            estimated_amount=120000,
            pricing_model=PricingModel.FLAT_FEE,
            base_cost=120000,
            per_head_cost=0,
            tier_step=50,
            tier_cost=0,
        ),
    ]

    # Locked venue only supports 100 guests and requires 60 days lead time
    vendors = [
        VendorCandidateSchema(
            id="ven-1",
            category_id="cat-venue",
            category_name="Venue & Mandap Lawn",
            name="Lakeview Haveli Courtyard",
            pricing_model=PricingModel.TIERED_CAPACITY,
            base_cost=200000,
            per_head_cost=0,
            max_capacity=100,
            lead_time_days=60,
            tradeoff_notes="Intimate heritage courtyard capped at 100 guests.",
            selection_status=SelectionStatus.LOCKED,
        )
    ]

    weather = WeatherContextSchema(
        location_city="Udaipur",
        event_date=event_date.isoformat(),
        temp_high_c=29.0,
        temp_low_c=18.0,
        precipitation_prob_pct=65.0,
        sunset_time_local="17:42",
        outdoor_risk_level=OutdoorRiskLevel.HIGH,
        advisory_note="High unseasonal rain probability; waterproof shamiana/tent required.",
    )

    updated_cats, violations = evaluate_plan_constraints(
        profile=profile,
        categories=categories,
        vendors=vendors,
        weather=weather,
        reference_date=today,
    )

    # Total estimated at 120 guests = 350,000 + 470,000 + 120,000 = 940,000 (> 800,000 limit by 140,000)
    total_estimated = sum(c.estimated_amount for c in updated_cats)
    assert total_estimated == 940000

    violation_types = {v.violation_type for v in violations}
    assert ViolationType.BUDGET_OVERFLOW in violation_types
    assert ViolationType.VENUE_CAPACITY_EXCEEDED in violation_types
    assert ViolationType.LEAD_TIME_COMPRESSED in violation_types
    assert ViolationType.WEATHER_CONTINGENCY_MISSING in violation_types

    budget_v = next(v for v in violations if v.violation_type == ViolationType.BUDGET_OVERFLOW)
    assert budget_v.overflow_amount == 140000
    assert budget_v.severity == ViolationSeverity.CRITICAL


def test_recalculate_milestones_flags_compressed_critical_path():
    """Moving event_date closer shifts due_dates and flags tasks whose due date is now in the past."""
    today = date(2026, 10, 30)
    near_event = today + timedelta(days=20)

    milestones = [
        MilestoneTaskSchema(
            id="ms-1",
            title="Lock Heritage Venue & Pay Deposit",
            days_before_event=90,
            due_date="2026-12-01",
            category_name="Venue & Mandap Lawn",
            critical_path=True,
            completed=False,
            depends_on=[],
            is_compressed=False,
        ),
        MilestoneTaskSchema(
            id="ms-2",
            title="Confirm Final Guest Headcount with Caterer",
            days_before_event=10,
            due_date="2027-02-18",
            category_name="Catering & Royal Feast",
            critical_path=True,
            completed=False,
            depends_on=["ms-1"],
            is_compressed=False,
        ),
    ]

    updated = recalculate_milestones_for_date(
        milestones=milestones,
        event_date_str=near_event.isoformat(),
        reference_date=today,
    )

    # ms-1 requires 90 days before event, so due_date < today -> is_compressed=True
    assert updated[0].is_compressed is True
    assert updated[0].due_date == (near_event - timedelta(days=90)).isoformat()
    # ms-2 requires 10 days before event, due in 10 days -> is_compressed=False
    assert updated[1].is_compressed is False
    assert updated[1].due_date == (near_event - timedelta(days=10)).isoformat()
