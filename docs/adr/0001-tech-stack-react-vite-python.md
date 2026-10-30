# ADR 0001: Full-Stack Architecture (React + Vite Frontend & Python FastAPI Backend)

* **Status**: Accepted
* **Date**: 2026-10-30

## Context

The Challenge requires building an AI-powered Celebration and Event Planner scored heavily on:
1. Problem Statement Alignment & Practical Usability (dynamic constraint updates, tradeoff analysis, timelines, vendor coordination).
2. Code Quality, Security, Efficiency, Testing, and Accessibility.
3. No hardcoded API keys in source code, plus resilience for video/evaluator walkthroughs.

The user selected **React + Vite** for the frontend and **Python** for the backend, powered by the **Google Gemini API (`google-genai` SDK)**.

## Decision

We will structure the repository as a clean, two-tier workspace:
1. **`backend/` (Python 3.11+ with FastAPI & Pydantic v2)**:
   * Exposes RESTful JSON endpoints (and SSE streaming where helpful) under `/api/v1/...`.
   * Uses `google-genai` SDK with Pydantic structured outputs (`response_schema`) so every AI coordinator response adheres strictly to domain schemas (`TradeoffOption`, `VendorCandidate`, `TimelineSchedule`).
   * Keeps API keys strictly in environment variables (`.env` loaded via `pydantic-settings`), while optionally accepting a request header (`X-Gemini-API-Key`) if an evaluator enters a temporary key in the UI settings modal (never persisted to repo).
   * Separates deterministic domain calculation (per-capita budget math, capacity validation, date-shift delta calculation) from LLM reasoning.
2. **`frontend/` (React 18+ with Vite, TypeScript, Tailwind CSS)**:
   * Strict TypeScript domain types mirroring Backend Pydantic models.
   * Accessible (WCAG AA compliant contrast, keyboard navigation, ARIA live regions for dynamic budget/constraint alerts).
   * Interactive What-If Scenario simulator, Budget Re-balancer, Vendor Matrix, and Critical-Path Timeline views.

## Consequences

* **Positive**: Python + FastAPI + Pydantic v2 pairs natively with `google-genai` structured outputs and makes unit/integration testing of the constraint engine and agent workflows straightforward with `pytest`.
* **Positive**: React + Vite provides fast HMR and rich interactive state management for real-time budget sliders and side-by-side What-If diffs.
* **Tradeoff**: Requires running two processes in development (`uvicorn` and `vite`), which we will simplify via a unified root startup script and clear README instructions.
