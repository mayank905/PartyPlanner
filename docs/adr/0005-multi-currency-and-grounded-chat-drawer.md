# ADR 0005: Multi-Currency Regional Calibration & Context-Grounded AI Coordinator Chat Drawer

* **Status**: Accepted
* **Date**: 2026-10-30

## Context

1. Celebrations vary dramatically by region and currency (`USD $`, `INR ₹`, `EUR €`, `GBP £`). A 100-guest intimate wedding in Udaipur or Mumbai (`INR`) has different baseline per-head catering and venue structures than one in Austin (`USD`) or Lisbon (`EUR`).
2. Beyond structured sliders for budget, guest count, and date, hosts need a way to ask nuanced, context-specific questions (e.g., *"How can I negotiate the venue's corkage fee?"*, *"What if 15 guests are vegan and gluten-free?"*, *"Can we move the ceremony to 5:30 PM without losing natural light?"*) without losing connection to their structured plan state.

## Decision

1. **Per-Plan `CurrencyCode` (Defaulting to `INR ₹`, with `USD $`, `EUR €`, `GBP £` options) & Regional Cost Calibration**:
   * Each `EventPlan` stores a `currency_code` alongside `location_city`, **defaulting to Indian Rupee (`INR` / `₹`)** unless changed by the user.
   * Both the Gemini Vendor Scout prompts and the Resilient Coordinator fallback calibrate baseline unit costs (`PER_CAPITA`, `FLAT_FEE`, `TIERED_CAPACITY`) to the chosen currency and city tier (with first-class Indian wedding/celebration baselines in `₹` as the default experience).
   * All monetary fields are stored as numeric values in the plan's native `currency_code` and formatted consistently in the React UI via `Intl.NumberFormat` (`en-IN` for `INR`).

2. **Context-Grounded Interactive AI Coordinator Chat Drawer**:
   * The UI includes a persistent, collapsible **AI Coordinator Chat Drawer**.
   * Every message sent to `POST /api/v1/plans/{id}/chat` injects the live serialized state of the active `EventPlan` (`ConstraintProfile`, active `ConstraintViolation`s, `BudgetCategory` allocations, `VendorCandidate` shortlist, `WeatherContext`, and `RunOfShowItem`s).
   * Responses from the Coordinator Chat return structured data containing:
     * `reply_markdown`: Concise, tradeoff-aware coordinator guidance.
     * `suggested_tradeoff` (optional): An executable `TradeoffOption` card right inside the chat stream if the user's prompt implies a plan change (which the user can preview/apply using the same explicit approval state machine).

## Consequences

* **Positive**: Supports global event scenarios out of the box with realistic regional numbers.
* **Positive**: Bridges structured constraint management with conversational AI flexibility while maintaining a single source of truth in SQLite.
