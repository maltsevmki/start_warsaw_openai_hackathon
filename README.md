# Agent Commerce API

A FastAPI agent-commerce workflow with live OpenAI web research for real products. Search results are returned through the existing Pydantic contracts, checked against the web sources consulted by the model, compared deterministically, and shown to the user before the existing explicit-approval boundary.

The demo includes:

- intent extraction, clarification, and policy guardrails;
- OpenAI Responses API product research using required live web search;
- direct merchant URLs and visible source evidence for every researched offer;
- deterministic comparison, proposal generation, and stable proposal hashing;
- explicit approval bound to one exact proposal version and hash;
- checkout revalidation, mock payment, and an intentional out-of-stock failure;
- order tracking simulation and a user-visible audit trail;
- permissive CORS for a local frontend.
- a provider-based intent boundary with deterministic and OpenAI structured-output adapters.

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

Workflow state is held in memory. Restarting the process or calling `POST /api/demo/reset` clears it. Live offers are cached in memory so the selected offer remains available to proposal and checkout revalidation code.

## Live product research

Copy the example configuration and add a newly created API key:

```bash
cp .env.example .env
```

`CATALOG_PROVIDER=openai` is the default. Each product search uses the Responses API with the hosted `web_search` tool, live external access, Polish location context, and a strict Pydantic structured output. Search is required rather than optional. Returned product and evidence URLs are rejected unless they occur in the web tool's consulted-source list.

There is no runtime fixture catalog or fallback. If OpenAI product research is unavailable, the API returns a visible service error rather than inventing or substituting canned offers. Small in-memory records used by the automated test suite live under `tests/` only.

## OpenAI intent agent

To enable the OpenAI-backed intent extractor as well, set:

```dotenv
INTENT_PROVIDER=openai
OPENAI_API_KEY=your-rotated-key
OPENAI_INTENT_MODEL=gpt-5-mini
OPENAI_FALLBACK_TO_MOCK=true
```

The key is read only from the environment and `.env` is ignored by Git. Hard application-policy checks run deterministically before the model. Safe requests, including incomplete ones, are classified with a strict Pydantic structured output; application invariants are checked again afterward. When intent fallback is enabled, temporary intent-extraction failures use the offline extractor. Product research has no canned-data fallback.

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
| `POST` | `/api/workflows/{workflowId}/rollback` | Restore an immutable workflow revision and create a new branch |
| `GET` | `/api/workflows/{workflowId}/events` | Fetch the trust/audit trail |
| `POST` | `/api/orders/{orderId}/simulate-status` | Advance mocked order tracking |

All JSON uses the camelCase field names from the shared frontend contract. Optional sections are omitted until they exist, and `workflow.availableActions` tells the UI what it can safely render at every state.

Clarifications include a renderable `fields` array. The existing free-text reply remains supported, while form clients can bind an answer to the active question:

```json
{
  "questionId": "clar_...",
  "answers": [
    {"field": "shoe_size", "value": "42"},
    {"field": "color", "value": "black"}
  ]
}
```

The backend rejects stale question IDs, unknown or duplicate fields, missing required fields, and invalid numeric values before reclassifying the request.

Every completed user-visible mutation adds an immutable entry to `history.revisions`. Each revision includes structured `decision` context when applicable: the clarification question, alternative choices, exact approval terms, checkout failure, policy stop, or order status that the user saw at that point. Send a prior `revisionId` to the rollback endpoint to restore its complete canonical snapshot. The restore is recorded as a new child revision, so abandoned branches remain visible and the domain-event audit log stays append-only. In the fully mocked checkout flow, restoring a pre-order revision records a compensating mock cancellation before clearing order data; a real commerce adapter must replace that rule with an actual merchant-side compensation or reject the rollback.

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

## Expo mobile app

The companion React Native app lives in `mobile/`. It mirrors the web workflow on iOS, Android, and Expo web, including clarification, alternatives, exact-term approval, separate checkout, tracking simulation, revisions, and the trust trail.

```powershell
cd mobile
npm install
npm start
```

Set `EXPO_PUBLIC_API_URL` to the computer's LAN address when testing with Expo Go on a physical phone. See [mobile/README.md](mobile/README.md) for emulator defaults and quality commands.

## Tests

```bash
pytest -q
```

The contract and HTTP suites exercise all required scenarios, every specified module behavior, tamper-resistant approval, checkout failure, and delivery completion.

## Structure

```text
app/
  adapters/              # OpenAI and future external provider implementations
  domain/                # Provider-neutral domain result types
  ports/                 # Contracts consumed by orchestration
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
