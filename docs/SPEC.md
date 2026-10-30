# PartyPlanner — Technical & Product Specification

> **Related Documents**:
> * [Domain Glossary](./GLOSSARY.md)
> * [ADR 0001: Full-Stack Architecture (React + Vite & Python FastAPI)](./adr/0001-tech-stack-react-vite-python.md)
> * [ADR 0002: Hybrid Deterministic + Multi-Specialist Agentic Coordinator](./adr/0002-vertical-and-hybrid-agentic-architecture.md)
> * [ADR 0003: Real-Time Context Grounding & Evaluator Resilience](./adr/0003-realtime-grounding-and-resilience.md)
> * [ADR 0004: SQLite Persistence, Plan Snapshots & Tradeoff State Machine](./adr/0004-sqlite-persistence-and-tradeoff-state-machine.md)
> * [ADR 0005: Multi-Currency Calibration & Context-Grounded Chat Drawer](./adr/0005-multi-currency-and-grounded-chat-drawer.md)

---

## Problem Statement

Planning a complex celebration—especially an **Intimate or Micro-Wedding / Milestone Celebration (50–150 guests)**, as well as **Milestone Birthdays** or **Community Events**—is an interconnected constraint-satisfaction problem rather than a simple checklist:
1. **Cascading Financial & Capacity Tradeoffs**: When a host adjusts their guest count, total budget, or event date, generic AI chatbots give vague advice instead of calculating how `PER_CAPITA` costs (catering, bar, favors), `FLAT_FEE` packages (photography, entertainment), and `TIERED_CAPACITY` thresholds (venue maximums, staffing ratios) interact.
2. **Arbitrary AI Decisions vs. Coordinator Guidance**: Existing tools either overwrite user budgets silently or dump static spreadsheets without explaining practical tradeoffs aligned with the host's personal priorities.
3. **Disconnected Timelines & Real-World Conditions**: Moving an event date affects vendor lead-time viability, countdown milestones (`MilestoneTask`s), and day-of schedules (`RunOfShowItem`s) that depend on real-world seasonal weather and sunset times (`WeatherContext`).

---

## Solution

**PartyPlanner** is an AI-powered Celebration & Event Coordinator built with a **React + Vite (TypeScript, Tailwind CSS)** frontend and a **Python (FastAPI, Pydantic v2, SQLModel/SQLite, Google Gemini SDK)** backend.

Instead of acting as a generic idea generator, PartyPlanner combines a **Deterministic Constraint & Math Engine** with a **Multi-Specialist Agentic Coordinator**:
1. **Constraint-First Onboarding & Multi-Vertical Support**: Showcases the flagship **Intimate & Micro-Wedding / Milestone Celebration (50–150 guests)** persona while also supporting **Milestone Birthday** and **Community Event** verticals across four currencies (**defaulting to `INR ₹`**, with `USD $`, `EUR €`, `GBP £` selectable).
2. **Dynamic Constraint Re-balancer & What-If Simulator**: Adjusting `total_budget_limit`, `guest_count`, or `event_date` immediately recalculates `PER_CAPITA`, `FLAT_FEE`, and `TIERED_CAPACITY` line items, highlights `ConstraintViolation`s (`BUDGET_OVERFLOW`, `VENUE_CAPACITY_EXCEEDED`, `LEAD_TIME_COMPRESSED`), and triggers the AI Coordinator to propose 2–3 ranked `TradeoffOption` cards with a side-by-side **Preview Diff** before committing.
3. **Real-Time Weather, Sunset & Multi-Model Gemini Cascade**: Enriches plans with live geocoding (Nominatim) and meteorological/sunset data (Open-Meteo) plus a **5-Model Gemini Cascade (`ModelCascade`)** led by the Gemini 3 series (`gemini-3.1-pro-preview` -> `gemini-3-flash-preview` -> `gemini-3.1-flash-lite-preview` -> `gemini-2.5-pro` -> `gemini-2.5-flash`) with automatic quota/availability failover and a final **Resilient Coordinator Fallback** if all models/credits are exhausted.
4. **Critical-Path Timeline & Run-of-Show Engine**: Automatically shifts pre-event `MilestoneTask` countdowns and day-of `RunOfShowItem` blocks (anchored to real local sunset times and venue hours) when dates or constraints change.
5. **Interactive AI Coordinator Chat Drawer**: A context-aware conversational sidebar grounded in the live `EventPlan` state that answers vendor negotiation, dietary, and scheduling questions and can emit actionable `TradeoffOption` cards directly in chat.

