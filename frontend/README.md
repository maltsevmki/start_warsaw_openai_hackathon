# ClearCart frontend

A React, TypeScript, Vite, TanStack Router, and TanStack Query demo for the mocked agent-commerce API. The UI renders the API's canonical `WorkflowView`, gates every control through `availableActions`, and keeps proposal approval separate from checkout.

## Setup

```bash
npm install
cp .env.example .env
```

Start the API from `/Users/user/Projects/start_warsaw_openai_hackathon`:

```bash
source .venv/bin/activate
uvicorn app.main:app --reload
```

Then start this frontend:

```bash
npm run dev
```

Open `http://127.0.0.1:3000`. Local `/api`, `/health`, and `/openapi.json` calls are proxied to `http://127.0.0.1:8000`.

For a deployment, set `VITE_API_BASE_URL` to the API origin. It defaults to empty for local proxying.

## Quality checks

```bash
npm run generate-routes
npm run typecheck
npm test
npm run build
```

With the API running, refresh the generated contract using `npm run generate-api`.

## Demo flows

- Monitor: approve exact proposal terms, execute checkout separately, then simulate delivery.
- Shoes: answer `Size 42, black, comfortable for walking.`
- Headphones: explicitly accept the tomorrow-delivery or higher-budget alternative.
- Prescription medicine: verify the policy block exposes no purchase action.
- USB-C hub: approve and execute checkout; the stock revalidation safely stops the purchase.
