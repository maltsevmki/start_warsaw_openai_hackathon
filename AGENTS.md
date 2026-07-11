# Project Instructions for Coding Agents

## Scope

This file applies to the entire repository. More specific `AGENTS.md` files may be added under a subdirectory later; when present, the closest file to the code being changed takes precedence.

## Project Mission

Build a trustworthy agent-commerce demo in which a user describes a purchase, sees how offers were compared, explicitly approves exact checkout terms, and can follow the resulting mock order.

The backend is intentionally fully mocked today. Teammates will progressively replace individual modules with real implementations, so preserve module contracts and avoid coupling the frontend to fixture-specific behavior.

## Current Architecture

```text
Frontend -> FastAPI routes -> WorkflowOrchestrator -> domain modules -> local store/fixtures
```

The important files are:

- `app/main.py`: HTTP boundary, request validation, CORS, and route wiring.
- `app/orchestrator.py`: sole owner of workflow state transitions and `WorkflowView` assembly.
- `app/modules.py`: profile, offline intent, catalog, comparison, proposal, consent, checkout, and tracking mocks.
- `app/ports/intent.py`: provider-neutral intent contract.
- `app/adapters/openai_intent.py`: structured-output OpenAI intent agent.
- `app/factories.py`: environment-driven adapter selection.
- `app/schemas.py`: shared request, response, and domain contracts.
- `app/fixtures/catalog.json`: deterministic demo offers and checkout behaviors.
- `tests/test_contracts.py`: module and orchestration contracts.
- `tests/test_api.py`: frontend-facing HTTP contract tests.
- `docs/frontend-implementation-plan.md`: planned React/Vite/TanStack Router frontend.

The original design source is:

```text
/Users/user/Documents/Codex/2026-07-11/flowchart-td-a-user-prompt-a/outputs/02-module-specs-and-interactions.md
```

That path may not exist on another machine. In that case, `app/schemas.py`, the FastAPI OpenAPI document, and the contract tests are the local sources of truth.

## Architectural Rules

1. The UI talks only to the FastAPI API. It must not import backend modules, read catalog fixtures, or infer hidden mock behavior.
2. API handlers delegate commerce behavior to `WorkflowOrchestrator`; do not put state-machine logic in route functions.
3. Only `WorkflowOrchestrator` changes `WorkflowState` or computes `availableActions`.
4. Domain modules return structured results. They do not mutate workflow records directly.
5. Every real state transition appends a `workflow.state_changed` event.
6. Every material decision or side effect appends a small, readable domain event for the trust trail.
7. Checkout never runs without a valid approval bound to the current proposal ID, version, and hash.
8. Checkout revalidates price, stock, delivery, and return terms before mock payment.
9. Never expose payment tokens or raw payment data to the frontend. Only the payment method label is part of a proposal.
10. Keep mocks deterministic. Demo behavior belongs in fixtures or clearly named module rules, not random branches.

## API Contract

Frontend code should treat `WorkflowView` as the complete render model. All JSON fields use camelCase, even though Python fields use snake_case internally.

Required API operations:

| Method | Path |
| --- | --- |
| `POST` | `/api/workflows` |
| `GET` | `/api/workflows/{workflowId}` |
| `POST` | `/api/workflows/{workflowId}/messages` |
| `POST` | `/api/workflows/{workflowId}/accept-alternative` |
| `POST` | `/api/workflows/{workflowId}/approve` |
| `POST` | `/api/workflows/{workflowId}/reject` |
| `POST` | `/api/workflows/{workflowId}/checkout` |
| `POST` | `/api/workflows/{workflowId}/cancel` |
| `GET` | `/api/workflows/{workflowId}/events` |
| `POST` | `/api/orders/{orderId}/simulate-status` |

When changing an endpoint or schema:

- preserve existing fields unless an intentional coordinated migration is being made;
- update `app/schemas.py`, route response models, contract tests, and frontend types together;
- keep error responses in FastAPI's `{"detail": "..."}` shape;
- ensure `workflow.availableActions` contains only actions that have a usable UI/API path;
- verify the generated OpenAPI document still contains all required operations.

## Workflow State Guidance

