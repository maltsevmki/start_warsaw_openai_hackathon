# Agent brief — Agent Commerce backend (Warsaw OpenAI hackathon)

> Hand this whole file to an AI agent (or a new teammate) before it writes any code.
> Part A is reusable project context for **any** task. Part B is the **current assignment: the WebSocket layer**.

---

## Part A — Project context (read this first)

### What we are building
An **AI agent that buys a product for a user, end to end**. The user sends a natural-language prompt ("find me the best monitor under 1000 PLN that works with my MacBook and arrives tomorrow, buy it if you're confident"). The agent classifies the request, checks safety, researches a catalog, compares offers, produces an exact checkout proposal, waits for **explicit human approval**, checks out, and tracks the order. A web/mobile client drives it.

The full intended flow:

```
User prompt
  → Classify ──(need info)──> Ask follow-up ──> (loop back)
             ──(policy hit)──> Guardrail ──> End
             ──(valid)──> Research
                            ──(nothing)──> Recommend alternative ──(reject)──> Cancel
                                                                  ──(accept)──> Compare
                            ──(found)────────────────────────────────────────> Compare
                                                                                 → Checkout proposal
                                                                                    → Approve? ──(no)──> Cancel
                                                                                              ──(yes)──> Checkout
                                                                                                          → Tracking → Completed
```

### Current state (important)
The **entire flow already exists in code but every "smart" step is mocked** (deterministic stubs). The mock is intentional: each capability is a swappable class so we can replace mocks with real AI/APIs one at a time without breaking the rest. Business rules (comparison, proposal hashing, approval binding) are already real.

**17 tests pass.** Do not break them.

### Tech stack
- Python **3.13**, FastAPI, **Pydantic v2**.
- All API JSON is **camelCase** via pydantic field aliases; responses use `by_alias=True` and drop null fields (`response_model_exclude_none=True`).
- SQLite + SQLAlchemy exists but only stores the leftover starter `Item` demo. **Workflow state is in memory**, not in the DB.
- Errors: raise `DomainError(message, status_code)` (from `app/modules.py`). The REST layer already maps it to `{"detail": message}` with that status.

### File map
```
app/
  main.py            FastAPI routes, CORS(*), DomainError handler, demo helpers, starter /items
  orchestrator.py    WorkflowOrchestrator — the brain. Owns ALL state in an in-memory dict.
                     16-state machine, calls modules in order, records DomainEvent audit trail,
                     assembles the WorkflowView returned to the client.
  modules.py         8 capability classes (the swap points):
                       DemoProfileModule   - hardcoded demo user (Warsaw, MacBook, demo card)
                       IntentGuardrailModule - MOCK classify/clarify/guardrail (regex+keywords)
                       ProductCatalogModule - OpenAI web research and in-memory offer cache
                       ComparisonModule    - REAL deterministic scoring/ranking
                       ProposalModule      - REAL proposal build + sha256 hash of exact terms
                       ConsentAuditModule  - REAL approve/reject bound to id+version+hash
                       MockCheckoutModule  - MOCK payment + revalidation (fakes out-of-stock etc.)
                       MockTrackingModule  - MOCK order status simulation
  schemas.py         All request/response pydantic models (THE data contract). camelCase aliases.
  database.py, models.py  SQLite/SQLAlchemy (starter Item only)
tests/
  fakes.py               test-only deterministic offer records
  test_contracts.py  module-level behavior
  test_api.py        HTTP endpoint behavior for the 5 demo scenarios
docs/AGENT_BRIEF.md  this file
```

### The state machine (WorkflowSummary.state)
`created → needs_clarification | blocked_by_policy | researching → no_exact_match | awaiting_alternative_acceptance | comparing → proposal_ready → awaiting_approval → checkout_in_progress → checkout_failed | ordered → tracking → completed`, plus `rejected` and `cancelled`.

Every `WorkflowView.workflow.availableActions` tells the client which actions are legal right now. The client should only offer those. Action → state guard is enforced server-side (`_require_state`), so illegal actions raise `DomainError`.

