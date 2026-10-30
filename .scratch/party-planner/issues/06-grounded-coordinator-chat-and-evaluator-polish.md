# 06: Context-Grounded AI Coordinator Chat Drawer & Evaluator Polish

**What to build:** Provide a persistent, collapsible AI Coordinator Chat Drawer where the Host can ask freeform "What if...", vendor negotiation, dietary accommodation, or logistics questions grounded in the live `EventPlan` state (`ConstraintProfile`, active `ConstraintViolation`s, `BudgetCategory` allocations, `VendorCandidate`s, `WeatherContext`, and `RunOfShowItem`s). When a chat query implies a plan modification, the assistant returns an inline `TradeoffOption` card that can be previewed and applied via the same snapshot-backed approval flow. Also includes a UI API Key & Model Cascade status modal (allowing evaluators to inspect `ModelCascade` status or supply an optional `X-Gemini-API-Key` header without code edits) and a comprehensive project `README.md`.

**Blocked by:** 03: Agentic Tradeoff Strategist, Diff Preview & Snapshot Rollback, 04: Vendor & Venue Coordinator Matrix & Live Scouting, 05: Critical-Path Timeline & Sunset-Aligned Run-of-Show Engine

**Status:** completed

- [x] Opening the AI Coordinator Chat Drawer allows the Host to send conversational queries and receive responses grounded in the live `EventPlan` numbers, currency (`INR ₹` default), `WeatherContext`, and active `ConstraintViolation`s.
- [x] When a Host asks a "What if..." mutation question in chat, the response includes an executable `TradeoffOption` card that integrates with **"Preview Diff"** and **"Apply Option"**.
- [x] The Header displays the active AI engine status (showing which model from `ModelCascade` answered or `Resilient Coordinator Mode`) and provides a Settings modal to input a session `X-Gemini-API-Key` (never stored in source code).
- [x] Root `README.md` clearly documents the chosen vertical, hybrid deterministic + agentic architecture, `ModelCascade` strategy, assumptions, and setup instructions per `challenge.md`.
- [x] End-to-end verification suite passes across backend (`pytest`) and frontend (`tsc`, `vitest`, `vite build`).