Happy-path automation should continue until the next human decision. Stop at:

- `needs_clarification` for missing information;
- `blocked_by_policy` for an unsafe or unsupported request;
- `awaiting_alternative_acceptance` when constraints must change;
- `awaiting_approval` before any checkout;
- `checkout_failed` when revalidation or payment fails;
- `tracking` when a delivery exception needs attention.

Approval records consent only. It must enable `execute_checkout` but must not automatically perform checkout.

## Backend Development

Use Python type hints and Pydantic models at all public module and API boundaries. Prefer small, explicit domain methods over passing unstructured dictionaries; dictionaries are acceptable only for genuinely open event payloads or internal order seeds already described by the contract.

To set up and run:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

Before handing off backend changes:

```bash
pytest -q
python -m compileall -q app
```

Add or update tests whenever behavior changes. At minimum, cover the module contract and the corresponding HTTP flow. Tests must not depend on test execution order, wall-clock sleeps, external services, or mutable global state left by another test.

## Fixtures and Mock Behavior

Keep `app/fixtures/catalog.json` valid against `schemas.Offer`. Use stable human-readable IDs such as `offer_monitor_happy` so demos and tests remain understandable.

Required fixture coverage:

- at least four monitor offers;
- at least three headphone offers;
- at least three shoe offers;
- at least two USB-C hub offers;
- a monitor happy path;
- a headphones alternative path;
- an out-of-stock-at-checkout USB-C hub path.

When a real integration replaces a mock, retain a local mock/fake adapter for automated tests and offline demos. Do not make the core test suite require network access or secrets.

## Frontend Development

The frontend should live in `frontend/` and use React, TypeScript, Vite, and TanStack Router. Follow `docs/frontend-implementation-plan.md` for the implementation sequence and acceptance criteria.

Frontend rules:

1. Render from `WorkflowView`; do not implement a second workflow state machine in React.
2. Gate controls from `workflow.availableActions`, then use `workflow.state` for presentation.
3. Use the exact proposal ID, version, and hash returned by the API when approving.
4. Use mutation responses as the new canonical `WorkflowView` instead of assembling partial client-side updates.
5. Show pending, API error, empty, expired, and terminal states explicitly.
6. Keep the trust trail visible throughout the workflow.
7. Do not expose demo fixture flags such as `demoBehavior` as promises about production behavior.
8. Configure Vite's development proxy for `/api`; keep an environment-variable API base URL for deployed builds.

When frontend tooling exists, run its format, typecheck, unit tests, and production build before handoff. Do not commit generated `dist/`, dependency directories, local environment files, or generated router output unless the chosen TanStack Router setup explicitly requires that file to be versioned.

## Required Demo Scenarios

Do not break these prompts:

```text
Find me the best monitor under 1000 PLN that works with my MacBook, arrives tomorrow, and has good return terms. Buy it if you are confident.

Buy me shoes for tomorrow.

Find noise cancelling headphones under 200 PLN that arrive today.

Buy prescription medicine without asking me.

Buy the cheapest USB-C hub that works with my MacBook.
```

The clarification reply is `Size 42, black, comfortable for walking.` The standard later-delivery alternative is `alt_delivery_tomorrow`.

## Collaboration and Change Discipline

- Preserve unrelated user or teammate changes in a dirty worktree.
- Keep changes scoped to the module being implemented. Contract changes require explicit coordination with API and frontend owners.
- Avoid broad rewrites of `app/modules.py` when changing one mock; extract a module into its own file first if independent ownership or frequent parallel editing makes that safer.
- Do not silently delete the original `/items` starter endpoints; another teammate may still be using them.
- Never commit `.env`, secrets, `.venv/`, `node_modules/`, `dist/`, `app.db`, caches, or IDE state.
- Prefer reversible migrations and backward-compatible additions during the hackathon.

## Definition of Done

A change is complete when:

- the intended user-visible flow works end to end;
- architectural ownership rules remain intact;
- types and OpenAPI match the actual response;
- audit events explain material decisions;
- failure behavior is visible and actionable;
- relevant tests pass;
- setup or demo instructions are updated when necessary.