### The orchestrator's public methods (the single source of truth — reuse these, never re-implement flow logic)
```python
start_workflow(prompt: str) -> WorkflowView            # create + run to next human decision
get_workflow(workflow_id) -> WorkflowView
get_events(workflow_id) -> list[DomainEvent]
add_user_message(workflow_id, message) -> WorkflowView  # answer a clarification
accept_alternative(workflow_id, accepted: bool, alternative_id: str|None) -> WorkflowView
approve_proposal(workflow_id, proposal_id, proposal_version: int, proposal_hash) -> WorkflowView
reject_proposal(workflow_id, proposal_id, reason: str|None) -> WorkflowView
execute_checkout(workflow_id, approval_id) -> WorkflowView
simulate_order_status(order_id, status) -> WorkflowView
cancel_workflow(workflow_id) -> WorkflowView
reset() -> None                                         # clears all state (demo reset)
```
There is one global instance in `app/main.py`: `orchestrator = WorkflowOrchestrator()`. Use that same instance.

### Existing REST contract (the WebSocket layer must mirror this, not diverge)
| Method | Path | Body | Orchestrator call |
|---|---|---|---|
| POST | /api/workflows | `{prompt}` | start_workflow |
| GET | /api/workflows/{id} | – | get_workflow |
| POST | /api/workflows/{id}/messages | `{message}` | add_user_message |
| POST | /api/workflows/{id}/accept-alternative | `{accepted, alternativeId?}` | accept_alternative |
| POST | /api/workflows/{id}/approve | `{proposalId, proposalVersion, proposalHash, approved}` | approve_proposal / reject_proposal |
| POST | /api/workflows/{id}/reject | `{proposalId, reason?}` | reject_proposal |
| POST | /api/workflows/{id}/checkout | `{approvalId}` | execute_checkout |
| POST | /api/workflows/{id}/cancel | – | cancel_workflow |
| GET | /api/workflows/{id}/events | – | get_events |
| POST | /api/orders/{orderId}/simulate-status | `{status}` | simulate_order_status |

`WorkflowView` (returned everywhere) contains: `workflow` (id, state, prompt, summary, availableActions, timestamps), and optional `clarification`, `guardrail`, `constraints`, `alternatives`, `comparison`, `proposal`, `approval`, `checkout`, `order`, and full `events[]`. Exact fields live in `app/schemas.py` — that file is the contract; read it, don't guess.

### Trust invariant (do not weaken)
Approval is cryptographically bound to the exact proposal the user saw: `proposalId` + `proposalVersion` + `proposalHash` (sha256 over the priced terms). Approving with a wrong/tampered hash is rejected. Approval alone never buys anything — checkout is a separate, approval-bound step. Any new transport must preserve this two-step guarantee.

### How to run & test
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload         # http://127.0.0.1:8000  (docs at /docs)
pytest -q                             # must stay green (17 passing)
```

### Team working rules
- **Everything merges to `main`.** For parallel work use a git worktree/branch and merge to main often (`git pull --rebase` before push).
- **Commit important steps** as you go so progress is never lost.
- **Speed over polish.** Light mock tests are fine; do not build an exhaustive suite. Ship the implementation.
- **Own your files.** `schemas.py` and `orchestrator.py` are shared hot files — avoid editing them unless your task truly needs it, and coordinate if you do.

---

## Part B — CURRENT TASK: WebSocket streaming layer

### Goal
Add a WebSocket transport so the web/mobile client drives a whole purchase over one live connection instead of polling REST. It must be a **thin transport over the existing `orchestrator`** — same logic, same `WorkflowView` payloads, camelCase. Keep all REST endpoints working.

### Where the code goes
- New file: `app/ws.py` (a `fastapi.APIRouter` with the websocket route + a small connection manager).
- One small wire-up line in `app/main.py`: `app.include_router(ws.router)`. (This is the only edit outside your new file — keep it to that.)
- **Do not edit** `orchestrator.py`, `modules.py`, or `schemas.py` for the MVP. If you want live event push (stretch goal below), that touches `orchestrator.py` — flag it and coordinate first.

### Protocol (MVP)
Endpoint: `ws://<host>/ws`

