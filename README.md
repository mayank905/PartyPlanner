# UtsavAI (PartyPlanner) — Dynamic AI Celebration & Event Coordinator

**UtsavAI** is an AI-powered Celebration & Event Coordinator designed to move beyond generic ideation into practical, constraint-driven event management—covering dynamic budgeting (`FLAT_FEE`, `PER_CAPITA`, `TIERED_CAPACITY`), priority-aligned AI tradeoff synthesis, vendor capacity/lead-time coordination, and sunset-aligned critical-path timelines.

---

## 1. Chosen Vertical & Target Persona

* **Primary Vertical**: **Intimate & Micro-Weddings / Milestone Celebrations (50–150 Guests)**, with Indian Rupee (**`INR ₹`**) as the default currency and calibrated support for **Milestone Birthdays** and **Community / Tech Summits** across `INR ₹`, `USD $`, `EUR €`, and `GBP £`.
* **Target Persona**: Couples and celebration hosts managing a multi-vendor event (e.g., an intimate 100-guest heritage courtyard wedding in Udaipur or Jaipur with a ₹15L–₹25L ceiling) where every change to guest count, budget, or event date creates cascading impacts across per-plate catering, tiered venue capacities, vendor booking lead times, and golden-hour schedules.
* **Core Problem Solved**: Generic AI chatbots either hallucinate budget arithmetic or overwrite user allocations silently. UtsavAI acts as a **structured coordinator**—separating exact deterministic math from multi-option AI tradeoff reasoning so the host always sees *what broke*, *why it broke*, and *2–3 concrete Tradeoff Options* with a side-by-side **Preview Diff** before committing any change.

---

## 2. Approach & Logic (Hybrid Deterministic + Multi-Specialist Agentic Architecture)

### A. Deterministic Constraint & Math Engine (`backend/app/services/constraint_engine.py`)
Whenever the host adjusts **Guest Count**, **Total Budget Limit**, or **Event Date** in the **What-If Simulator**, the deterministic engine (<10ms) recalculates every category and checks hard constraints:
* **Pricing Models**:
  * `FLAT_FEE`: Fixed package cost independent of guest count ($\text{Estimated} = \text{Base Cost}$).
  * `PER_CAPITA`: Scales linearly with guest count ($\text{Estimated} = \text{Base Cost} + \text{Per-Head Cost} \times \text{Guest Count}$).
  * `TIERED_CAPACITY`: Step-function cost that jumps at capacity intervals ($\text{Estimated} = \text{Base Cost} + \lceil \text{Guest Count} / \text{Tier Step} \rceil \times \text{Tier Cost}$).
* **Automatic `ConstraintViolation` Detection**:
  * `BUDGET_OVERFLOW`: Total projected spend exceeds `total_budget_limit`.
  * `CATEGORY_OVERFLOW`: Category estimate exceeds allocated budget by >5%.
  * `VENUE_CAPACITY_EXCEEDED`: Active guest count exceeds a locked vendor's `max_capacity`.
  * `LEAD_TIME_COMPRESSED`: Days remaining until `event_date` is shorter than a locked vendor's `lead_time_days`.
  * `WEATHER_CONTINGENCY_MISSING`: High outdoor rain probability without a dedicated waterproof shamiana/tent contingency.

### B. 5-Model Gemini 3 Series Cascade & Resilient Fallback (`backend/app/services/agent_coordinator.py`)
Instead of relying on a single LLM model that could hit quota limits (`429`) or temporary unavailability (`503`), UtsavAI implements an automatic **5-Model Cascade (`ModelCascade`)** led by the **Gemini 3 series**:
1. `gemini-3.1-pro-preview` *(Primary)*
2. `gemini-3-flash-preview`
3. `gemini-3.1-flash-lite-preview`
4. `gemini-2.5-pro`
5. `gemini-2.5-flash`

