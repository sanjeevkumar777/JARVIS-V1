# Symptom Checker Proxy

This repository provides a small, secure Node.js/Express proxy that accepts frontend symptom assessment requests and calls the Infermedica Engine API (v3) for diagnosis and triage. The service keeps Infermedica credentials on the server and returns a UX-friendly JSON payload.

Files:
- `server.js` - single-file Express app
- `package.json` - scripts and dependencies
- `Dockerfile` - production image
- `.dockerignore` - files to exclude from image
- `tests/` - Jest tests
- `.env.sample` - sample environment variables

## Quick example (curl)

Example request the frontend should make to the proxy:

```bash
curl -s -X POST http://localhost:3000/assess \
  -H "Content-Type: application/json" \
  -d '{
    "sex": "female",
    "age": 34,
    "evidence": [{ "id": "s_21", "choice_id": "present" }, { "id": "s_98", "choice_id": "present" }]
  }'
```

## Response structure

The proxy returns JSON:

```json
{
  "conditions": [{"id","name","probability"}],
  "triage": { /* full infermedica triage object */ },
  "confidence": {"level","score","note"},
  "reason": "string",
  "meta": {"engine":"infermedica","timestamp":"..."}
}
```

## Run locally

1. Copy `.env.sample` to `.env` and set your Infermedica keys:

```bash
cp .env.sample .env
# then edit .env and set INFERMEDICA_APP_ID and INFERMEDICA_APP_KEY
```

2. Install and run:

```powershell
npm install
npm start
```

Server will listen on the `PORT` (default 3000).

## Run tests

```powershell
npm test
```

Tests mock the Infermedica API and validate mapping, error paths, and computeConfidence/buildReason behaviors.

## Docker / GCR / Cloud Run

Build and push to Google Container Registry (GCR):

```bash
# build image
docker build -t gcr.io/PROJECT-ID/symptom-proxy:1.0 .
# push (after configuring gcloud and docker)
docker push gcr.io/PROJECT-ID/symptom-proxy:1.0
```

Deploy to Cloud Run (example - replace placeholders):

```bash
gcloud run deploy symptom-proxy \
  --image gcr.io/PROJECT-ID/symptom-proxy:1.0 \
  --platform managed \
  --region us-central1 \
  --set-env-vars INFERMEDICA_APP_ID=YOUR_ID,INFERMEDICA_APP_KEY=YOUR_KEY \
  --allow-unauthenticated
```

Alternatively, set env vars in Cloud Console under Service > Variables.

## Using Google Secret Manager with Cloud Run (short)

Store your `INFERMEDICA_APP_KEY` and `INFERMEDICA_APP_ID` in Secret Manager. Grant the Cloud Run service account access to those secrets, then reference them as environment variables in Cloud Run (or mount them at runtime). This avoids committing keys into deployment commands or repo. See: https://cloud.google.com/secret-manager/docs/overview

## Where to get API keys

- **Infermedica App-Id & App-Key**: Sign in to Infermedica Dashboard (https://developer.infermedica.com/). Create an app in the Apps page and copy `App-Id` and `App-Key`.
- **Google Cloud**: Create a project > enable Cloud Run and Container Registry. Create a service account or use existing, and use Secret Manager to store keys.

## Rotating keys

- Update Secret Manager entries (or update `.env` locally) and redeploy Cloud Run, or update env vars via `gcloud run services update --update-env-vars`.

## Notes & Security

- The server never exposes Infermedica keys to the browser. The frontend should POST to `/assess` only.
- Do not log secrets. This code intentionally avoids printing keys.