**Client → server** — JSON messages, one `action` each. Mirror the REST table:
```jsonc
{ "action": "start",              "prompt": "..." }
{ "action": "get",                "workflowId": "wf_..." }
{ "action": "reply",              "workflowId": "wf_...", "message": "Size 42, black" }
{ "action": "accept_alternative", "workflowId": "wf_...", "accepted": true, "alternativeId": "alt_..." }
{ "action": "approve",            "workflowId": "wf_...", "proposalId": "...", "proposalVersion": 1, "proposalHash": "sha256:..." }
{ "action": "reject",             "workflowId": "wf_...", "proposalId": "...", "reason": "too expensive" }
{ "action": "checkout",           "workflowId": "wf_...", "approvalId": "appr_..." }
{ "action": "cancel",             "workflowId": "wf_..." }
{ "action": "simulate_status",    "orderId": "order_...", "status": "delivered" }
```

**Server → client** — JSON messages:
```jsonc
{ "type": "workflow", "data": { ...full WorkflowView... } }   // after every successful action
{ "type": "error",    "code": 409, "detail": "human-readable message" }  // on DomainError / bad input
{ "type": "ready" }                                            // optional, sent on connect
```

Each action maps 1:1 to the orchestrator method in the REST table above. `approve` with `"reject": true` or an explicit `reject` action → `reject_proposal`.

### Implementation notes / gotchas
- Serialize the view with pydantic v2, camelCase, drop nulls, JSON-safe datetimes:
  ```python
  await ws.send_json({"type": "workflow", "data": view.model_dump(by_alias=True, exclude_none=True, mode="json")})
  ```
  (`mode="json"` is required — `WorkflowView` holds `datetime`/`sha256` fields.)
- Wrap each inbound message in try/except: catch `DomainError` → send `{"type":"error","code":exc.status_code,"detail":exc.message}`; catch validation/`KeyError`/`json` errors → send a 422-style error. **Never let one bad message kill the socket.**
- Catch `WebSocketDisconnect` to clean up the connection.
- The orchestrator is a single in-memory global and is **not thread-safe**. Call it directly on the event loop (don't offload to threads). If you fan out to multiple sockets, guard mutations with a module-level `asyncio.Lock`.
- Reuse the existing `orchestrator` instance imported from `app.main` (or inject it) — do **not** create a second one, or state won't match REST.
- Multiple clients may watch the same `workflowId`; a simple `dict[workflowId, set[WebSocket]]` connection manager lets you broadcast the updated view to all watchers of that workflow after any action.

### Stretch goal (only if MVP is done and committed) — live event push
The client would love to see each `DomainEvent` as the agent works, not just the final view. The orchestrator records events but has no publish hook. Minimal approach: add an optional `on_event` callback to the orchestrator that the WS manager subscribes to, and emit `{ "type": "event", "data": <DomainEvent> }` as they occur. **This edits `orchestrator.py` (a shared hot file) — coordinate before doing it.**

### Acceptance criteria
1. `uvicorn app.main:app --reload` starts; connecting to `/ws` works.
2. Sending `{"action":"start","prompt":"<happy-path monitor prompt>"}` returns a `workflow` message whose `data.workflow.state == "awaiting_approval"` and includes a `proposal` with `hash`.
3. Then `approve` (echoing that proposal's id/version/hash) → `awaiting_approval` with an `approval`; then `checkout` (with `approvalId`) → `tracking` with an `order`; then `simulate_status delivered` → `completed`.
4. A bad hash on `approve` yields `{"type":"error","code":409,...}` and the socket stays open.
5. All 17 existing tests still pass; add ~2–3 lightweight WS tests using `TestClient`'s `websocket_connect`.
6. REST endpoints are unchanged and still work.

### Git
```bash
git worktree add ../hack-websocket -b feat/websocket   # or just: git checkout -b feat/websocket
# build, committing important steps:
git commit -am "feat(ws): websocket transport over orchestrator"
git pull --rebase && git push
# merge to main when green
```

### Explicit don'ts
- Don't duplicate flow logic in the WS layer — call the orchestrator.
- Don't weaken the approval/hash trust invariant.
- Don't change existing response shapes or break REST.
- Don't add auth/DB/real payments — out of scope for this task.