If all models in the cascade are exhausted or no API key is configured during evaluator review, the backend transparently falls back to its **Resilient Heuristic Coordinator Engine**, guaranteeing 100% interactive functionality across all screens.

### C. Real-Time Weather & Sunset Grounding (`backend/app/services/weather_service.py`)
Resolves coordinates via **OpenStreetMap Nominatim** and meteorological/sunset data via **Open-Meteo** (with calibrated regional baselines when offline) so the **Run-of-Show** aligns outdoor ceremonies and golden-hour portraits with the city's actual local sunset time.

---

## 3. How the Solution Works

1. **Constraint-First Onboarding (`INR ₹` Default)**: Create a celebration plan by specifying vertical (`INTIMATE_WEDDING`, `MILESTONE_BIRTHDAY`, `COMMUNITY_EVENT`), currency (defaults to `INR ₹`), city, date, guest count, budget limit, dietary needs, and an ordered **Priority Ranking** (e.g., `#1 Catering & Royal Feast`, `#2 Venue & Heritage Lawn`).
2. **Interactive What-If Simulator**: Drag the guest slider or adjust the budget/date in a non-destructive sandbox.
3. **Explicit Tradeoff Approval Flow**:
   * Inspect detected `ConstraintViolation` alerts.
   * Compare 3 AI-synthesized `TradeoffOption` cards that protect your #1 and #2 priorities while re-tiering flexible categories or service formats.
   * Click **Preview Diff** to overlay exact category-by-category financial deltas on the Budget Matrix.
   * Click **Apply Option** to automatically record a `PlanSnapshot` in SQLite and commit the mutation.
4. **Vendor & Venue Coordinator**: Compare shortlisted vendors per category, lock vendor quotes to update committed spend, or click **AI Scout More Vendors** to discover additional regional candidates.
5. **Critical-Path Timeline & Run-of-Show**: Track pre-event countdown milestones (`T-120d` to `T-3d`) with automatic date-shift compression warnings, alongside a sunset-aligned day-of schedule.
6. **Context-Grounded AI Coordinator Chat Drawer**: Ask freeform *"What if..."* or vendor negotiation questions grounded in your live plan numbers and receive inline executable `TradeoffOption` cards.

---

## 4. Assumptions Made

* Currency values are stored and calculated in the plan's native currency (`INR ₹` by default) and formatted using `Intl.NumberFormat` (`en-IN` for `INR`).
* Locking a vendor in a category automatically unlocks any previously locked vendor in that same category so committed spend is never double-counted.
* Evaluators may run the app with or without a `GEMINI_API_KEY` in `.env` (or paste a temporary session key in the UI Settings modal via `X-Gemini-API-Key`).

---

## 5. Project Structure & Setup Instructions

### Prerequisites
* **Python 3.11+**
* **Node.js 18+ / 20+**

### 1. Backend Setup (`backend/`)
```powershell
# From repository root
cp .env.example .env
# (Optional) Add GEMINI_API_KEY=your_key_here in .env

# Install dependencies inside the virtual environment
.\backend\.venv\Scripts\pip.exe install -r backend\requirements.txt

# Run backend test suite
$env:PYTHONPATH="backend"; .\backend\.venv\Scripts\pytest.exe backend/tests -v

# Start FastAPI server on http://127.0.0.1:8000
$env:PYTHONPATH="backend"; .\backend\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
```

### 2. Frontend Setup (`frontend/`)
```powershell
cd frontend
npm.cmd install

# Run TypeScript check, Vitest unit tests, and production build
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build

# Start Vite dev server on http://localhost:5173
npm.cmd run dev
```

### 3. Production Container / Google Cloud Run Deployment
The repository includes a multi-stage `Dockerfile` that builds the React frontend (`frontend/dist`) and serves it alongside the FastAPI backend (`/api/v1`) from a single container on `$PORT` (`8080`).
```powershell
docker build -t utsav-ai .
docker run -p 8080:8080 -e GEMINI_API_KEY="your_key_here" utsav-ai
```
