// Client-side helper functions for calling the API endpoints
// The main UI uses inline script in `index.html`. This file provides optional helpers
// if you prefer to move client logic into an external file.

async function apiAnalyzeSymptoms(text, severity) {
  const res = await fetch('/api/analyze-symptoms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, severity })
  });
  if (!res.ok) throw new Error('Analyze request failed');
  return res.json();
}

async function apiRequestConsult({ name, email, phone, summary }) {
  const res = await fetch('/api/request-consult', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, phone, summary })
  });
  if (!res.ok) throw new Error('Consult request failed');
  return res.json();
}

// Expose to global for inline scripts in HTML to call
window.apiAnalyzeSymptoms = apiAnalyzeSymptoms;
window.apiRequestConsult = apiRequestConsult;

// Google Maps + Places helpers (client)
async function getMapsKey() {
  const res = await fetch('/api/maps-key');
  if (!res.ok) throw new Error('Maps key not available');
  const j = await res.json();
  return j.key;
}

async function findNearbyHospitals(lat, lng, radius = 5000) {
  const res = await fetch('/api/nearby-hospitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, radius })
  });
  if (!res.ok) throw new Error('Nearby hospitals request failed');
  return res.json();
}

async function findHospitalsByRegion(region, radius) {
  const res = await fetch('/api/search-hospitals-region', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ region, radius })
  });
  if (!res.ok) throw new Error('Region search failed');
  return res.json();
}

window.findHospitalsByRegion = findHospitalsByRegion;

// Find nearby doctors using Google Places
async function findNearbyDoctors(lat, lng, radius = 5000, type = 'doctor') {
  const res = await fetch('/search-doctors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, radius, type })
  });
  if (!res.ok) throw new Error('Doctor search failed');
  return res.json();
}

window.findNearbyDoctors = findNearbyDoctors;

async function getPlaceDetails(place_id) {
  const res = await fetch('/api/place-details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ place_id })
  });
  if (!res.ok) throw new Error('Place details request failed');
  return res.json();
}

window.getMapsKey = getMapsKey;
window.findNearbyHospitals = findNearbyHospitals;
window.getPlaceDetails = getPlaceDetails;
