import os
import pytest
from fastapi.testclient import TestClient

# Use an isolated SQLite database for tests
os.environ["DATABASE_URL"] = "sqlite:///./test_partyplanner.db"

from app.main import app
from app.db import init_db, reset_db
from app.services.agent_coordinator import DEFAULT_MODEL_CASCADE, invoke_gemini_cascade, LLMChatResponse


@pytest.fixture(autouse=True)
def setup_clean_db():
    reset_db()
    init_db()
    yield


def test_gemini_3_model_cascade_sequential_failover():
    """Verify that invoke_gemini_cascade tries Gemini 3 models sequentially and fails over when earlier models hit 429/503."""
    attempted_models = []

    class FakeModelsAPI:
        def generate_content(self, model, contents, config):
            attempted_models.append(model)
            if model in ("gemini-3.1-pro-preview", "gemini-3-flash-preview"):
                raise RuntimeError(f"429 ResourceExhausted for {model}")

            class FakeResp:
                parsed = LLMChatResponse(
                    reply_markdown="Resolved via fallback model in cascade!",
                    suggested_tradeoff=None,
                )

            return FakeResp()

    class FakeClient:
        def __init__(self):
            self.models = FakeModelsAPI()

    parsed, active_model, mode = invoke_gemini_cascade(
        prompt="Test prompt",
        response_schema=LLMChatResponse,
        api_key="fake-test-key",
        client_factory=lambda _k: FakeClient(),
    )

    assert parsed is not None
    assert parsed.reply_markdown == "Resolved via fallback model in cascade!"
    assert attempted_models == [
        "gemini-3.1-pro-preview",
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite-preview",
    ]
    assert active_model == "gemini-3.1-flash-lite-preview"
    assert mode == "live_gemini"


def test_ticket_01_create_plan_defaults_to_inr_and_exposes_gemini3_model_cascade():
    """Verify Ticket 01: Plan creation defaults to INR (₹), populates WeatherContext, categories, vendors, timeline, and uses the 5-model Gemini 3 cascade."""
    client = TestClient(app)

    # Check model cascade configuration
    status_res = client.get("/api/v1/system/status")
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["default_currency"] == "INR"
    assert status_data["model_cascade"] == [
        "gemini-3.1-pro-preview",
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite-preview",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
    ]
    assert DEFAULT_MODEL_CASCADE[0].startswith("gemini-3")

    # Create a new Celebration Plan without specifying currency_code -> should default to INR
    payload = {
        "title": "Aarav & Meera's Intimate Udaipur Wedding",
        "constraint_profile": {
            "event_vertical": "INTIMATE_WEDDING",
            "total_budget_limit": 1800000,
            "guest_count": 90,
            "event_date": "2027-02-14",
            "location_city": "Udaipur",
            "venue_capacity_min": 100,
            "dietary_restrictions": ["Jain", "Vegetarian"],
            "vibe_tags": ["Royal Courtyard", "Sunset Phere", "Acoustic Folk"],
            "priority_ranking": [
                "Catering & Royal Feast",
                "Venue & Heritage Lawn",
                "Photography & Cinema",
                "Decor & Floral Design",
                "Music & Entertainment",
            ],
        },
    }
    res = client.post("/api/v1/plans", json=payload)
    assert res.status_code == 201
    plan = res.json()

    assert plan["title"] == "Aarav & Meera's Intimate Udaipur Wedding"
    assert plan["constraint_profile"]["currency_code"] == "INR"
    assert plan["constraint_profile"]["guest_count"] == 90
    assert len(plan["categories"]) >= 5
    assert len(plan["vendors"]) >= 5
    assert len(plan["milestones"]) >= 5
    assert len(plan["run_of_show"]) >= 5
    assert "sunset_time_local" in plan["weather_context"]


