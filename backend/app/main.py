from __future__ import annotations

import json
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from app.api.routes import router
from app.db import engine, init_db
from app.domain.models import EventPlanRecord, utc_now_iso
from app.domain.schemas import (
    ConstraintProfileSchema,
    CoordinatorChatTurnSchema,
    CurrencyCode,
    EventVertical,
)
from app.services.agent_coordinator import _build_heuristic_initial_plan
from app.services.weather_service import fetch_weather_context


def seed_default_celebration_if_empty() -> None:
    """Seed a flagship Intimate Udaipur Wedding in INR (₹) if the database has no plans yet."""
    with Session(engine) as session:
        existing = session.exec(select(EventPlanRecord)).first()
        if existing is not None:
            return

        profile = ConstraintProfileSchema(
            event_vertical=EventVertical.INTIMATE_WEDDING,
            currency_code=CurrencyCode.INR,
            total_budget_limit=2200000,
            guest_count=100,
            event_date="2027-02-14",
            location_city="Udaipur",
            venue_capacity_min=110,
            dietary_restrictions=["Jain Counter", "Vegetarian", "Vegan Desserts"],
            vibe_tags=["Heritage Courtyard", "Golden-Hour Phere", "Rajasthani Folk Sangeet"],
            priority_ranking=[
                "Catering & Royal Feast",
                "Venue & Heritage Lawn",
                "Photography & Cinema",
                "Decor & Floral Design",
                "Music & Sangeet Entertainment",
            ],
        )
        weather = fetch_weather_context(profile.location_city, profile.event_date)
        blueprint = _build_heuristic_initial_plan(profile, weather)
        welcome_turn = CoordinatorChatTurnSchema(
            id=f"chat-{uuid.uuid4().hex[:8]}",
            role="assistant",
            content=(
                "Namaste! I have prepared the baseline blueprint for **Aarav & Meera's Intimate Udaipur Wedding** "
                "(100 guests, **₹22,00,000** ceiling, sunset at **17:54**). Try adjusting the **What-If Simulator** "
                "sliders (e.g., increasing guests to 135 or tightening the budget to ₹18,50,000) to see how I calculate "
                "cascading cost impacts and propose priority-aligned **Tradeoff Options**!"
            ),
            created_at=utc_now_iso(),
            active_model="resilient_coordinator",
        )

        record = EventPlanRecord(
            id="plan-udaipur-flagship",
            title="Aarav & Meera's Intimate Udaipur Wedding",
            active_model="resilient_coordinator",
            coordinator_mode="resilient_coordinator",
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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    seed_default_celebration_if_empty()
    yield


app = FastAPI(
    title="UtsavAI — Celebration & Event Coordinator API",
    version="1.0.0",
    lifespan=lifespan,
)

# GZip compression for JSON payloads & static assets
app.add_middleware(GZipMiddleware, minimum_size=500)

# Configure CORS origins safely (disable credentials when wildcard '*' is used)
_raw_origins = os.getenv("CORS_ORIGINS", "*").strip()
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials="*" not in _allowed_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    """Attach hardened HTTP security headers to all API and SPA responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response


app.include_router(router)

# Serve built React frontend in production / Cloud Run single-container deployments
_default_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
STATIC_DIR = Path(os.getenv("STATIC_DIR", str(_default_dist)))

if STATIC_DIR.is_dir() and (STATIC_DIR / "index.html").is_file():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        candidate = (STATIC_DIR / full_path).resolve()
        if full_path and candidate.is_file() and STATIC_DIR.resolve() in candidate.parents:
            return FileResponse(str(candidate))
        return FileResponse(str(STATIC_DIR / "index.html"))

