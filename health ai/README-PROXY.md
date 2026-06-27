# Symptom Checker Proxy

This repository provides a small, secure Node.js/Express proxy backend that accepts frontend requests and proxies **Infermedica Engine API (v3)** for symptom diagnosis/triage and **Google Maps/Places API** for nearby hospital search. API credentials are kept on the server; the frontend only calls the proxy.

## Files

- `server-proxy.js` - main backend (Infermedica + Google Maps integration)
- `package.json` - npm scripts and dependencies
- `Dockerfile` - production-ready Docker image
- `.dockerignore` - files to exclude from Docker image
- `tests/` - Jest unit tests (mocked Infermedica and Google responses)
- `.env.sample` - example environment variables
- `README.md` - this file

## Quick Examples (curl)

### POST /assess - Infermedica Diagnosis

Request:
```bash
curl -s -X POST http://localhost:3000/assess \
  -H "Content-Type: application/json" \
  -d '{
    "sex": "female",
    "age": 34,
    "evidence": [{ "id": "s_21", "choice_id": "present" }, { "id": "s_98", "choice_id": "present" }]
  }'
```

Response:
```json
{
  "conditions": [
    { "id": "c_1", "name": "Flu", "probability": 0.72 }
  ],
  "triage": { "recommendation": "Seek primary care", "severity": "yellow" },
  "confidence": { "level": "high", "score": 0.72, "note": "High confidence — consider urgent care if symptoms severe." },
  "reason": "The most likely condition is Flu (72%) based on s_21, s_98.",
  "meta": { "engine": "infermedica", "timestamp": "2025-12-11T..." }
}
```

### POST /search-hospitals - Google Maps Nearby Hospitals

Request:
```bash
curl -s -X POST http://localhost:3000/search-hospitals \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 37.7749,
    "lng": -122.4194,
    "radius": 5000
  }'
```

Response:
```json
{
  "hospitals": [
    {
      "id": "ChIJI...",
      "name": "San Francisco General Hospital",
      "address": "1001 Potrero Ave, San Francisco, CA 94110, USA",
      "lat": 37.7765,
      "lng": -122.4124,
      "rating": 4.2,
      "user_ratings_total": 456,
      "maps_url": "https://www.google.com/maps/search/?api=1&query=..."
    }
  ],
  "count": 1,
  "maps_key": "available"
}
```

## Run Locally

### 1. Setup environment

Copy the sample env file and add your API keys:

```bash
cp .env.sample .env
```

Edit `.env` and set:
- `INFERMEDICA_APP_ID=<your_app_id>`
- `INFERMEDICA_APP_KEY=<your_app_key>`
- `GOOGLE_MAPS_API_KEY=<your_google_maps_key>`
- `PORT=3000` (optional)

### 2. Install and run

```powershell
npm install
npm start
```

Server will listen on `http://localhost:3000`.

Check health: `curl http://localhost:3000/health`

## Run Tests

```powershell
npm test
```

Tests mock Infermedica and Google APIs and validate:
- Request validation (400 errors)
- Successful response mapping
- Error handling (502 for API failures)
- `computeConfidence()` logic
- `buildReason()` generation

## Docker / Cloud Run

### Build Docker image

```bash
docker build -t gcr.io/PROJECT-ID/symptom-proxy:1.0 .
docker push gcr.io/PROJECT-ID/symptom-proxy:1.0
```

### Deploy to Cloud Run

**Quick deploy with env vars:**

```bash
gcloud run deploy symptom-proxy \
  --image gcr.io/PROJECT-ID/symptom-proxy:1.0 \
  --platform managed \
  --region us-central1 \
  --set-env-vars INFERMEDICA_APP_ID=YOUR_ID,INFERMEDICA_APP_KEY=YOUR_KEY,GOOGLE_MAPS_API_KEY=YOUR_KEY \
  --allow-unauthenticated
```

**Better approach: Use Google Secret Manager**

Store secrets:
```bash
gcloud secrets create INFERMEDICA_APP_ID --data-file=- <<< "your_id"
gcloud secrets create INFERMEDICA_APP_KEY --data-file=- <<< "your_key"
gcloud secrets create GOOGLE_MAPS_API_KEY --data-file=- <<< "your_key"
```

Grant Cloud Run service account access to secrets, then reference them. See: https://cloud.google.com/secret-manager/docs/overview

## Where to Get API Keys

- **Infermedica**: Sign up at https://developer.infermedica.com/, create an app, copy App-Id and App-Key from the Apps page.
- **Google Maps**: Go to Google Cloud Console, enable Maps JavaScript API and Places API, create a service account, and generate an API key. Restrict to Maps JavaScript API and Places API for security.

## Key Rotation

Update `.env` locally or use:
```bash
gcloud run services update symptom-proxy --update-env-vars INFERMEDICA_APP_KEY=new_value
```

For production, rotate secrets in Secret Manager and redeploy.

## Security Notes

- API credentials are **never exposed** to the browser. The frontend only calls the proxy endpoints (`/assess`, `/search-hospitals`, `/health`).
- This code intentionally does not log secret values.
- Always use HTTPS in production.
- Use Secret Manager for production deployments.

## Endpoints Summary

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Readiness check |
| POST | `/assess` | Infermedica diagnosis & triage |
| POST | `/search-hospitals` | Google Maps nearby hospitals |

