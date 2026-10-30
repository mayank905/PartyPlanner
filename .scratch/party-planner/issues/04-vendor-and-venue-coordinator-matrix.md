# 04: Vendor & Venue Coordinator Matrix & Live Scouting

**What to build:** Enable a Host to browse, compare, scout, shortlist, and lock `VendorCandidate`s across `BudgetCategory` buckets. Each `VendorCandidate` displays its `PricingModel`, `base_cost`, `per_head_cost`, `max_capacity`, `lead_time_days`, and coordinator `tradeoff_notes` calibrated to the plan's `CurrencyCode` (default `INR ₹`) and `location_city`. Locking a `VendorCandidate` updates the category's committed spend and enforces capacity and lead-time constraints against the `ConstraintProfile`.

**Blocked by:** 02: Deterministic Constraint Engine & What-If Simulator UI

**Status:** completed

- [x] The Vendor & Venue Coordinator tab displays `VendorCandidate` comparison cards per `BudgetCategory` with explicit per-head vs. flat-fee math for the active `guest_count` and `CurrencyCode`.
- [x] Host can trigger on-demand AI Vendor Scouting for any category (using `ModelCascade` with Google Search grounding when available, or regionally calibrated fallback data) to discover new `VendorCandidate`s in `location_city`.
- [x] Changing a vendor's status to `LOCKED` updates the `BudgetCategory` committed spend and immediately triggers a `VENUE_CAPACITY_EXCEEDED` or `LEAD_TIME_COMPRESSED` `ConstraintViolation` if `guest_count > max_capacity` or `days_until_event < lead_time_days`.
- [x] Automated tests verify vendor status transitions, on-demand vendor scouting, and capacity/lead-time violation triggers.
