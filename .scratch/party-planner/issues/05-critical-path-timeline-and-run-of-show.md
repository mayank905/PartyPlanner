# 05: Critical-Path Timeline & Sunset-Aligned Run-of-Show Engine

**What to build:** Provide a dual-view Timeline Coordinator for the `EventPlan`: (1) a pre-event countdown checklist of `MilestoneTask`s with dependency edges (`depends_on`) and `critical_path` indicators that automatically shift and flag compressed deadlines whenever `event_date` changes, and (2) a day-of `RunOfShowItem` schedule that aligns outdoor ceremonies, golden-hour photography, and transitions around the real local sunset time and `outdoor_risk_level` from `WeatherContext`.

**Blocked by:** 02: Deterministic Constraint Engine & What-If Simulator UI

**Status:** completed

- [x] The Critical-Path Timeline view renders pre-event `MilestoneTask`s anchored to `event_date` (e.g., `T-180d`, `T-90d`, `T-30d`, `T-7d`), highlighting critical-path items and flagging overdue/compressed tasks when `event_date` is moved closer.
- [x] Host can toggle task completion statuses and regenerate or optimize the schedule via the AI Coordinator (`ModelCascade`).
- [x] The Day-Of Run-of-Show view renders chronological `RunOfShowItem` blocks (`start_time`, `duration_minutes`, `category`, `notes`) aligned with `WeatherContext.sunset_time_local` and includes weather contingency notes when `outdoor_risk_level` is `MODERATE` or `HIGH`.
- [x] Automated tests verify `MilestoneTask` date-shift recalculation, compression detection, and sunset-aligned `RunOfShowItem` generation.
