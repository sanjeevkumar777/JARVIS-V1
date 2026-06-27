# Health AI Backend - Google Maps Integration Guide

## ✅ Current Integration Status

Your backend is **fully integrated** with Google Maps for hospitals and doctors search. Here's what's connected:

---

## 📋 Architecture Overview

```
Frontend (index.html)
    ↓
Client Helpers (script.js)
    ↓
Backend Endpoints (server-proxy.js)
    ↓
Google Places API
```

---

## 🔧 Backend Endpoints

### 1. **POST /search-hospitals** - Find nearby hospitals
```javascript
Request:
{
  "lat": 40.7128,
  "lng": -74.0060,
  "radius": 5000  // meters (optional, default 5000)
}

Response:
{
  "hospitals": [
    {
      "id": "place_id_123",
      "name": "Hospital Name",
      "address": "123 Main St",
      "lat": 40.7128,
      "lng": -74.0060,
      "rating": 4.5,
      "user_ratings_total": 250,
      "maps_url": "https://www.google.com/maps/search/?api=1&query=..."
    }
  ],
  "count": 5,
  "maps_key": "available"
}
```

### 2. **POST /search-doctors** - Find nearby doctors/clinics
```javascript
Request:
{
  "lat": 40.7128,
  "lng": -74.0060,
  "radius": 5000,        // meters (optional, default 5000)
  "type": "doctor"       // optional: "doctor", "clinic", "dentist", etc.
}

Response:
{
  "doctors": [
    {
      "id": "place_id_456",
      "name": "Dr. Smith Clinic",
      "address": "456 Health Ave",
      "lat": 40.7150,
      "lng": -74.0080,
      "rating": 4.8,
      "user_ratings_total": 180,
      "types": ["doctor", "health", ...],
      "maps_url": "https://www.google.com/maps/search/?api=1&query=..."
    }
  ],
  "count": 8
}
```

### 3. **GET /health** - Health check
```javascript
Response: { "status": "ok", "timestamp": "2025-12-11T..." }
```

### 4. **POST /assess** - Infermedica symptom assessment
```javascript
Request:
{
  "sex": "male" | "female",
  "age": 35,
  "evidence": [
    { "id": "s_123", "choice_id": "present" },
    { "id": "s_124", "choice_id": "absent" }
  ]
}

Response:
{
  "conditions": [
    {
      "id": "cond_1",
      "name": "Condition Name",
      "probability": 0.85
    }
  ],
  "triage": { ... },
  "confidence": { "level": "high", "score": 0.85, "note": "..." },
  "reason": "The most likely condition is...",
  "meta": { "engine": "infermedica", "timestamp": "..." }
}
```

---

## 🌐 Frontend Client Helpers (script.js)

All these functions are exposed to the global window and can be called from HTML:

```javascript
// Get Google Maps API key
await window.getMapsKey()

// Find nearby hospitals
await window.findNearbyHospitals(lat, lng, radius)

// Find nearby doctors
await window.findNearbyDoctors(lat, lng, radius, type)

// Find hospitals by region name
await window.findHospitalsByRegion(region, radius)

// Get place details
await window.getPlaceDetails(place_id)
```

---

## 🎯 Frontend Integration (index.html)

### Hospitals Feature
- **Button**: "Find Hospitals" (Slide 4 - Results)
- **Handler**: `findHospitalsForUser()` - Requests geolocation → calls `window.findNearbyHospitals()` → renders list + map
- **Panel**: `<div id="hospitalsPanel">` with list and Google Map
- **Features**: 
  - List of nearby hospitals with ratings
  - Interactive Google Map with markers
  - "Open in Maps" links for each hospital
  - Region search with input field

### Doctors Feature
- **Button**: "Find Doctors" (Slide 4 - Results)
- **Handler**: `findDoctorsForUser()` - Requests geolocation → calls `window.findNearbyDoctors()` → renders list + map
- **Panel**: `<div id="doctorsPanel">` with list and Google Map
- **Features**:
  - List of nearby doctors/clinics with ratings
  - Interactive Google Map with markers
  - "View on Maps" links for each doctor
  - Support for different doctor types

---

## ⚙️ Configuration

### Required Environment Variables (.env)