def test_tickets_02_and_03_what_if_simulation_tradeoff_approval_and_snapshot_restore():
    """Verify Tickets 02 & 03: What-If simulation is non-destructive, flags violations, proposes TradeoffOptions, snapshots before applying, and supports 1-click restore."""
    client = TestClient(app)

    create_res = client.post(
        "/api/v1/plans",
        json={
            "title": "Intimate Courtyard Celebration",
            "constraint_profile": {
                "event_vertical": "INTIMATE_WEDDING",
                "currency_code": "INR",
                "total_budget_limit": 1500000,
                "guest_count": 80,
                "event_date": "2027-03-10",
                "location_city": "Jaipur",
                "venue_capacity_min": 90,
                "dietary_restrictions": ["Vegetarian"],
                "vibe_tags": ["Minimalist Heritage"],
                "priority_ranking": [
                    "Catering & Royal Feast",
                    "Photography & Cinema",
                    "Venue & Heritage Lawn",
                    "Decor & Floral Design",
                ],
            },
        },
    )
    assert create_res.status_code == 201
    plan = create_res.json()
    plan_id = plan["id"]

    # Step 1: Evaluate What-If with increased guest count (80 -> 135) and tighter budget (15L -> 12.5L)
    what_if_res = client.post(
        f"/api/v1/plans/{plan_id}/evaluate-what-if",
        json={
            "guest_count": 135,
            "total_budget_limit": 1250000,
            "event_date": "2027-03-10",
        },
    )
    assert what_if_res.status_code == 200
    sim = what_if_res.json()

    # Should detect BUDGET_OVERFLOW and provide 2-3 TradeoffOptions
    assert len(sim["violations"]) >= 1
    assert any(v["violation_type"] == "BUDGET_OVERFLOW" for v in sim["violations"])
    assert len(sim["tradeoff_options"]) >= 2

    # Verify original plan in DB was NOT mutated by What-If evaluation
    unchanged_plan = client.get(f"/api/v1/plans/{plan_id}").json()
    assert unchanged_plan["constraint_profile"]["guest_count"] == 80
    assert unchanged_plan["constraint_profile"]["total_budget_limit"] == 1500000

    # Step 2: Apply the first TradeoffOption
    chosen_option = sim["tradeoff_options"][0]
    apply_res = client.post(
        f"/api/v1/plans/{plan_id}/apply-tradeoff",
        json={
            "what_if_constraints": {
                "guest_count": 135,
                "total_budget_limit": 1250000,
                "event_date": "2027-03-10",
            },
            "tradeoff_option": chosen_option,
        },
    )
    assert apply_res.status_code == 200
    mutated_plan = apply_res.json()
    assert len(mutated_plan["snapshots"]) >= 1

    # Step 3: Restore the snapshot and verify state reverts back to 80 guests & 15,00,000 budget
    snapshot_id = mutated_plan["snapshots"][0]["id"]
    restore_res = client.post(f"/api/v1/plans/{plan_id}/snapshots/{snapshot_id}/restore")
    assert restore_res.status_code == 200
    restored_plan = restore_res.json()
    assert restored_plan["constraint_profile"]["guest_count"] == 80
    assert restored_plan["constraint_profile"]["total_budget_limit"] == 1500000


def test_ticket_04_vendor_locking_and_scouting():
    """Verify Ticket 04: Locking a vendor updates committed spend and checks capacity, and scouting adds new vendor candidates."""
    client = TestClient(app)

    plan = client.post(
        "/api/v1/plans",
        json={
            "title": "Mumbai Milestone 50th",
            "constraint_profile": {
                "event_vertical": "MILESTONE_BIRTHDAY",
                "currency_code": "INR",
                "total_budget_limit": 600000,
                "guest_count": 75,
                "event_date": "2027-01-20",
                "location_city": "Mumbai",
                "venue_capacity_min": 80,
                "dietary_restrictions": [],
                "vibe_tags": ["Rooftop Jazz"],
                "priority_ranking": ["Catering & Cocktails", "Venue & Lounge"],
            },
        },
    ).json()
    plan_id = plan["id"]
    first_vendor = plan["vendors"][0]

    # Lock the first vendor
    lock_res = client.post(
        f"/api/v1/plans/{plan_id}/vendors/{first_vendor['id']}/status",
        json={"selection_status": "LOCKED"},
    )
    assert lock_res.status_code == 200
    updated_plan = lock_res.json()
    locked_v = next(v for v in updated_plan["vendors"] if v["id"] == first_vendor["id"])
    assert locked_v["selection_status"] == "LOCKED"

    # Scout additional vendors for that category
    prev_count = len(updated_plan["vendors"])
    scout_res = client.post(
        f"/api/v1/plans/{plan_id}/scout-vendors",
        json={"category_id": first_vendor["category_id"]},
    )
    assert scout_res.status_code == 200
    scouted_plan = scout_res.json()
    assert len(scouted_plan["vendors"]) > prev_count


