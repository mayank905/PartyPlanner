# ADR 0002: Hybrid Deterministic + Multi-Specialist Agentic Coordinator Architecture

* **Status**: Accepted
* **Date**: 2026-10-30

## Context

In event planning (specifically our core vertical: **Intimate & Micro-Weddings / Milestone Celebrations of 50–150 guests**), changing a single input (such as guest count from 80 to 110, or cutting budget by 15%, or moving the date by 2 months) creates cascading effects across:
1. **Budget Math**: Per-head costs (catering, bar, rentals) scale immediately, while flat fees (photography) do not, and tiered costs (venue capacity, staffing ratios) step up at thresholds.
2. **Vendor Viability**: A locked or shortlisted venue with `max_capacity: 100` becomes invalid at 110 guests; moving the event date within 60 days invalidates vendors requiring a 90-day lead time.
3. **Timeline & Run-of-Show**: Moving the date compresses countdown milestones (`MilestoneTask`s) and seasonal sunset/weather changes shift the day-of `RunOfShowItem` schedule.

Relying purely on an LLM for arithmetic leads to hallucinated totals and slow feedback. Conversely, relying purely on static formulas fails to provide intelligent, context-aware coordinator tradeoffs.

## Decision

We will implement a **Hybrid Deterministic + Specialist Agentic Coordinator**:

1. **Deterministic Constraint & Math Engine (Core Layer)**:
   * Runs instantaneously (<10ms) in Python whenever `ConstraintProfile` or `WhatIfScenario` inputs change.
   * Computes exact `PER_CAPITA`, `FLAT_FEE`, and `TIERED_CAPACITY` line-item recalculations.
   * Emits a structured list of `ConstraintViolation` objects (e.g., `BUDGET_OVERFLOW`, `VENUE_CAPACITY_EXCEEDED`, `LEAD_TIME_COMPRESSED`).

2. **Agentic Coordinator Orchestrator (Gemini-Powered Specialist Nodes)**:
   * Triggered when a new plan is initialized, when `ConstraintViolation`s require tradeoff synthesis, or when the user requests vendor discovery or schedule optimization:
     * **Budget & Tradeoff Strategist Agent**: Inspects the deterministic `ConstraintViolation`s + user's `priority_ranking` (what they care about most vs. least) and generates 2–3 concrete, executable `TradeoffOption`s with exact mutations.
     * **Vendor & Venue Scout Agent**: Uses Google Search grounding (when enabled/available) or structured regional market synthesis to propose realistic `VendorCandidate`s with explicit per-head vs. flat-fee structures and pros/cons.
     * **Timeline & Run-of-Show Architect Agent**: Recalculates critical-path countdown milestones and day-of schedule blocks when dates, venue hours, or ceremony styles shift.

## Consequences

* **Positive**: Arithmetic is 100% accurate and instant; Gemini focuses on high-value reasoning, realistic vendor research, and multi-option tradeoff synthesis.
* **Positive**: Directly satisfies the challenge advice: *"Ensure the AI acts as a coordinator, providing tradeoffs and alternatives rather than making arbitrary decisions."*
