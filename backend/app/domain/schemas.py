from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class EventVertical(str, Enum):
    INTIMATE_WEDDING = "INTIMATE_WEDDING"
    MILESTONE_BIRTHDAY = "MILESTONE_BIRTHDAY"
    COMMUNITY_EVENT = "COMMUNITY_EVENT"


class CurrencyCode(str, Enum):
    INR = "INR"
    USD = "USD"
    EUR = "EUR"
    GBP = "GBP"


class PricingModel(str, Enum):
    FLAT_FEE = "FLAT_FEE"
    PER_CAPITA = "PER_CAPITA"
    TIERED_CAPACITY = "TIERED_CAPACITY"


class SelectionStatus(str, Enum):
    SHORTLISTED = "SHORTLISTED"
    LOCKED = "LOCKED"
    REJECTED = "REJECTED"


class OutdoorRiskLevel(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"


class ViolationType(str, Enum):
    BUDGET_OVERFLOW = "BUDGET_OVERFLOW"
    CATEGORY_OVERFLOW = "CATEGORY_OVERFLOW"
    VENUE_CAPACITY_EXCEEDED = "VENUE_CAPACITY_EXCEEDED"
    LEAD_TIME_COMPRESSED = "LEAD_TIME_COMPRESSED"
    WEATHER_CONTINGENCY_MISSING = "WEATHER_CONTINGENCY_MISSING"


class ViolationSeverity(str, Enum):
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class ConstraintProfileSchema(BaseModel):
    event_vertical: EventVertical = EventVertical.INTIMATE_WEDDING
    currency_code: CurrencyCode = CurrencyCode.INR
    total_budget_limit: float = Field(..., gt=0)
    guest_count: int = Field(..., gt=0)
    event_date: str
    location_city: str = Field(..., min_length=1)
    venue_capacity_min: int = Field(default=50, gt=0)
    dietary_restrictions: List[str] = Field(default_factory=list)
    vibe_tags: List[str] = Field(default_factory=list)
    priority_ranking: List[str] = Field(default_factory=list)


class BudgetCategorySchema(BaseModel):
    id: str
    name: str
    allocated_amount: float
    committed_amount: float = 0.0
    estimated_amount: float
    pricing_model: PricingModel
    base_cost: float
    per_head_cost: float = 0.0
    tier_step: int = 50
    tier_cost: float = 0.0
    notes: str = ""


class VendorCandidateSchema(BaseModel):
    id: str
    category_id: str
    category_name: str
    name: str
    pricing_model: PricingModel
    base_cost: float
    per_head_cost: float = 0.0
    max_capacity: int = 200
    lead_time_days: int = 30
    tradeoff_notes: str
    selection_status: SelectionStatus = SelectionStatus.SHORTLISTED


class MilestoneTaskSchema(BaseModel):
    id: str
    title: str
    days_before_event: int
    due_date: str
    category_name: str
    critical_path: bool = True
    completed: bool = False
    depends_on: List[str] = Field(default_factory=list)
    is_compressed: bool = False


class RunOfShowItemSchema(BaseModel):
    id: str
    start_time: str
    duration_minutes: int
    title: str
    category_name: str
    is_outdoor: bool = False
    notes: str = ""


class WeatherContextSchema(BaseModel):
    location_city: str
    event_date: str
    latitude: float = 24.5854
    longitude: float = 73.7125
    temp_high_c: float = 28.0
    temp_low_c: float = 17.0
    precipitation_prob_pct: float = 15.0
    sunset_time_local: str = "18:10"
    outdoor_risk_level: OutdoorRiskLevel = OutdoorRiskLevel.LOW
    advisory_note: str = "Pleasant conditions for golden-hour ceremonies."


class ConstraintViolationSchema(BaseModel):
    id: str
    violation_type: ViolationType
    severity: ViolationSeverity
    title: str
    description: str
    affected_category_id: Optional[str] = None
    overflow_amount: float = 0.0


class CategoryMutationSchema(BaseModel):
    category_id: str
    category_name: str
    previous_allocated: float
    new_allocated: float
    previous_base_cost: float
    new_base_cost: float
    previous_per_head_cost: float
    new_per_head_cost: float
    change_rationale: str


class TradeoffOptionSchema(BaseModel):
    id: str
    title: str
    badge: str = "Recommended Coordinator Path"
    summary: str
    financial_delta: float
    new_total_estimated: float
    pros: List[str] = Field(default_factory=list)
    cons: List[str] = Field(default_factory=list)
    mutations: List[CategoryMutationSchema] = Field(default_factory=list)
    suggested_guest_count: Optional[int] = None
    suggested_budget_limit: Optional[float] = None
    suggested_event_date: Optional[str] = None


class PlanSnapshotSchema(BaseModel):
    id: str
    created_at: str
    label: str
    guest_count: int
    total_budget_limit: float
    event_date: str
    total_estimated: float


class CoordinatorChatTurnSchema(BaseModel):
    id: str
    role: str  # "user" | "assistant"
    content: str
    created_at: str
    active_model: str = "resilient_coordinator"
    suggested_tradeoff: Optional[TradeoffOptionSchema] = None


class EventPlanResponseSchema(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    active_model: str
    coordinator_mode: str  # "live_gemini" | "resilient_coordinator"
    constraint_profile: ConstraintProfileSchema
    weather_context: WeatherContextSchema
    categories: List[BudgetCategorySchema]
    vendors: List[VendorCandidateSchema]
    milestones: List[MilestoneTaskSchema]
    run_of_show: List[RunOfShowItemSchema]
    violations: List[ConstraintViolationSchema]
    snapshots: List[PlanSnapshotSchema]
    chat_history: List[CoordinatorChatTurnSchema]


class CreatePlanRequestSchema(BaseModel):
    title: str = Field(..., min_length=1)
    constraint_profile: ConstraintProfileSchema


class WhatIfRequestSchema(BaseModel):
    guest_count: int = Field(..., gt=0)
    total_budget_limit: float = Field(..., gt=0)
    event_date: str
    priority_ranking: Optional[List[str]] = None


class WhatIfEvaluationResponseSchema(BaseModel):
    baseline_total_estimated: float
    what_if_total_estimated: float
    budget_delta: float
    updated_categories: List[BudgetCategorySchema]
    updated_milestones: List[MilestoneTaskSchema]
    violations: List[ConstraintViolationSchema]
    tradeoff_options: List[TradeoffOptionSchema]
    active_model: str
    coordinator_mode: str


class ApplyTradeoffRequestSchema(BaseModel):
    what_if_constraints: WhatIfRequestSchema
    tradeoff_option: TradeoffOptionSchema


class VendorStatusUpdateRequestSchema(BaseModel):
    selection_status: SelectionStatus


class ScoutVendorsRequestSchema(BaseModel):
    category_id: str
    custom_focus: Optional[str] = None


class ChatRequestSchema(BaseModel):
    message: str = Field(..., min_length=1)