---

## User Stories

1. **As a Host**, I want to create an `EventPlan` by selecting an `EventVertical` (`INTIMATE_WEDDING`, `MILESTONE_BIRTHDAY`, or `COMMUNITY_EVENT`), `CurrencyCode` (defaulting to **`INR` / `₹`**, or selectable to `USD`, `EUR`, `GBP`), `location_city`, `event_date`, `guest_count`, `total_budget_limit`, `vibe_tags`, and ordered `priority_ranking`, so that the coordinator tailors every allocation to my specific constraints.
2. **As a Host**, I want the system to fetch real-time `WeatherContext` (temperature range, precipitation probability, outdoor risk level, and local sunset time) for my `location_city` and `event_date`, so that my venue contingencies and day-of schedule reflect real-world conditions.
3. **As a Host**, I want my budget broken down into structured `BudgetCategory` buckets where each category explicitly declares its `PricingModel` (`FLAT_FEE`, `PER_CAPITA`, or `TIERED_CAPACITY`), so that I understand which costs scale with guest count and which stay fixed.
4. **As a Host**, I want to drag sliders or edit inputs in a non-destructive **What-If Scenario Simulator** (e.g., changing `guest_count` from 80 to 115 or cutting `total_budget_limit` by 15%), so that I can see immediate deterministic cost impacts before altering my committed plan.
5. **As a Host**, I want the system to automatically flag `ConstraintViolation`s (such as exceeding `total_budget_limit`, exceeding a locked venue's `max_capacity`, or compressing a vendor's `lead_time_days` when moving the `event_date` closer), so that hidden logistical failures are caught immediately.
6. **As a Host**, I want the AI Coordinator to synthesize 2–3 ranked `TradeoffOption` cards whenever a `ConstraintViolation` occurs—respecting my `priority_ranking` (protecting high-priority categories while adjusting lower-priority ones)—so that I can choose between concrete alternatives with clear pros, cons, and financial deltas.
7. **As a Host**, I want to click **"Preview Diff"** on any `TradeoffOption` card to see a side-by-side comparison of current vs. proposed budget allocations and timeline impacts before clicking **"Apply Option"**, so that the AI never makes arbitrary silent changes to my plan.
8. **As a Host**, I want the system to automatically save a `PlanSnapshot` in SQLite before any `TradeoffOption` is applied, and allow me to restore any previous snapshot in one click, so that I can experiment freely without losing prior work.
9. **As a Host**, I want to browse, compare, shortlist, and lock `VendorCandidate`s per `BudgetCategory` (including base cost, per-head cost, max capacity, lead time, and AI tradeoff notes), so that locking a vendor updates my committed spend and capacity constraints.
10. **As a Host**, I want a **Critical-Path Timeline & Run-of-Show Engine** that generates both pre-event countdown `MilestoneTask`s (e.g., `T-180d`, `T-60d`, `T-14d`) and day-of `RunOfShowItem` blocks (automatically aligning golden-hour photography and outdoor transitions with local sunset time), so that shifting my `event_date` dynamically recalculates all deadlines.
11. **As a Host**, I want an **Interactive AI Coordinator Chat Drawer** grounded in my active `EventPlan`, `ConstraintProfile`, and `ConstraintViolation`s, so that I can ask freeform "What if..." or vendor negotiation questions and receive actionable advice or one-click `TradeoffOption` proposals.
12. **As an Evaluator**, I want to optionally provide my own `GEMINI_API_KEY` via a secure UI header input (without modifying code) AND have the application gracefully fall back to its deterministic + regional heuristic coordinator if API credits are exhausted, so that every screen and workflow functions reliably during review.

---

## Implementation Decisions

