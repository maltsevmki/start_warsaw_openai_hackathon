# Frontend Implementation Plan

## Goal

Build a polished single-page demo for the mocked agent-commerce API using React, TypeScript, Vite, and TanStack Router. The UI should make the agent's reasoning and consent boundaries easy to understand while allowing a judge to complete every supported flow without editing requests manually.

The backend already returns a complete `WorkflowView` after every operation. The frontend's main job is to render that view accurately, expose only the current `availableActions`, and send the exact approval data back to the API.

## Recommended Stack

- React with TypeScript
- Vite
- TanStack Router with file-based routing
- TanStack Query for API server state and mutations
- `openapi-typescript` to generate API response/request types from `/openapi.json`
- Vitest and React Testing Library
- Mock Service Worker for isolated component and browser-flow tests
- Plain CSS or CSS Modules initially; introduce a component library only if the team explicitly agrees on one

TanStack Router is the routing requirement. TanStack Query is recommended because workflow views are server state and every mutation returns the next canonical view.

## Proposed Directory

```text
frontend/
  src/
    api/
      client.ts
      generated.ts
      workflow-api.ts
      query-keys.ts
    components/
      app-shell/
      audit/
      comparison/
      order/
      proposal/
      workflow/
    features/
      create-workflow/
      workflow-detail/
    routes/
      __root.tsx
      index.tsx
      workflows.$workflowId.tsx
    styles/
      tokens.css
      global.css
    test/
      fixtures.ts
      handlers.ts
      setup.ts
    main.tsx
    router.tsx
  .env.example
  index.html
  package.json
  tsconfig.json
  vite.config.ts
```

Use feature folders for orchestration and reusable components for visual sections. Avoid a global client-side workflow store until a concrete need appears; TanStack Query should own the current `WorkflowView`.

## Routes

### `/`

Purpose: prompt entry and demo scenario launcher.

Contents:

- product title and short trust-oriented explanation;
- freeform prompt textarea;
- primary `Start workflow` action;
- five prefilled scenario cards loaded from `GET /api/demo/scenarios` or defined as documented fallbacks;
- API availability indicator based on `/health`;
- a brief three-step explanation: request, explicit approval, tracked mock order.

On successful `POST /api/workflows`, navigate to `/workflows/$workflowId` and seed the workflow query cache with the returned `WorkflowView`.

### `/workflows/$workflowId`

Purpose: render the complete workflow and all possible decision points.

The route loader should fetch `GET /api/workflows/{workflowId}`. It should provide route-level pending, not-found, and API-error components. The page should remain at one stable URL while mutations advance workflow state.

Optional URL search parameters:

- `event=1` to open the audit panel for demos;
- `dev=1` to reveal tracking simulation controls if the team chooses to hide them by default.

Do not create a separate page for every workflow state. The API returns a single polymorphic view and state transitions should not cause navigation churn.

## Page Composition

The workflow detail page should use this order:

1. `WorkflowHeader`
   - current summary;
   - state badge with human-readable text;
   - created/updated time;
   - a compact progress indicator.
2. `RequestSummary`
   - original prompt;
   - extracted constraints as labeled chips or rows.
3. `DecisionPanel`
   - exactly one primary state-specific panel described below.
4. `ComparisonSection`
   - recommendation and confidence;
   - ranked offer table/cards with reasons, tradeoffs, and disqualifiers.
5. `AuditTrail`
   - chronological events with actor/module markers and readable timestamps.

On mobile, render these as one column. On wide screens, keep the decision content in the main column and the audit trail in a sticky secondary column.

## State-to-UI Mapping

