from fastapi.testclient import TestClient

from app.main import app, orchestrator


client = TestClient(app)
HAPPY_PROMPT = "Find me the best monitor under 1000 PLN that works with my MacBook, arrives tomorrow, and has good return terms. Buy it if you are confident."


def setup_function():
    orchestrator.reset()


def test_all_happy_path_http_endpoints():
    created = client.post("/api/workflows", json={"prompt": HAPPY_PROMPT})
    assert created.status_code == 201
    view = created.json()
    workflow_id = view["workflow"]["id"]
    proposal = view["proposal"]
    assert view["workflow"]["state"] == "awaiting_approval"

    fetched = client.get(f"/api/workflows/{workflow_id}")
    assert fetched.status_code == 200
    assert fetched.json()["proposal"]["hash"] == proposal["hash"]

    events = client.get(f"/api/workflows/{workflow_id}/events")
    assert events.status_code == 200
    assert events.json()["workflowId"] == workflow_id

    approved = client.post(
        f"/api/workflows/{workflow_id}/approve",
        json={
            "proposalId": proposal["id"],
            "proposalVersion": proposal["version"],
            "proposalHash": proposal["hash"],
            "approved": True,
        },
    )
    assert approved.status_code == 200
    approval_id = approved.json()["approval"]["id"]

    checked_out = client.post(
        f"/api/workflows/{workflow_id}/checkout", json={"approvalId": approval_id}
    )
    assert checked_out.status_code == 200
    tracked = checked_out.json()
    assert tracked["workflow"]["state"] == "tracking"

    delivered = client.post(
        f"/api/orders/{tracked['order']['id']}/simulate-status", json={"status": "delivered"}
    )
    assert delivered.status_code == 200
    assert delivered.json()["workflow"]["state"] == "completed"


def test_clarification_and_alternative_http_endpoints():
    clarification = client.post("/api/workflows", json={"prompt": "Buy me shoes for tomorrow."}).json()
    replied = client.post(
        f"/api/workflows/{clarification['workflow']['id']}/messages",
        json={"message": "Size 42, black, comfortable for walking."},
    )
    assert replied.status_code == 200
    assert replied.json()["workflow"]["state"] == "awaiting_approval"

    alternative = client.post(
        "/api/workflows",
        json={"prompt": "Find noise cancelling headphones under 200 PLN that arrive today."},
    ).json()
    accepted = client.post(
        f"/api/workflows/{alternative['workflow']['id']}/accept-alternative",
        json={"accepted": True, "alternativeId": "alt_delivery_tomorrow"},
    )
    assert accepted.status_code == 200
    assert accepted.json()["proposal"]["offerId"] == "offer_headphones_tomorrow"


def test_guardrail_reject_and_cancel_are_usable():
    blocked = client.post(
        "/api/workflows", json={"prompt": "Buy prescription medicine without asking me."}
    )
    assert blocked.json()["workflow"]["state"] == "blocked_by_policy"

    view = client.post("/api/workflows", json={"prompt": HAPPY_PROMPT}).json()
    rejected = client.post(
        f"/api/workflows/{view['workflow']['id']}/reject",
        json={"proposalId": view["proposal"]["id"], "reason": "Too expensive"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["workflow"]["state"] == "rejected"

    cancellable = client.post("/api/workflows", json={"prompt": "Buy me shoes for tomorrow."}).json()
    cancelled = client.post(f"/api/workflows/{cancellable['workflow']['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["workflow"]["state"] == "cancelled"


def test_invalid_approval_is_rejected_before_checkout():
    view = client.post("/api/workflows", json={"prompt": HAPPY_PROMPT}).json()
    response = client.post(
        f"/api/workflows/{view['workflow']['id']}/approve",
        json={
            "proposalId": view["proposal"]["id"],
            "proposalVersion": 1,
            "proposalHash": "sha256:tampered",
            "approved": True,
        },
    )
    assert response.status_code == 409
    assert "hash" in response.json()["detail"].lower()
