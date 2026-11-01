from __future__ import annotations

from collections import defaultdict
import json
import uuid
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import TypeAdapter
from sqlmodel import Session, select

from app.db import get_session
from app.domain.models import EventPlanRecord, PlanSnapshotRecord, utc_now_iso
from app.domain.schemas import (
    ApplyTradeoffRequestSchema,
    BudgetCategorySchema,
    ChatRequestSchema,
    ConstraintProfileSchema,
    CoordinatorChatTurnSchema,
    CreatePlanRequestSchema,
    EventPlanResponseSchema,
    MilestoneTaskSchema,
    PlanSnapshotSchema,
    RunOfShowItemSchema,
    ScoutVendorsRequestSchema,
    SelectionStatus,
    VendorCandidateSchema,
    VendorStatusUpdateRequestSchema,
    WeatherContextSchema,
    WhatIfEvaluationResponseSchema,
    WhatIfRequestSchema,
)
from app.services.agent_coordinator import (
    chat_with_coordinator,
    generate_initial_plan,
    get_model_cascade,
    optimize_timeline_schedule,
    propose_tradeoffs,
    realign_run_of_show_to_sunset,
    resolve_api_key,
    scout_vendors_for_category,
)
from app.services.constraint_engine import (
    calculate_category_estimate,
    calculate_vendor_estimate,
    evaluate_plan_constraints,
    recalculate_milestones_for_date,
)
from app.services.weather_service import fetch_weather_context

router = APIRouter(prefix="/api/v1")

MAX_SNAPSHOTS_PER_PLAN = 25

# Pre-compiled Pydantic TypeAdapters for high-throughput JSON list parsing
_CATEGORIES_ADAPTER = TypeAdapter(List[BudgetCategorySchema])
_VENDORS_ADAPTER = TypeAdapter(List[VendorCandidateSchema])
_MILESTONES_ADAPTER = TypeAdapter(List[MilestoneTaskSchema])
_ROS_ADAPTER = TypeAdapter(List[RunOfShowItemSchema])
_CHAT_ADAPTER = TypeAdapter(List[CoordinatorChatTurnSchema])


def _deserialize_plan_state(record: EventPlanRecord):
    profile = ConstraintProfileSchema.model_validate_json(record.constraint_profile_json)
    weather = WeatherContextSchema.model_validate_json(record.weather_context_json)
    categories = _CATEGORIES_ADAPTER.validate_json(record.categories_json)
    vendors = _VENDORS_ADAPTER.validate_json(record.vendors_json)
    milestones = _MILESTONES_ADAPTER.validate_json(record.milestones_json)
    run_of_show = _ROS_ADAPTER.validate_json(record.run_of_show_json)
    chat_history = _CHAT_ADAPTER.validate_json(record.chat_history_json)
    return profile, weather, categories, vendors, milestones, run_of_show, chat_history


def _hydrate_plan_response(
    record: EventPlanRecord,
    session: Session,
    preloaded_snapshots: Optional[List[PlanSnapshotRecord]] = None,
) -> EventPlanResponseSchema:
    profile, weather, categories, vendors, milestones, run_of_show, chat_history = _deserialize_plan_state(record)

    updated_categories, violations = evaluate_plan_constraints(
        profile=profile,
        categories=categories,
        vendors=vendors,
        weather=weather,
    )
    updated_milestones = recalculate_milestones_for_date(milestones, profile.event_date)

    if preloaded_snapshots is not None:
        snap_records = preloaded_snapshots
    else:
        snap_records = session.exec(
            select(PlanSnapshotRecord)
            .where(PlanSnapshotRecord.plan_id == record.id)
            .order_by(PlanSnapshotRecord.created_at.desc())
        ).all()

    snapshots = [
        PlanSnapshotSchema(
            id=s.id,
            created_at=s.created_at,
            label=s.label,
            guest_count=s.guest_count,
            total_budget_limit=s.total_budget_limit,
            event_date=s.event_date,
            total_estimated=s.total_estimated,
        )
        for s in snap_records
    ]

    return EventPlanResponseSchema(
        id=record.id,
        title=record.title,
        created_at=record.created_at,
        updated_at=record.updated_at,
        active_model=record.active_model,
        coordinator_mode=record.coordinator_mode,
        constraint_profile=profile,
        weather_context=weather,
        categories=updated_categories,
        vendors=vendors,
        milestones=updated_milestones,
        run_of_show=run_of_show,
        violations=violations,
        snapshots=snapshots,
        chat_history=chat_history,
    )


