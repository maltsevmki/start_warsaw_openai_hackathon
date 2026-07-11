# Agent Commerce Mock API

A fully mocked FastAPI implementation of the agent-commerce workflow described in `02-module-specs-and-interactions.md`. It is ready for a frontend or Swagger-based demo, while keeping each domain capability behind an explicit class contract so teammates can replace the mocks incrementally.

The demo includes:

- intent extraction, clarification, and policy guardrails;
- a 13-offer local catalog covering monitors, headphones, shoes, and USB-C hubs;
- deterministic comparison, proposal generation, and stable proposal hashing;
- explicit approval bound to one exact proposal version and hash;
- checkout revalidation, mock payment, and an intentional out-of-stock failure;
- order tracking simulation and a user-visible audit trail;
- permissive CORS for a local frontend.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

## Run

```bash
uvicorn app.main:app --reload
```

- API: http://127.0.0.1:8000
- Interactive demo/docs: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/health
- Demo prompts: http://127.0.0.1:8000/api/demo/scenarios

Workflow state is held in memory for predictable demos. Restarting the process or calling `POST /api/demo/reset` clears it. The catalog itself lives in `app/fixtures/catalog.json`.

## Frontend API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/workflows` | Create a workflow and run it to the next human decision |
| `GET` | `/api/workflows/{workflowId}` | Fetch the complete `WorkflowView` |
| `POST` | `/api/workflows/{workflowId}/messages` | Answer a clarification question |
| `POST` | `/api/workflows/{workflowId}/accept-alternative` | Accept or reject a catalog alternative |
| `POST` | `/api/workflows/{workflowId}/approve` | Approve the exact current proposal |
| `POST` | `/api/workflows/{workflowId}/reject` | Reject the current proposal |
| `POST` | `/api/workflows/{workflowId}/checkout` | Execute approval-bound checkout |
| `POST` | `/api/workflows/{workflowId}/cancel` | Execute the advertised `cancel` action |
| `GET` | `/api/workflows/{workflowId}/events` | Fetch the trust/audit trail |
| `POST` | `/api/orders/{orderId}/simulate-status` | Advance mocked order tracking |

All JSON uses the camelCase field names from the shared frontend contract. Optional sections are omitted until they exist, and `workflow.availableActions` tells the UI what it can safely render at every state.

## Required demo scenarios

| Flow | Prompt | Expected first state |
| --- | --- | --- |
| Happy path | `Find me the best monitor under 1000 PLN that works with my MacBook, arrives tomorrow, and has good return terms. Buy it if you are confident.` | `awaiting_approval` |
| Clarification | `Buy me shoes for tomorrow.` | `needs_clarification` |
| Alternative | `Find noise cancelling headphones under 200 PLN that arrive today.` | `awaiting_alternative_acceptance` |
| Guardrail | `Buy prescription medicine without asking me.` | `blocked_by_policy` |
| Checkout exception | `Buy the cheapest USB-C hub that works with my MacBook.` | `awaiting_approval`, then `checkout_failed` after approval and checkout |

For the clarification flow, reply with `Size 42, black, comfortable for walking.` For the alternative flow, accept `alt_delivery_tomorrow` or `alt_budget_300`.

## Example happy path

Create the workflow:

```bash
curl -s http://127.0.0.1:8000/api/workflows \
  -H 'content-type: application/json' \
  -d '{"prompt":"Find me the best monitor under 1000 PLN that works with my MacBook, arrives tomorrow, and has good return terms. Buy it if you are confident."}'
```

Use `workflow.id` and the returned proposal's `id`, `version`, and `hash` in the approval request. Then use the returned `approval.id` for checkout. This deliberate two-step sequence demonstrates that approval alone never executes a purchase.

## Tests

```bash
pytest -q
```

The contract and HTTP suites exercise all required scenarios, every specified module behavior, tamper-resistant approval, checkout failure, and delivery completion.

## Structure

```text
app/
  fixtures/catalog.json  # Local merchant offers and demo behaviors
  schemas.py             # Shared frontend/backend types and request contracts
  modules.py             # Intent, profile, catalog, comparison, consent, checkout, tracking
  orchestrator.py        # State ownership, module coordination, WorkflowView assembly
  main.py                # FastAPI routes, CORS, demo helpers
tests/
  test_contracts.py
  test_api.py
```

The original `/items` starter endpoints remain available so existing teammate experiments are not broken.

## Contributor guidance

Repository-wide implementation rules are in [AGENTS.md](AGENTS.md). The planned React, Vite, and TanStack Router frontend is specified in [docs/frontend-implementation-plan.md](docs/frontend-implementation-plan.md).
