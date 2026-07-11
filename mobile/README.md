# ClearCart mobile

Expo SDK 54 / React Native companion app for the ClearCart commerce workflow. It mirrors the web frontend while adapting the launcher, decision cards, offer comparison, approval boundary, checkout, tracking, revisions, and audit trail for phone and tablet layouts.

## Run locally

Start the FastAPI backend from the repository root so it is reachable beyond localhost when using a physical phone:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --reload
```

Then install and start Expo:

```powershell
cd mobile
npm install
npm start
```

Defaults:

- Android emulator: `http://10.0.2.2:8000`
- iOS simulator and web: `http://127.0.0.1:8000`

For Expo Go on a physical phone, create `mobile/.env.local` with your computer's LAN address:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.20:8000
```

The phone and computer must be on the same network. `EXPO_PUBLIC_` values are bundled into the client, so never put secrets there.

## Quality checks

```powershell
npm run typecheck
npm run lint
npm run export:web
```

The app uses the API's camelCase `WorkflowView` as its complete render model. Controls are gated by `workflow.availableActions`; approving exact terms never automatically performs checkout.