def _create_snapshot(
    record: EventPlanRecord,
    label: str,
    session: Session,
) -> PlanSnapshotRecord:
    profile = ConstraintProfileSchema.model_validate_json(record.constraint_profile_json)
    categories = _CATEGORIES_ADAPTER.validate_json(record.categories_json)
    total_est = round(sum(c.estimated_amount for c in categories), 2)

    snap = PlanSnapshotRecord(
        id=f"snap-{uuid.uuid4().hex[:8]}",
        plan_id=record.id,
        label=label,
        guest_count=profile.guest_count,
        total_budget_limit=profile.total_budget_limit,
        event_date=profile.event_date,
        total_estimated=total_est,
        constraint_profile_json=record.constraint_profile_json,
        categories_json=record.categories_json,
        vendors_json=record.vendors_json,
        milestones_json=record.milestones_json,
        run_of_show_json=record.run_of_show_json,
    )
    session.add(snap)

    # Prune oldest snapshots beyond retention cap to prevent unbounded table growth
    existing_snaps = session.exec(
        select(PlanSnapshotRecord)
        .where(PlanSnapshotRecord.plan_id == record.id)
        .order_by(PlanSnapshotRecord.created_at.desc())
    ).all()
    if len(existing_snaps) >= MAX_SNAPSHOTS_PER_PLAN:
        for stale_snap in existing_snaps[MAX_SNAPSHOTS_PER_PLAN - 1 :]:
            session.delete(stale_snap)

    return snap


@router.get("/system/status")
def get_system_status(
    x_gemini_api_key: Optional[str] = Header(default=None),
):
    has_key = resolve_api_key(x_gemini_api_key) is not None
    cascade = get_model_cascade()
    return {
        "default_currency": "INR",
        "model_cascade": cascade,
        "api_key_configured": has_key,
        "coordinator_mode": "live_gemini" if has_key else "resilient_coordinator",
    }


@router.get("/plans", response_model=List[EventPlanResponseSchema])
def list_plans(session: Session = Depends(get_session)):
    records = session.exec(select(EventPlanRecord).order_by(EventPlanRecord.updated_at.desc())).all()
    if not records:
        return []

    # Batch-load all snapshots in a single query to avoid N+1 database round-trips
    plan_ids = [r.id for r in records]
    all_snapshots = session.exec(
        select(PlanSnapshotRecord)
        .where(PlanSnapshotRecord.plan_id.in_(plan_ids))
        .order_by(PlanSnapshotRecord.created_at.desc())
    ).all()

    snapshots_by_plan: Dict[str, List[PlanSnapshotRecord]] = defaultdict(list)
    for snap in all_snapshots:
        snapshots_by_plan[snap.plan_id].append(snap)

    return [
        _hydrate_plan_response(r, session, preloaded_snapshots=snapshots_by_plan[r.id])
        for r in records
    ]


