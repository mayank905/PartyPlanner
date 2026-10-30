# 02: Deterministic Constraint Engine & What-If Simulator UI

**What to build:** Enable a Host to interactively adjust core constraints (`guest_count`, `total_budget_limit`, `event_date`, and `priority_ranking`) in a non-destructive `WhatIfScenario` control bar and immediately see how `FLAT_FEE`, `PER_CAPITA`, and `TIERED_CAPACITY` `BudgetCategory` costs scale, along with explicit `ConstraintViolation` alerts (`BUDGET_OVERFLOW`, `CATEGORY_OVERFLOW`, `VENUE_CAPACITY_EXCEEDED`, `LEAD_TIME_COMPRESSED`, `WEATHER_CONTINGENCY_MISSING`) without silently overwriting the committed `EventPlan`.

**Blocked by:** 01: Walking Skeleton & Constraint-First Plan Creation

**Status:** completed

- [x] Adjusting `guest_count`, `total_budget_limit`, or `event_date` in the What-If Simulator recalculates `PER_CAPITA` (`base_cost + per_head_cost * guest_count`), `FLAT_FEE` (`base_cost`), and `TIERED_CAPACITY` (`base_cost + ceil(guest_count / tier_step) * tier_cost`) line items deterministically.
- [x] Any resulting conflicts are surfaced as structured `ConstraintViolation` banners in the UI (with `aria-live="polite"` accessibility announcements) showing exact monetary or capacity deltas in the plan's `CurrencyCode`.
- [x] The committed `EventPlan` in SQLite remains untouched while the Host explores changes in the `WhatIfScenario` sandbox until they explicitly commit or reset.
- [x] Automated tests verify deterministic pricing formulas and `ConstraintViolation` detection across boundary thresholds.
