export type EventVertical = 'INTIMATE_WEDDING' | 'MILESTONE_BIRTHDAY' | 'COMMUNITY_EVENT';

export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';

export type PricingModel = 'FLAT_FEE' | 'PER_CAPITA' | 'TIERED_CAPACITY';

export type SelectionStatus = 'SHORTLISTED' | 'LOCKED' | 'REJECTED';

export type OutdoorRiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

export type ViolationType =
  | 'BUDGET_OVERFLOW'
  | 'CATEGORY_OVERFLOW'
  | 'VENUE_CAPACITY_EXCEEDED'
  | 'LEAD_TIME_COMPRESSED'
  | 'WEATHER_CONTINGENCY_MISSING';

export type ViolationSeverity = 'WARNING' | 'CRITICAL';

export interface ConstraintProfile {
  event_vertical: EventVertical;
  currency_code: CurrencyCode;
  total_budget_limit: number;
  guest_count: number;
  event_date: string;
  location_city: string;
  venue_capacity_min: number;
  dietary_restrictions: string[];
  vibe_tags: string[];
  priority_ranking: string[];
}

export interface BudgetCategory {
  id: string;
  name: string;
  allocated_amount: number;
  committed_amount: number;
  estimated_amount: number;
  pricing_model: PricingModel;
  base_cost: number;
  per_head_cost: number;
  tier_step: number;
  tier_cost: number;
  notes: string;
}

export interface VendorCandidate {
  id: string;
  category_id: string;
  category_name: string;
  name: string;
  pricing_model: PricingModel;
  base_cost: number;
  per_head_cost: number;
  max_capacity: number;
  lead_time_days: number;
  tradeoff_notes: string;
  selection_status: SelectionStatus;
}

export interface MilestoneTask {
  id: string;
  title: string;
  days_before_event: number;
  due_date: string;
  category_name: string;
  critical_path: boolean;
  completed: boolean;
  depends_on: string[];
  is_compressed: boolean;
}

export interface RunOfShowItem {
  id: string;
  start_time: string;
  duration_minutes: number;
  title: string;
  category_name: string;
  is_outdoor: boolean;
  notes: string;
}

export interface WeatherContext {
  location_city: string;
  event_date: string;
  latitude: number;
  longitude: number;
  temp_high_c: number;
  temp_low_c: number;
  precipitation_prob_pct: number;
  sunset_time_local: string;
  outdoor_risk_level: OutdoorRiskLevel;
  advisory_note: string;
}

export interface ConstraintViolation {
  id: string;
  violation_type: ViolationType;
  severity: ViolationSeverity;
  title: string;
  description: string;
  affected_category_id?: string | null;
  overflow_amount: number;
}

export interface CategoryMutation {
  category_id: string;
  category_name: string;
  previous_allocated: number;
  new_allocated: number;
  previous_base_cost: number;
  new_base_cost: number;
  previous_per_head_cost: number;
  new_per_head_cost: number;
  new_tier_cost?: number | null;
  change_rationale: string;
}

export interface TradeoffOption {
  id: string;
  title: string;
  badge: string;
  summary: string;
  financial_delta: number;
  new_total_estimated: number;
  pros: string[];
  cons: string[];
  mutations: CategoryMutation[];
  suggested_guest_count?: number | null;
  suggested_budget_limit?: number | null;
  suggested_event_date?: string | null;
}

export interface PlanSnapshot {
  id: string;
  created_at: string;
  label: string;
  guest_count: number;
  total_budget_limit: number;
  event_date: string;
  total_estimated: number;
}

export interface CoordinatorChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  active_model: string;
  suggested_tradeoff?: TradeoffOption | null;
}

export interface EventPlan {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  active_model: string;
  coordinator_mode: 'live_gemini' | 'resilient_coordinator';
  constraint_profile: ConstraintProfile;
  weather_context: WeatherContext;
  categories: BudgetCategory[];
  vendors: VendorCandidate[];
  milestones: MilestoneTask[];
  run_of_show: RunOfShowItem[];
  violations: ConstraintViolation[];
  snapshots: PlanSnapshot[];
  chat_history: CoordinatorChatTurn[];
}

export interface WhatIfRequest {
  guest_count: number;
  total_budget_limit: number;
  event_date: string;
  priority_ranking?: string[];
}

export interface WhatIfEvaluationResponse {
  baseline_total_estimated: number;
  what_if_total_estimated: number;
  budget_delta: number;
  updated_categories: BudgetCategory[];
  updated_milestones: MilestoneTask[];
  violations: ConstraintViolation[];
  tradeoff_options: TradeoffOption[];
  active_model: string;
  coordinator_mode: string;
}

export interface SystemStatusResponse {
  default_currency: CurrencyCode;
  model_cascade: string[];
  api_key_configured: boolean;
  coordinator_mode: string;
}