@router.post("/plans", response_model=EventPlanResponseSchema, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: CreatePlanRequestSchema,
    session: Session = Depends(get_session),
    x_gemini_api_key: Optional[str] = Header(default=None),
):
    profile = payload.constraint_profile
    weather = fetch_weather_context(profile.location_city, profile.event_date)
    blueprint, active_model, mode = generate_initial_plan(
        profile=profile,
        weather=weather,
        api_key=x_gemini_api_key,
    )

    welcome_turn = CoordinatorChatTurnSchema(
        id=f"chat-{uuid.uuid4().hex[:8]}",
        role="assistant",
        content=(
            f"Welcome! I have initialized **{payload.title}** in **{profile.location_city}** for "
            f"**{profile.guest_count} guests** with a ceiling of **{profile.currency_code.value} {profile.total_budget_limit:,.0f}**.\n\n"
            f"Local sunset on {profile.event_date} is at **{weather.sunset_time_local}** ({weather.outdoor_risk_level.value} weather risk). "
            f"Use the **What-If Simulator** to test guest count, budget, or date changes, or ask me anything here!"
        ),
        created_at=utc_now_iso(),
        active_model=active_model,
    )

    record = EventPlanRecord(
        id=f"plan-{uuid.uuid4().hex[:8]}",
        title=payload.title,
        active_model=active_model,
        coordinator_mode=mode,
        constraint_profile_json=profile.model_dump_json(),
        weather_context_json=weather.model_dump_json(),
        categories_json=json.dumps([c.model_dump() for c in blueprint.categories]),
        vendors_json=json.dumps([v.model_dump() for v in blueprint.vendors]),
        milestones_json=json.dumps([m.model_dump() for m in blueprint.milestones]),
        run_of_show_json=json.dumps([r.model_dump() for r in blueprint.run_of_show]),
        chat_history_json=json.dumps([welcome_turn.model_dump()]),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _hydrate_plan_response(record, session)


@router.get("/plans/{plan_id}", response_model=EventPlanResponseSchema)
def get_plan(plan_id: str, session: Session = Depends(get_session)):
    record = session.get(EventPlanRecord, plan_id)
    if not record:
        raise HTTPException(status_code=404, detail="EventPlan not found")
    return _hydrate_plan_response(record, session)


@router.post("/plans/{plan_id}/evaluate-what-if", response_model=WhatIfEvaluationResponseSchema)
def evaluate_what_if(
    plan_id: str,
    payload: WhatIfRequestSchema,
    session: Session = Depends(get_session),
    x_gemini_api_key: Optional[str] = Header(default=None),
):
    record = session.get(EventPlanRecord, plan_id)
    if not record:
        raise HTTPException(status_code=404, detail="EventPlan not found")

    base_profile = ConstraintProfileSchema.model_validate_json(record.constraint_profile_json)
    categories = _CATEGORIES_ADAPTER.validate_json(record.categories_json)
    vendors = _VENDORS_ADAPTER.validate_json(record.vendors_json)
    milestones = _MILESTONES_ADAPTER.validate_json(record.milestones_json)
    weather = WeatherContextSchema.model_validate_json(record.weather_context_json)

    baseline_cats, _ = evaluate_plan_constraints(base_profile, categories, vendors, weather)
    baseline_total = round(sum(c.estimated_amount for c in baseline_cats), 2)

    sim_profile = base_profile.model_copy(
        update={
            "guest_count": payload.guest_count,
            "total_budget_limit": payload.total_budget_limit,
            "event_date": payload.event_date,
            "priority_ranking": payload.priority_ranking or base_profile.priority_ranking,
        }
    )

    if payload.event_date != base_profile.event_date:
        weather = fetch_weather_context(sim_profile.location_city, sim_profile.event_date)

    updated_cats, violations = evaluate_plan_constraints(sim_profile, categories, vendors, weather)
    updated_milestones = recalculate_milestones_for_date(milestones, sim_profile.event_date)
    what_if_total = round(sum(c.estimated_amount for c in updated_cats), 2)

    tradeoff_options, active_model, mode = propose_tradeoffs(
        profile=sim_profile,
        categories=updated_cats,
        violations=violations,
        api_key=x_gemini_api_key,
    )

    return WhatIfEvaluationResponseSchema(
        baseline_total_estimated=baseline_total,
        what_if_total_estimated=what_if_total,
        budget_delta=round(what_if_total - baseline_total, 2),
        updated_categories=updated_cats,
        updated_milestones=updated_milestones,
        violations=violations,
        tradeoff_options=tradeoff_options,
        active_model=active_model,
        coordinator_mode=mode,
    )


@router.post("/plans/{plan_id}/apply-tradeoff", response_model=EventPlanResponseSchema)
def apply_tradeoff(
    plan_id: str,
    payload: ApplyTradeoffRequestSchema,
    session: Session = Depends(get_session),
):
    record = session.get(EventPlanRecord, plan_id)
    if not record:
        raise HTTPException(status_code=404, detail="EventPlan not found")

    # 1. Record immutable PlanSnapshot prior to mutation
    _create_snapshot(
        record=record,
        label=f"Before {payload.tradeoff_option.title}",
        session=session,
    )

    # 2. Apply constraint updates + TradeoffOption category mutations
    profile, _, categories, _, milestones, run_of_show, _ = _deserialize_plan_state(record)
    final_guest_count = payload.tradeoff_option.suggested_guest_count or payload.what_if_constraints.guest_count
    final_budget_limit = payload.tradeoff_option.suggested_budget_limit or payload.what_if_constraints.total_budget_limit
    final_event_date = payload.tradeoff_option.suggested_event_date or payload.what_if_constraints.event_date

    updated_profile = profile.model_copy(
        update={
            "guest_count": final_guest_count,
            "total_budget_limit": final_budget_limit,
            "event_date": final_event_date,
            "priority_ranking": payload.what_if_constraints.priority_ranking or profile.priority_ranking,
        }
    )

    mutation_map = {m.category_id: m for m in payload.tradeoff_option.mutations}

    mutated_categories: List[BudgetCategorySchema] = []
    for cat in categories:
        mut = mutation_map.get(cat.id)
        if mut is not None:
            cat_updates = {
                "allocated_amount": mut.new_allocated,
                "base_cost": mut.new_base_cost,
                "per_head_cost": mut.new_per_head_cost,
                "notes": f"{cat.notes} | {mut.change_rationale}".strip(" |"),
            }
            if mut.new_tier_cost is not None:
                cat_updates["tier_cost"] = mut.new_tier_cost
            new_cat = cat.model_copy(update=cat_updates)
            new_cat.estimated_amount = calculate_category_estimate(new_cat, final_guest_count)
            mutated_categories.append(new_cat)
        else:
            new_cat = cat.model_copy(
                update={
                    "estimated_amount": calculate_category_estimate(cat, final_guest_count),
                }
            )
            mutated_categories.append(new_cat)

    updated_milestones = recalculate_milestones_for_date(milestones, final_event_date)
    weather = fetch_weather_context(updated_profile.location_city, final_event_date)
    updated_run_of_show = realign_run_of_show_to_sunset(run_of_show, weather, updated_profile.location_city)

    record.constraint_profile_json = updated_profile.model_dump_json()
    record.weather_context_json = weather.model_dump_json()
    record.categories_json = json.dumps([c.model_dump() for c in mutated_categories])
    record.milestones_json = json.dumps([m.model_dump() for m in updated_milestones])
    record.run_of_show_json = json.dumps([r.model_dump() for r in updated_run_of_show])
    record.updated_at = utc_now_iso()

    session.add(record)
    session.commit()
    session.refresh(record)
    return _hydrate_plan_response(record, session)


@router.post("/plans/{plan_id}/snapshots/{snapshot_id}/restore", response_model=EventPlanResponseSchema)
def restore_snapshot(
    plan_id: str,
    snapshot_id: str,
    session: Session = Depends(get_session),
):
    record = session.get(EventPlanRecord, plan_id)
    if not record:
        raise HTTPException(status_code=404, detail="EventPlan not found")

    snap = session.get(PlanSnapshotRecord, snapshot_id)
    if not snap or snap.plan_id != plan_id:
        raise HTTPException(status_code=404, detail="PlanSnapshot not found")

    record.constraint_profile_json = snap.constraint_profile_json
    record.categories_json = snap.categories_json
    record.vendors_json = snap.vendors_json
    record.milestones_json = snap.milestones_json
    record.run_of_show_json = snap.run_of_show_json
    record.updated_at = utc_now_iso()

    session.add(record)
    session.commit()
    session.refresh(record)
    return _hydrate_plan_response(record, session)


@router.post("/plans/{plan_id}/vendors/{vendor_id}/status", response_model=EventPlanResponseSchema)
def update_vendor_status(
    plan_id: str,
    vendor_id: str,
    payload: VendorStatusUpdateRequestSchema,
    session: Session = Depends(get_session),
):
    record = session.get(EventPlanRecord, plan_id)
    if not record:
        raise HTTPException(status_code=404, detail="EventPlan not found")

    profile = ConstraintProfileSchema.model_validate_json(record.constraint_profile_json)
    vendors = [VendorCandidateSchema.model_validate(v) for v in json.loads(record.vendors_json)]
    categories = [BudgetCategorySchema.model_validate(c) for c in json.loads(record.categories_json)]

    target_vendor = next((v for v in vendors if v.id == vendor_id), None)
    if not target_vendor:
        raise HTTPException(status_code=404, detail="VendorCandidate not found")

    updated_vendors: List[VendorCandidateSchema] = []
    for v in vendors:
        if v.id == vendor_id:
            updated_vendors.append(v.model_copy(update={"selection_status": payload.selection_status}))
        elif payload.selection_status == SelectionStatus.LOCKED and v.category_id == target_vendor.category_id and v.selection_status == SelectionStatus.LOCKED:
            # Unlock previously locked vendor in same category
            updated_vendors.append(v.model_copy(update={"selection_status": SelectionStatus.SHORTLISTED}))
        else:
            updated_vendors.append(v)

    # Update committed_amount on the category
    updated_categories: List[BudgetCategorySchema] = []
    for c in categories:
        if c.id == target_vendor.category_id:
            if payload.selection_status == SelectionStatus.LOCKED:
                quote = calculate_vendor_estimate(target_vendor, profile.guest_count)
                updated_categories.append(c.model_copy(update={"committed_amount": quote, "estimated_amount": quote}))
            else:
                updated_categories.append(c.model_copy(update={"committed_amount": 0.0}))
        else:
            updated_categories.append(c)

    record.vendors_json = json.dumps([v.model_dump() for v in updated_vendors])
    record.categories_json = json.dumps([c.model_dump() for c in updated_categories])
    record.updated_at = utc_now_iso()

    session.add(record)
    session.commit()
    session.refresh(record)
    return _hydrate_plan_response(record, session)


@router.post("/plans/{plan_id}/scout-vendors", response_model=EventPlanResponseSchema)
def scout_vendors(
    plan_id: str,
    payload: ScoutVendorsRequestSchema,
    session: Session = Depends(get_session),
    x_gemini_api_key: Optional[str] = Header(default=None),
):
    record = session.get(EventPlanRecord, plan_id)
    if not record:
        raise HTTPException(status_code=404, detail="EventPlan not found")

    profile = ConstraintProfileSchema.model_validate_json(record.constraint_profile_json)
    categories = [BudgetCategorySchema.model_validate(c) for c in json.loads(record.categories_json)]
    vendors = [VendorCandidateSchema.model_validate(v) for v in json.loads(record.vendors_json)]

    target_cat = next((c for c in categories if c.id == payload.category_id), None)
    if not target_cat:
        raise HTTPException(status_code=404, detail="BudgetCategory not found")

    new_vendors, active_model, mode = scout_vendors_for_category(
        profile=profile,
        category=target_cat,
        custom_focus=payload.custom_focus,
        api_key=x_gemini_api_key,
    )

    vendors.extend(new_vendors)
    record.vendors_json = json.dumps([v.model_dump() for v in vendors])
    record.active_model = active_model
    record.coordinator_mode = mode
    record.updated_at = utc_now_iso()

    session.add(record)
    session.commit()
    session.refresh(record)
    return _hydrate_plan_response(record, session)


@router.post("/plans/{plan_id}/milestones/{milestone_id}/toggle", response_model=EventPlanResponseSchema)
def toggle_milestone(
    plan_id: str,
    milestone_id: str,
    session: Session = Depends(get_session),
):
    record = session.get(EventPlanRecord, plan_id)
    if not record:
        raise HTTPException(status_code=404, detail="EventPlan not found")

    milestones = [MilestoneTaskSchema.model_validate(m) for m in json.loads(record.milestones_json)]
    found = False
    updated: List[MilestoneTaskSchema] = []
    for m in milestones:
        if m.id == milestone_id:
            found = True
            updated.append(m.model_copy(update={"completed": not m.completed}))
        else:
            updated.append(m)

    if not found:
        raise HTTPException(status_code=404, detail="MilestoneTask not found")

    record.milestones_json = json.dumps([m.model_dump() for m in updated])
    record.updated_at = utc_now_iso()

    session.add(record)
    session.commit()
    session.refresh(record)
    return _hydrate_plan_response(record, session)


@router.post("/plans/{plan_id}/timeline/optimize", response_model=EventPlanResponseSchema)
def optimize_plan_timeline(
    plan_id: str,
    session: Session = Depends(get_session),
    x_gemini_api_key: Optional[str] = Header(default=None),
):
    record = session.get(EventPlanRecord, plan_id)
    if not record:
        raise HTTPException(status_code=404, detail="EventPlan not found")

    profile, weather, _, _, milestones, run_of_show, _ = _deserialize_plan_state(record)
    updated_milestones, updated_ros, active_model, mode = optimize_timeline_schedule(
        profile=profile,
        weather=weather,
        milestones=milestones,
        run_of_show=run_of_show,
        api_key=x_gemini_api_key,
    )

    record.milestones_json = json.dumps([m.model_dump() for m in updated_milestones])
    record.run_of_show_json = json.dumps([r.model_dump() for r in updated_ros])
    record.active_model = active_model
    record.coordinator_mode = mode
    record.updated_at = utc_now_iso()

    session.add(record)
    session.commit()
    session.refresh(record)
    return _hydrate_plan_response(record, session)


@router.post("/plans/{plan_id}/chat", response_model=EventPlanResponseSchema)
def chat_with_plan_coordinator(
    plan_id: str,
    payload: ChatRequestSchema,
    session: Session = Depends(get_session),
    x_gemini_api_key: Optional[str] = Header(default=None),
):
    record = session.get(EventPlanRecord, plan_id)
    if not record:
        raise HTTPException(status_code=404, detail="EventPlan not found")

    profile, weather, categories, vendors, _, run_of_show, chat_history = _deserialize_plan_state(record)

    updated_categories, violations = evaluate_plan_constraints(profile, categories, vendors, weather)

    user_turn = CoordinatorChatTurnSchema(
        id=f"chat-{uuid.uuid4().hex[:8]}",
        role="user",
        content=payload.message,
        created_at=utc_now_iso(),
        active_model="user",
    )
    chat_history.append(user_turn)

    reply_md, suggested_tradeoff, active_model, mode = chat_with_coordinator(
        message=payload.message,
        profile=profile,
        categories=updated_categories,
        violations=violations,
        weather=weather,
        vendors=vendors,
        run_of_show=run_of_show,
        api_key=x_gemini_api_key,
    )

    assistant_turn = CoordinatorChatTurnSchema(
        id=f"chat-{uuid.uuid4().hex[:8]}",
        role="assistant",
        content=reply_md,
        created_at=utc_now_iso(),
        active_model=active_model,
        suggested_tradeoff=suggested_tradeoff,
    )
    chat_history.append(assistant_turn)

    record.chat_history_json = json.dumps([t.model_dump() for t in chat_history])
    record.active_model = active_model
    record.coordinator_mode = mode
    record.updated_at = utc_now_iso()

    session.add(record)
    session.commit()
    session.refresh(record)
    return _hydrate_plan_response(record, session)
