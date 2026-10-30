# ADR 0004: SQLite Persistence, Plan Snapshots & Explicit Tradeoff Approval State Machine

* **Status**: Accepted
* **Date**: 2026-10-30

## Context

Event planning is iterative. When a host changes a core constraint (e.g., increasing guest count from 80 to 115 or reducing budget from $35,000 to $28,000), silent auto-mutation destroys trust. Hosts need to see what broke, compare 2–3 structured AI Coordinator tradeoff options, preview the exact financial and schedule diff, and either apply an option or revert to a previous snapshot.

## Decision

1. **SQLite Persistence via SQLAlchemy / SQLModel**:
   * Backend stores `EventPlan` records, child entities (`BudgetCategory`, `VendorCandidate`, `MilestoneTask`, `RunOfShowItem`), and immutable `PlanSnapshot` history in a local SQLite database (`partyplanner.db`).
   * Enables instant switching between multiple saved celebrations (e.g., Flagship Intimate Wedding, Milestone Birthday, Community Tech Meetup) and 1-click Undo / Snapshot Restore.

2. **Explicit Tradeoff Approval State Machine**:
   * **Step 1 (Constraint Mutation / What-If Input)**: User adjusts `guest_count`, `total_budget_limit`, `event_date`, or `priority_ranking`.
   * **Step 2 (Instant Deterministic Evaluation)**: Backend computes new `PER_CAPITA` and `TIERED_CAPACITY` costs, detects `ConstraintViolation`s (highlighted in red/amber in the UI), and preserves the current allocations until a decision is made.
   * **Step 3 (Agentic Tradeoff Proposal)**: The AI Coordinator generates 2–3 ranked `TradeoffOption` cards tailored to the user's `priority_ranking` (e.g., protecting top-priority categories while trimming or restructuring lower-priority categories or changing service styles).
   * **Step 4 (Diff Preview & Commit)**: Clicking **"Preview Diff"** overlays the proposed deltas on the budget and timeline charts; clicking **"Apply Option"** creates a `PlanSnapshot` of the prior state and commits the `TradeoffOption` mutations to SQLite.

## Consequences

* **Positive**: Full auditability and zero accidental data loss during experimentation.
* **Positive**: Clean seam for integration testing (`POST /api/v1/plans/{id}/evaluate-constraints` and `POST /api/v1/plans/{id}/apply-tradeoff`).