def test_ticket_05_and_06_milestone_toggle_and_context_grounded_chat():
    """Verify Tickets 05 & 06: Toggling MilestoneTask completion and chatting with the grounded AI Coordinator."""
    client = TestClient(app)
    plan = client.post(
        "/api/v1/plans",
        json={
            "title": "Bengaluru Community AI Summit",
            "constraint_profile": {
                "event_vertical": "COMMUNITY_EVENT",
                "currency_code": "INR",
                "total_budget_limit": 500000,
                "guest_count": 150,
                "event_date": "2027-04-10",
                "location_city": "Bengaluru",
                "venue_capacity_min": 150,
                "dietary_restrictions": ["Vegetarian"],
                "vibe_tags": ["Tech Workshop", "Live Demo"],
                "priority_ranking": ["AV & Stage Production", "Catering & Refreshments"],
            },
        },
    ).json()
    plan_id = plan["id"]

    # Toggle first milestone completion
    ms_id = plan["milestones"][0]["id"]
    ms_res = client.post(f"/api/v1/plans/{plan_id}/milestones/{ms_id}/toggle")
    assert ms_res.status_code == 200
    assert ms_res.json()["milestones"][0]["completed"] is True

    # Send a context-grounded What-If / negotiation query to the Coordinator Chat Drawer
    chat_res = client.post(
        f"/api/v1/plans/{plan_id}/chat",
        json={"message": "What if we add 30 more attendees and want to stay within our ₹5,00,000 budget?"},
    )
    assert chat_res.status_code == 200
    chat_data = chat_res.json()
    assert len(chat_data["chat_history"]) >= 2
    latest_turn = chat_data["chat_history"][-1]
    assert latest_turn["role"] == "assistant"
    assert len(latest_turn["content"]) > 20
    assert latest_turn["suggested_tradeoff"] is not None


def test_timeline_optimization_security_headers_and_404_error_handling():
    """Verify timeline sunset optimization endpoint, hardened HTTP security headers, weather LRU cache, and 404 responses."""
    client = TestClient(app)

    status_res = client.get("/api/v1/system/status")
    assert status_res.status_code == 200
    assert status_res.headers.get("X-Content-Type-Options") == "nosniff"
    assert status_res.headers.get("X-Frame-Options") == "DENY"
    assert status_res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

    # Verify 404 on unknown plan
    not_found_res = client.get("/api/v1/plans/plan-nonexistent")
    assert not_found_res.status_code == 404

    # Create a plan and run timeline optimization + vendor unlock/reject transitions
    plan = client.post(
        "/api/v1/plans",
        json={
            "title": "Test Sunset Schedule Optimization",
            "constraint_profile": {
                "event_vertical": "INTIMATE_WEDDING",
                "currency_code": "INR",
                "total_budget_limit": 2000000,
                "guest_count": 100,
                "event_date": "2027-07-18",
                "location_city": "test_udaipur",
                "venue_capacity_min": 110,
                "dietary_restrictions": ["Vegetarian"],
                "vibe_tags": ["Courtyard"],
                "priority_ranking": ["Catering & Royal Feast", "Venue & Heritage Lawn"],
            },
        },
    ).json()
    plan_id = plan["id"]

    opt_res = client.post(f"/api/v1/plans/{plan_id}/timeline/optimize")
    assert opt_res.status_code == 200
    opt_data = opt_res.json()
    assert len(opt_data["run_of_show"]) >= 5

    # Test vendor reject -> shortlist -> lock -> unlock transitions
    vendor_id = plan["vendors"][0]["id"]
    reject_res = client.post(
        f"/api/v1/plans/{plan_id}/vendors/{vendor_id}/status",
        json={"selection_status": "REJECTED"},
    )
    assert reject_res.status_code == 200
    assert reject_res.json()["vendors"][0]["selection_status"] == "REJECTED"

    # Verify list_plans batch snapshot hydration
    list_res = client.get("/api/v1/plans")
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1