```bash
# Google Maps API
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# Infermedica API (optional, for symptom assessment)
INFERMEDICA_APP_ID=your_app_id
INFERMEDICA_APP_KEY=your_app_key

# OpenAI (fallback symptom analysis)
OPENAI_API_KEY=your_openai_api_key_here

# Server
PORT=3000
DB_PATH=./data.sqlite
```

### How to Get Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable these APIs:
   - Google Places API
   - Google Maps JavaScript API
4. Create an API key (Credentials → Create Credentials → API Key)
5. Add key to `.env` file: `GOOGLE_MAPS_API_KEY=your_key`

---

## 🚀 Running the Backend

### Option 1: Local Node.js
```bash
# Install dependencies
npm install

# Run proxy backend
npm start

# Server runs on http://localhost:3000
```

### Option 2: Docker
```bash
# Build image
docker build -t health-ai-backend .

# Run container
docker run -p 3000:3000 \
  -e GOOGLE_MAPS_API_KEY=your_key \
  -e INFERMEDICA_APP_ID=your_id \
  -e INFERMEDICA_APP_KEY=your_key \
  health-ai-backend
```

---

## 📡 API Flow Examples

### Example 1: Find Hospitals Near User
```javascript
// Frontend
const lat = 40.7128, lng = -74.0060;
const response = await window.findNearbyHospitals(lat, lng, 5000);
// response.hospitals = [{ id, name, address, lat, lng, rating, maps_url }, ...]
```

### Example 2: Find Doctors by Type
```javascript
// Frontend
const response = await window.findNearbyDoctors(40.7128, -74.0060, 5000, 'dentist');
// response.doctors = [{ id, name, address, lat, lng, rating, maps_url }, ...]
```

### Example 3: Get Symptom Assessment
```javascript
// Frontend
const response = await fetch('/assess', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sex: 'male',
    age: 35,
    evidence: [{ id: 's_123', choice_id: 'present' }]
  })
});
const { conditions, triage, confidence, reason } = await response.json();
```

---

## 🗺️ Google Maps JavaScript Integration

The frontend automatically:
1. Loads Google Maps API dynamically when needed
2. Creates interactive maps with user location marker
3. Adds hospital/doctor markers with click handlers
4. Centers map on user location
5. Provides direct Google Maps links

---

## ✨ Features Summary

| Feature | Hospital | Doctor | Status |
|---------|----------|--------|--------|
| Nearby Search | ✅ | ✅ | Connected |
| Geolocation | ✅ | ✅ | Connected |
| Google Maps | ✅ | ✅ | Connected |
| Ratings Display | ✅ | ✅ | Connected |
| Direct Maps Link | ✅ | ✅ | Connected |
| Region Search | ✅ | ❌ | Hospital only |
| Details Modal | ✅ | ❌ | Hospital only |

---

## 🔒 Security Notes

- All API keys are stored in `.env` (never committed to git)
- Google Maps key is retrieved server-side then returned to client
- Credentials validated before each API call
- Error responses don't expose sensitive information

---

## 📝 Next Steps

1. **Get Google Maps API Key** from Google Cloud Console
2. **Add API key** to `.env` file
3. **Install Node.js** (v18+) if not already installed
4. **Run `npm install`** to install dependencies
5. **Run `npm start`** to start the backend
6. **Test** by visiting `http://localhost:3000`
   - Click "Find Hospitals" button to test hospital search
   - Click "Find Doctors" button to test doctor search

---

## 🐛 Troubleshooting

### "Google Maps key missing" error
- Check `.env` file has `GOOGLE_MAPS_API_KEY` set
- Verify API key is valid in Google Cloud Console
- Check Places API is enabled

### "Geolocation not supported" error
- Use HTTPS (localhost works, but production needs SSL)
- Check browser permissions for location access
- Some browsers/devices may not support geolocation

### Markers not showing on map
- Verify lat/lng values are valid numbers
- Check Google Maps JavaScript API is enabled
- Clear browser cache and reload

---

## 📚 Additional Resources

- [Google Places API Docs](https://developers.google.com/maps/documentation/places/web-service/overview)
- [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/overview)
- [Infermedica API Docs](https://developer.infermedica.com/)