### 1. Backend Architecture (`backend/`)
* **Framework**: Python FastAPI with Pydantic v2 schemas and SQLModel (SQLAlchemy + SQLite `partyplanner.db`).
* **Modules**:
  * `domain/models.py` & `domain/schemas.py`: Canonical Pydantic & SQLModel definitions matching [GLOSSARY.md](./GLOSSARY.md) (`EventPlan`, `ConstraintProfile`, `BudgetCategory`, `PricingModel`, `ConstraintViolation`, `TradeoffOption`, `VendorCandidate`, `MilestoneTask`, `RunOfShowItem`, `WeatherContext`, `PlanSnapshot`, `CoordinatorChatTurn`).
  * `services/constraint_engine.py`: Pure, deterministic Python module that:
    * Re-evaluates `BudgetCategory` estimated costs based on `PricingModel`:
      * `FLAT_FEE`: `estimated = base_cost`
      * `PER_CAPITA`: `estimated = base_cost + (per_head_cost * guest_count)`
      * `TIERED_CAPACITY`: `estimated = base_cost + ceil(guest_count / tier_step) * tier_cost`
    * Detects `ConstraintViolation`s (`BUDGET_OVERFLOW`, `CATEGORY_OVERFLOW`, `VENUE_CAPACITY_EXCEEDED`, `LEAD_TIME_COMPRESSED`, `WEATHER_CONTINGENCY_MISSING`).
    * Recalculates `MilestoneTask` due dates when `event_date` shifts.
  * `services/weather_service.py`: Queries OpenStreetMap Nominatim + Open-Meteo APIs with timeout & local cache fallback to produce `WeatherContext` (including real sunset time and rain probability).
  * `services/agent_coordinator.py`: Multi-specialist orchestrator using `google-genai` SDK with a **5-model fallback cascade (`ModelCascade`)** led by Gemini 3 series models (`["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview", "gemini-2.5-pro", "gemini-2.5-flash"]`) and Pydantic `response_schema`:
    * `generate_initial_plan()`: Synthesizes tailored categories, initial `VendorCandidate`s, `MilestoneTask`s, and `RunOfShowItem`s for the user's `ConstraintProfile` and `WeatherContext`.
    * `propose_tradeoffs()`: Takes active `ConstraintViolation`s + `priority_ranking` and returns 2–3 structured `TradeoffOption` objects with exact category mutations.
    * `scout_vendors()`: Uses Gemini (with Search Grounding when available) to generate realistic, regionally calibrated `VendorCandidate` comparisons for a specific category.
    * `chat_with_coordinator()`: Handles conversational turns in the AI Coordinator Chat Drawer, returning markdown guidance + optional executable `TradeoffOption`.
    * Includes automatic fallback to the deterministic/heuristic coordinator whenever `GEMINI_API_KEY` is absent or quota-exhausted.
  * `api/routes.py`: REST endpoints:
    * `GET /api/v1/plans` & `POST /api/v1/plans` (Create/List `EventPlan`s)
    * `GET /api/v1/plans/{plan_id}` (Full hydrated `EventPlan` + violations + snapshots)
    * `POST /api/v1/plans/{plan_id}/evaluate-what-if` (Non-destructive constraint simulation returning deterministic math + `ConstraintViolation`s + AI `TradeoffOption`s)
    * `POST /api/v1/plans/{plan_id}/apply-tradeoff` (Snapshots current state and applies a chosen `TradeoffOption` or constraint update)
    * `POST /api/v1/plans/{plan_id}/vendors/{vendor_id}/status` (Shortlist / Lock / Reject a `VendorCandidate` and re-run constraint checks)
    * `POST /api/v1/plans/{plan_id}/scout-vendors` (On-demand AI vendor discovery for a category)
    * `POST /api/v1/plans/{plan_id}/chat` (Context-grounded AI Coordinator Chat Drawer endpoint)
    * `POST /api/v1/plans/{plan_id}/snapshots/{snapshot_id}/restore` (1-click rollback to prior `PlanSnapshot`)