| Workflow state | Primary rendering | Enabled behavior |
| --- | --- | --- |
| `created`, `researching`, `comparing`, `proposal_ready`, `checkout_in_progress`, `ordered` | progress card/skeleton | no duplicate mutation buttons |
| `needs_clarification` | `ClarificationCard` with question, examples, and reply field | submit `/messages`; cancel when advertised |
| `blocked_by_policy` | `GuardrailCard` with code, explanation, and safer-alternative note | return to launcher |
| `no_exact_match` | no-match explanation | cancel or start a revised request |
| `awaiting_alternative_acceptance` | `AlternativePicker` | accept one ID or reject through `/accept-alternative` |
| `awaiting_approval` without approval | `ProposalCard` and explicit consent controls | approve, reject, or cancel |
| `awaiting_approval` with approved approval | immutable approval receipt | execute checkout or cancel |
| `rejected` | terminal rejection result | start another request |
| `checkout_failed` | failure card using `checkout.failureReason` | explain that no payment/order occurred; cancel or restart |
| `tracking` | `OrderTrackingTimeline` and demo controls | simulate an advertised order status; cancel if available |
| `completed` | delivery confirmation and final receipt summary | start another request |
| `cancelled` | terminal cancellation result | start another request |

Always gate interactive controls with `workflow.availableActions`. State determines which component is appropriate; actions determine whether its buttons are enabled and shown.

## Core Components

### `ClarificationCard`

- Display `clarification.text` and render `clarification.fields` when present.
- Retain example reply chips and the free-text input as the fallback for legacy questions.
- Submit form-backed answers with the current `questionId`; never reuse a stale question ID.
- Disable submission while the mutation is pending.
- On success, replace the cached workflow with the returned view.

### `AlternativePicker`

- Show every alternative's `message` and a concise before/after constraint comparison.
- Require one selection before sending `accepted: true`.
- Send `accepted: false` without an `alternativeId` for rejection.
- Make changed budget or delivery terms visually explicit; do not hide the tradeoff.

### `ComparisonSection`

- Highlight `comparison.bestOfferId`.
- Display score, total, reasons, tradeoffs, and disqualifiers.
- Format all money using `Intl.NumberFormat("en-PL", { style: "currency", currency: "PLN" })`.
- Present confidence as an explanation aid, not a guarantee.

### `ProposalCard`

- Treat the proposal as immutable approval terms.
- Show merchant, title, quantity, line items, total, delivery, returns, warranty, payment label, and expiry.
- Use `proposal.approvalText` close to the approval button.
- Submit the exact `proposal.id`, `proposal.version`, and `proposal.hash`; never recompute the hash in the browser.
- Provide a separate reject action with an optional reason.

### `ApprovalReceipt`

- Show decision time, actor, version, audit summary, and a shortened hash with a copy affordance.
- Explain that approval was recorded but checkout has not run yet.
- Make `Execute checkout` a distinct second action.

### `CheckoutFailureCard`

Map failure reasons to clear copy:

- `missing_approval`: approval was not valid;
- `proposal_mismatch`: displayed and submitted proposal terms differ;
- `proposal_expired`: terms expired before checkout;
- `price_changed`: price changed, so no payment was made;
- `out_of_stock`: item became unavailable, so no payment was made;
- `delivery_changed`: delivery commitment changed;
- `return_policy_changed`: return terms changed;
- `payment_failed`: mock payment authorization failed.

The API detail is trustworthy state, but user-facing copy should remain concise and reassuring.

### `OrderTrackingTimeline`

- Show merchant reference, tracking number, delivery label, total, current status, and all timeline entries.
- In demo mode, provide buttons/select control for `confirmed`, `packed`, `shipped`, `out_for_delivery`, `delivered`, and `exception`.
- Send the selected value to `/api/orders/{orderId}/simulate-status` and replace the cached workflow from the response.
- Label simulation controls clearly as demo-only.

### `AuditTrail`

- Render events oldest to newest unless the design explicitly gives the user a toggle.
- Show `summary`, timestamp, module, and actor.
- Keep raw `data` collapsed behind an optional details disclosure.
- Visually emphasize approval, checkout revalidation, checkout outcome, and order exceptions.

