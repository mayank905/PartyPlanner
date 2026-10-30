# Domain Glossary: PartyPlanner (Celebration & Event Coordinator)

This glossary defines the ubiquitous language used across the codebase, API contracts, UI components, and AI prompts.

## Core Entities

* **EventPlan (`event_plan`)**: The top-level aggregate root representing a single celebration (focused primarily on Intimate & Micro-Weddings / Milestone Celebrations of 50–150 guests, while adaptable to other milestones). Contains `ConstraintProfile`, `BudgetAllocation`, `VendorShortlist`, and `TimelineSchedule`.
* **ConstraintProfile (`constraint_profile`)**: The hard and soft boundaries defined by the Host:
  * **Hard Constraints**: `total_budget_limit`, `guest_count`, `event_date`, `location_city`, `venue_capacity_min`, `dietary_restrictions`.
  * **Soft Preferences**: `vibe_tags` (e.g., garden-party, minimalist, black-tie), `priority_ranking` (ordered list of categories from non-negotiable to flexible, e.g., `[Catering, Photography, Venue, Florals, Decor]`).
* **BudgetCategory (`budget_category`)**: A logical bucket of event spend (e.g., Venue, Catering & Bar, Photography, Attire, Decor & Florals, Entertainment, Contingency). Tracks `allocated_amount`, `committed_amount`, `estimated_amount`, and `pricing_model`.
* **PricingModel (`pricing_model`)**: How a cost scales when `guest_count` or `duration_hours` changes:
  * `FLAT_FEE`: Fixed cost regardless of guest count (e.g., Photographer package, DJ flat rate).
  * `PER_CAPITA`: Cost scales linearly with `guest_count` (`unit_cost * guest_count`, e.g., plated catering, open bar per person, favors).
  * `TIERED_CAPACITY`: Step-function cost that jumps when `guest_count` crosses a threshold (e.g., Venue size upgrade at >100 guests, extra bartender per 50 guests).
* **ConstraintViolation (`constraint_violation`)**: A detected conflict when a `ConstraintProfile` update invalidates part of the current `EventPlan` (e.g., increasing `guest_count` from 80 to 120 causes `PER_CAPITA` catering to exceed `total_budget_limit` by $3,200 AND exceeds the selected venue's `max_capacity` of 100).
* **TradeoffOption (`tradeoff_option`)**: A concrete, AI-synthesized resolution path presented to the Host when a `ConstraintViolation` occurs or a `WhatIfScenario` is evaluated. Never makes arbitrary silent deletions; always states:
  * `summary`: What changes.
  * `financial_delta`: Exact dollar impact per category.
  * `pros` / `cons`: Practical impact on guest experience and host stress.
  * `mutations`: Structured patch that can be applied in one click to the `EventPlan`.
* **WhatIfScenario (`what_if_scenario`)**: A non-destructive sandbox state comparing the baseline `EventPlan` against a proposed constraint mutation (e.g., "+25 guests", "-15% total budget", "Shift date to Saturday peak season") before committing changes.
* **MilestoneTask (`milestone_task`)**: A pre-event countdown task anchored relative to `event_date` (e.g., `T-180 days: Lock venue deposit`, `T-30 days: Finalize catering headcount`). Includes dependency edges (`depends_on`) and `critical_path` flag.
* **RunOfShowItem (`run_of_show_item`)**: A day-of schedule block anchored by start time and duration (e.g., `16:00 - 16:45: Ceremony`, `16:45 - 17:45: Cocktail Hour & Couple Portraits`).
* **VendorCandidate (`vendor_candidate`)**: A realistic or grounded vendor option for a `BudgetCategory`, structured with `pricing_model`, `base_cost`, `per_head_cost`, `max_capacity`, `lead_time_days`, `tradeoff_notes`, and `selection_status` (`SHORTLISTED`, `LOCKED`, `REJECTED`).
* **WeatherContext (`weather_context`)**: Real-time geographical and meteorological data resolved for `location_city` and `event_date` (via Nominatim + Open-Meteo), including `temp_high_c`, `temp_low_c`, `precipitation_prob_pct`, `sunset_time_local`, and `outdoor_risk_level` (`LOW`, `MODERATE`, `HIGH`).
* **PlanSnapshot (`plan_snapshot`)**: An immutable point-in-time serialization of an `EventPlan` created automatically before applying a `TradeoffOption` or constraint mutation, enabling version comparison and 1-click rollback.
* **EventVertical (`event_vertical`)**: The archetype of the celebration (`INTIMATE_WEDDING`, `MILESTONE_BIRTHDAY`, `COMMUNITY_EVENT`), which seeds initial category weights, typical pricing models, and coordinator heuristics while sharing the unified constraint engine.
* **CurrencyCode (`currency_code`)**: ISO 4217 currency code (`INR`, `USD`, `EUR`, `GBP`) selected per `EventPlan`, defaulting to **Indian Rupee (`INR` / `₹`)** unless changed by the user. Governs display formatting and regional vendor cost calibration baselines.
* **ModelCascade (`model_cascade`)**: The ordered fallback list of 5 Gemini models (`["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview", "gemini-2.5-pro", "gemini-2.5-flash"]`) tried sequentially by the AI Coordinator if a model's quota or availability is exhausted, prior to engaging the deterministic resilient coordinator fallback.
* **CoordinatorChatTurn (`coordinator_chat_turn`)**: A conversational message exchange in the AI Coordinator Chat Drawer, always grounded in the active `EventPlan`, `ConstraintProfile`, current `ConstraintViolation`s, and `WeatherContext`, capable of proposing actionable `TradeoffOption`s or answering vendor negotiation/logistics questions.