### 2. Frontend Architecture (`frontend/`)
* **Framework**: React 18 + Vite + TypeScript + Tailwind CSS + Lucide icons.
* **Key Views & Components**:
  * **Header & Plan Switcher**: Switch between existing plans, create a new celebration via the **Constraint Onboarding Modal**, inspect AI engine status (`Live Gemini Agent` vs. `Resilient Coordinator Mode`), and optionally set a session `X-Gemini-API-Key`.
  * **Live Constraint Control Bar & What-If Simulator**: Interactive controls for `guest_count`, `total_budget_limit`, `event_date`, and `priority_ranking` with instant deterministic diffing.
  * **Constraint Violation Alert Banner & Tradeoff Approval Deck**: Displays active `ConstraintViolation`s and renders the 2–3 AI-proposed `TradeoffOption` cards with **"Preview Diff"** (highlighting exact category/timeline changes) and **"Apply Option"** buttons.
  * **Tabbed Workspace**:
    1. **Budget & Tradeoff Matrix**: Visual breakdown of `FLAT_FEE`, `PER_CAPITA`, and `TIERED_CAPACITY` categories, committed vs. estimated spend, and diff overlays.
    2. **Vendor & Venue Coordinator**: Comparison cards for `VendorCandidate`s showing capacity limits, per-head vs. flat pricing, lead times, and 1-click Lock/Shortlist controls.
    3. **Critical-Path Timeline & Run-of-Show**: Countdown `MilestoneTask` dependency tracker (highlighting compressed tasks if the date moved closer) + day-of `RunOfShowItem` schedule aligned with live `WeatherContext` sunset time.
    4. **Snapshot History**: Audit log of `PlanSnapshot`s with 1-click restore.
  * **Collapsible AI Coordinator Chat Drawer**: Slide-over conversational assistant grounded in the active plan, supporting freeform "What if..." queries and inline `TradeoffOption` cards.

---

## Testing Decisions

* **Philosophy**: Test external behavior and domain invariants through high-level seams rather than mocking internal private helpers.
* **Primary Testing Seams**:
  1. **Domain Constraint & Math Seam (`services/constraint_engine.py`)**:
     * Verify `PER_CAPITA`, `FLAT_FEE`, and `TIERED_CAPACITY` recalculations when `guest_count` changes.
     * Verify `ConstraintViolation` detection for `BUDGET_OVERFLOW`, `VENUE_CAPACITY_EXCEEDED` (when `guest_count > locked_venue.max_capacity`), and `LEAD_TIME_COMPRESSED` (when `days_until_event < vendor.lead_time_days`).
     * Verify `MilestoneTask` date shifting and critical-path compression flags.
  2. **API Integration & State Machine Seam (`FastAPI TestClient` against SQLite test DB)**:
     * Full lifecycle test: Create `EventPlan` -> Trigger `evaluate-what-if` with increased guest count and reduced budget -> Verify `ConstraintViolation`s and `TradeoffOption`s are returned without mutating the stored plan -> Call `apply-tradeoff` -> Verify `PlanSnapshot` is created and `EventPlan` is updated -> Call `restore` on the snapshot -> Verify exact state rollback.
     * Verify `chat` endpoint grounds responses in the active plan and handles missing/expired Gemini API keys gracefully via the resilient coordinator fallback.
  3. **Frontend Component & Build Verification**:
     * TypeScript typecheck (`tsc --noEmit`), production Vite build, and Vitest component/state tests verifying accessibility roles and diff preview state transitions.

---

## Out of Scope

* Real payment processing or Stripe escrow transfers to vendors.
* Multi-user real-time collaborative cursor editing (WebSockets/CRDTs).
* Automated outbound email/SMS dispatch to third-party vendors.
* Native mobile iOS/Android binaries (the web app is responsive across desktop and tablet/mobile viewports).

---

## Further Notes

* **Security**: No API keys or secrets are hardcoded anywhere in `backend/` or `frontend/`. `.env.example` documents `GEMINI_API_KEY`.
* **Accessibility**: All interactive controls, sliders, tabs, and modal dialogs include proper labels, keyboard focus rings, and `aria-live="polite"` announcements when constraints or budget totals change.