## API Layer

Create one typed wrapper per operation:

```ts
startWorkflow(prompt)
getWorkflow(workflowId)
addWorkflowMessage(workflowId, message)
respondToAlternative(workflowId, input)
approveProposal(workflowId, input)
rejectProposal(workflowId, input)
executeCheckout(workflowId, approvalId)
cancelWorkflow(workflowId)
getWorkflowEvents(workflowId)
simulateOrderStatus(orderId, status)
```

Use a shared `request<T>()` helper that:

- applies the API base URL;
- sends and accepts JSON;
- parses FastAPI `detail` errors;
- distinguishes validation errors, conflict errors, not found, network failure, and unexpected server errors;
- supports `AbortSignal` for route loaders and query cancellation.

Configure Vite development proxying:

```ts
server: {
  proxy: {
    "/api": "http://127.0.0.1:8000",
    "/health": "http://127.0.0.1:8000",
    "/openapi.json": "http://127.0.0.1:8000",
  },
}
```

Use `VITE_API_BASE_URL` for deployments and default it to an empty string so local requests use the proxy.

## Query and Mutation Strategy

Use the key factory:

```ts
workflowKeys.all
workflowKeys.detail(workflowId)
workflowKeys.events(workflowId)
```

Every workflow mutation returns a complete `WorkflowView`. In each mutation's success handler:

1. call `queryClient.setQueryData(workflowKeys.detail(id), returnedView)`;
2. optionally update the dedicated events query from `returnedView.events`;
3. avoid an immediate redundant refetch;
4. show a toast only for meaningful actions, not every automatic transition.

Do not use optimistic updates for approval, checkout, or alternative acceptance. These actions have policy and state-machine validation and must be confirmed by the backend.

Polling is unnecessary for the current mocks. If real asynchronous fulfillment is introduced later, add state-aware polling only while states are transient or tracking is active.

## Progress Presentation

Use a compact semantic progression rather than exposing every internal state as an equal step:

```text
Request -> Research -> Review -> Approval -> Checkout -> Tracking -> Complete
```

Map internal states onto those seven phases. Preserve the exact internal state in an accessible badge or detail label for debugging and demo transparency.

## Error and Recovery Design

- Show inline field errors for missing prompt/reply/alternative selection.
- Keep API errors next to the action that failed.
- When a `409` occurs, offer `Refresh workflow` because another action may have changed state.
- When a workflow returns `404`, link back to the launcher rather than leaving a blank screen.
- Do not discard a prompt or rejection reason after a recoverable network error.
- Disable duplicate submissions and show action-specific pending labels.
- Treat checkout failure as a valid workflow result, not a broken application screen.

## Accessibility and Responsive Requirements

- All actions must be keyboard accessible.
- Use real buttons, inputs, headings, tables/lists, and disclosure elements.
- Associate clarification and rejection fields with labels and error text.
- Announce state-changing results through an `aria-live="polite"` region.
- Do not rely on color alone for state, recommendation, or failure meaning.
- Ensure comparison content becomes readable stacked cards or a scrollable table on small screens.
- Respect reduced motion for progress and timeline transitions.

## Implementation Phases

### Phase 1: Scaffold and contracts

1. Create the Vite React TypeScript app under `frontend/`.
2. Install and configure TanStack Router's Vite plugin and file-based routes.
3. Add TanStack Query at the root route/provider level.
4. Configure `/api`, `/health`, and `/openapi.json` Vite proxies.
5. Generate TypeScript API types from the running backend OpenAPI document.
6. Add formatting, linting, typecheck, test, and build scripts.

Acceptance:

- `/` and `/workflows/$workflowId` render through TanStack Router;
- a production build succeeds;
- the API client reports typed errors;
- generated types represent `WorkflowView` without manual drift.

### Phase 2: Launcher and workflow shell

