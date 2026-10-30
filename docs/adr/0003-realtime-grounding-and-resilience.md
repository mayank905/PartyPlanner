# ADR 0003: Real-Time Context Grounding & Evaluator Resilience Strategy

* **Status**: Accepted
* **Date**: 2026-10-30

## Context

The Challenge Submission Guidelines mandate two potentially conflicting requirements:
1. *"Use real-time data or realistic inputs for GenAI queries; avoid hardcoded dummy data for actual user-facing functionality."*
2. *"Ensure evaluators can see the project working even if API credits expire."*

## Decision

We will implement a **3-Layer Real-Time & Resilient Intelligence Pipeline**:

1. **Live External Context Enrichment (Zero-Key Open APIs)**:
   * **Geocoding**: Uses OpenStreetMap Nominatim API to resolve the user's `location_city` into coordinates and regional metadata.
   * **Seasonal & Forecast Weather Context (`WeatherContext`)**: Queries Open-Meteo API (forecast or historical seasonal averages for the exact `event_date` and coordinates) to determine temperature ranges, precipitation probability, and sunset times. This directly feeds into the **Timeline & Run-of-Show Architect Agent** (e.g., scheduling golden-hour photos around real sunset time) and **Vendor Scout Agent** (e.g., flagging mandatory tent/heater contingency if outdoor rain risk > 30%).

2. **Google Gemini API with Multi-Model Cascade (`ModelCascade`), Search Grounding & Structured Outputs**:
   * Instead of relying on a single model ID that could hit rate limits or availability issues, the backend implements a **5-Model Cascade (`ModelCascade`)** prioritizing the **Gemini 3 series**:
     1. `gemini-3.1-pro-preview`
     2. `gemini-3-flash-preview`
     3. `gemini-3.1-flash-lite-preview`
     4. `gemini-2.5-pro`
     5. `gemini-2.5-flash`
   * If any model in the cascade returns a `429 ResourceExhausted`, `503 Unavailable`, or `404 NotFound`, the orchestrator automatically retries the structured request (`response_schema`) against the next model in `ModelCascade` and records which model fulfilled the request (`active_model`).
   * API key resolution order:
     1. Request header `X-Gemini-API-Key` (allows an evaluator to paste their own key in the UI settings bar at any time without restarting the server).
     2. Backend environment variable `GEMINI_API_KEY` from `.env`.

3. **Graceful Heuristic Coordinator Fallback (Quota/Offline Resilience)**:
   * If `GEMINI_API_KEY` is missing or returns a `429 ResourceExhausted` / network error during evaluation, the backend transparently falls back to its **Algorithmic Coordinator Engine** (which uses the user's live inputs, real-time weather/sunset data, priority rankings, and constraint violations to compute tailored `TradeoffOption`s, realistic city-calibrated vendor quotes, and date-anchored timelines) and badges the response with `mode: "resilient_coordinator"` so the UI remains 100% interactive and never crashes.

## Consequences

* **Positive**: Every plan incorporates real geographical, seasonal weather, and sunset data for the chosen date and city, plus live Gemini reasoning when API quota is available.
* **Positive**: Evaluators testing the repository without an API key or after quota exhaustion still experience full dynamic recalculation, tradeoff cards, and what-if simulations.
