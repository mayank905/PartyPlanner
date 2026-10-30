# 03: Agentic Tradeoff Strategist, Diff Preview & Snapshot Rollback

**What to build:** When a `WhatIfScenario` or constraint change triggers `ConstraintViolation`s, the AI Coordinator synthesizes 2–3 ranked `TradeoffOption` cards tailored to the Host's `priority_ranking` (protecting top-priority categories while proposing realistic cuts, service-style shifts, or date/capacity adjustments on lower-priority categories). The Host can click **"Preview Diff"** to inspect a side-by-side comparison of current vs. proposed category allocations on the budget matrix, click **"Apply Option"** to automatically save a `PlanSnapshot` and commit the mutation, or restore any prior `PlanSnapshot` in one click.

**Blocked by:** 02: Deterministic Constraint Engine & What-If Simulator UI

**Status:** completed

- [x] Whenever `ConstraintViolation`s are present in a `WhatIfScenario`, the AI Coordinator (via `ModelCascade` or resilient coordinator fallback) returns 2–3 ranked `TradeoffOption` cards with `summary`, `financial_delta`, `pros`, `cons`, and executable `mutations` that respect the Host's `priority_ranking`.
- [x] Clicking **"Preview Diff"** on a `TradeoffOption` card overlays the proposed category-by-category deltas on the Budget Matrix before any state is mutated.
- [x] Clicking **"Apply Option"** records an immutable `PlanSnapshot` of the previous state in SQLite, applies the chosen `TradeoffOption` mutations to the `EventPlan`, and clears resolved `ConstraintViolation`s.
- [x] The Snapshot History view allows the Host to inspect prior `PlanSnapshot`s and restore the `EventPlan` to any historical snapshot in one click.
- [x] Automated tests verify the full `Evaluate What-If` -> `Preview Diff` -> `Apply TradeoffOption` -> `Restore PlanSnapshot` state machine.
