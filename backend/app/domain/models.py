from __future__ import annotations

from datetime import datetime, timezone
from sqlmodel import Field, SQLModel


def utc_now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat()


class EventPlanRecord(SQLModel, table=True):
    __tablename__ = "event_plans"

    id: str = Field(primary_key=True)
    title: str
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso, index=True)
    active_model: str = Field(default="resilient_coordinator")
    coordinator_mode: str = Field(default="resilient_coordinator")

    # JSON-serialized domain structures stored cleanly in SQLite
    constraint_profile_json: str
    weather_context_json: str
    categories_json: str
    vendors_json: str
    milestones_json: str
    run_of_show_json: str
    chat_history_json: str = Field(default="[]")


class PlanSnapshotRecord(SQLModel, table=True):
    __tablename__ = "plan_snapshots"

    id: str = Field(primary_key=True)
    plan_id: str = Field(index=True)
    created_at: str = Field(default_factory=utc_now_iso, index=True)
    label: str
    guest_count: int
    total_budget_limit: float
    event_date: str
    total_estimated: float

    # Full point-in-time snapshot state for 1-click rollback
    constraint_profile_json: str
    categories_json: str
    vendors_json: str
    milestones_json: str
    run_of_show_json: str
