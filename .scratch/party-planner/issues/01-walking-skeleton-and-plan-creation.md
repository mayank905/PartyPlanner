# 01: Walking Skeleton & Constraint-First Plan Creation

**What to build:** Enable a Host to create, persist, and view an `EventPlan` end-to-end across the React + Vite frontend and Python FastAPI + SQLite backend. The Host selects an `EventVertical` (`INTIMATE_WEDDING` as primary default, plus `MILESTONE_BIRTHDAY` and `COMMUNITY_EVENT`), `CurrencyCode` (defaulting to Indian Rupee `INR ₹` formatted with `en-IN`, with `USD $`, `EUR €`, and `GBP £` options), `location_city`, `event_date`, `guest_count`, `total_budget_limit`, `vibe_tags`, and `priority_ranking`. Upon submission, the system enriches the plan with live `WeatherContext` (via Nominatim + Open-Meteo with offline fallback) and generates initial `BudgetCategory` allocations (`FLAT_FEE`, `PER_CAPITA`, `TIERED_CAPACITY`) via the 5-model `ModelCascade` (`["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview", "gemini-2.5-pro", "gemini-2.5-flash"]` -> resilient heuristic coordinator fallback), displaying the active plan and budget breakdown in the workspace UI.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Host can open the Onboarding Wizard or select a quick-start celebration preset (e.g., 100-guest Intimate Wedding in Udaipur/Mumbai in `INR ₹`, Milestone Birthday, or Community Event), with `INR` (`₹`) pre-selected as the default `CurrencyCode`.
- [x] Submitting a new celebration persists the `EventPlan`, `ConstraintProfile`, `WeatherContext`, and initial `BudgetCategory` items in SQLite and renders the hydrated plan in the React workspace.
- [x] Real-time `WeatherContext` displays temperature range, precipitation probability, local sunset time, and `outdoor_risk_level` for the chosen `location_city` and `event_date`.
- [x] The AI Coordinator executes requests through the 5-model `ModelCascade` (`gemini-3.1-pro-preview` -> `gemini-3-flash-preview` -> `gemini-3.1-flash-lite-preview` -> `gemini-2.5-pro` -> `gemini-2.5-flash`), automatically failing over on quota/availability errors (`429`/`404`/`503`) and falling back to the deterministic resilient coordinator when no API key or quota is available.
- [x] Automated backend and frontend tests verify plan creation, `INR ₹` default formatting, `ModelCascade` failover behavior, and SQLite persistence.