1. Implement the prompt composer and scenario cards.
2. Start a workflow and navigate with seeded query data.
3. Implement the route loader/query and page-level pending/error states.
4. Render workflow header, request summary, constraints, and audit trail.

Acceptance:

- all five prompts create workflows;
- refresh on a workflow URL restores the current view;
- audit events are readable on desktop and mobile.

### Phase 3: Human decision points

1. Implement clarification reply.
2. Implement alternative selection and rejection.
3. Implement guardrail and no-match terminal panels.
4. Implement comparison ranking and explanations.
5. Implement proposal approval and rejection.

Acceptance:

- shoes advance after `Size 42, black, comfortable for walking.`;
- headphones advance after accepting `alt_delivery_tomorrow`;
- guardrail copy is shown without an unsafe purchase action;
- approval uses exact proposal identifiers and never starts checkout automatically.

### Phase 4: Checkout and tracking

1. Implement the separate execute-checkout action.
2. Implement success receipt/order rendering.
3. Implement checkout failure reasons.
4. Implement order timeline and demo status simulation.
5. Implement delivery completion and exception presentation.

Acceptance:

- monitor workflow completes from prompt through delivered;
- USB-C hub workflow visibly stops at `checkout_failed/out_of_stock`;
- every tracking mutation updates the workflow without a page reload.

### Phase 5: Demo polish and resilience

1. Add responsive styling, focus management, loading states, and reduced-motion support.
2. Add a reset-demo affordance guarded by a confirmation dialog.
3. Add component tests for every state-specific panel.
4. Add browser tests for all five required flows.
5. Run a production build against a configurable backend URL.

Acceptance:

- no console errors or unhandled promise rejections;
- no action is displayed unless advertised by `availableActions`;
- all required flows work with keyboard-only input;
- reload, 404, 409, network failure, and API validation errors have intentional UI.

## Test Plan

Unit/component coverage:

- money, state, date, and failure-reason formatters;
- workflow state-to-panel selection;
- action gating from `availableActions`;
- proposal content and exact approval payload;
- alternative constraint comparison;
- order timeline and audit trail rendering;
- FastAPI error parsing.

Integration/browser coverage:

1. Happy monitor: create, approve, checkout, simulate delivered.
2. Shoes: create, answer clarification, reach proposal.
3. Headphones: create, select tomorrow alternative, reach proposal.
4. Guardrail: create, verify blocked state and absence of approval controls.
5. USB-C hub: create, approve, checkout, verify out-of-stock failure and no order.
6. Tampered or stale approval: verify a conflict is surfaced and refresh is offered.
7. Direct workflow URL: verify loader restores the workflow after refresh.

Use MSW for component tests, but run at least one end-to-end suite against the real local FastAPI mock so generated types, request bodies, aliases, status codes, and route paths are verified together.

## Parallel Ownership Suggestion

Once Phase 1 establishes the contracts, work can split safely:

| Owner | Area |
| --- | --- |
| App shell | routes, providers, navigation, responsive layout |
| API/data | generated types, request wrapper, queries, mutations, errors |
| Research | constraints, alternatives, comparison, recommendation UI |
| Consent | proposal, approval receipt, rejection, trust copy |
| Fulfillment | checkout outcome, order tracking, simulation controls |
| Quality | audit trail, accessibility, component tests, browser flows |

Shared components should accept typed view fragments and callbacks. They should not call endpoints directly unless they are feature-level containers. This keeps visual work parallel and prevents hidden API coupling.

## Final Frontend Definition of Done

- React/Vite/TanStack Router app builds successfully.
- The frontend consumes the API rather than fixtures.
- Every action in `availableActions` has a usable control and endpoint path.
- Every required workflow state has a deliberate rendering.
- Proposal consent and checkout remain visibly separate.
- All five demo scenarios work end to end.
- Typecheck, tests, and production build pass.
- Setup, environment variables, and demo steps are documented in both root and frontend READMEs.
