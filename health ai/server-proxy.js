// server-proxy.js - Production-ready Infermedica & Google Maps proxy backend
// Node 18+ compatible. Reads credentials from environment variables.

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fetch = global.fetch || (() => { try { return require('node-fetch'); } catch (e) { return null; }})();

const app = express();
const PORT = process.env.PORT || 3000;

// Validate fetch availability
if (!global.fetch && !fetch) {
  console.error('ERROR: fetch is not available. Install node-fetch or run on Node 18+.');
  process.exit(1);
}

const infermedicaAppId = process.env.INFERMEDICA_APP_ID;
const infermedicaAppKey = process.env.INFERMEDICA_APP_KEY;
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

// Logger helper (intentionally does not log secrets)
function log(...args) { console.log('[proxy]', ...args); }

app.use(bodyParser.json());

// ===== HEALTH & READINESS =====
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ===== INFERMEDICA PROXY =====

// Validate /assess payload
function validateAssessPayload(body) {
  if (!body || typeof body !== 'object') return 'body_required';
  const { sex, age, evidence } = body;
  if (sex !== 'male' && sex !== 'female') return 'sex_must_be_male_or_female';
  if (typeof age !== 'number' || Number.isNaN(age) || age < 0 || age > 120) return 'age_invalid';
  if (!Array.isArray(evidence)) return 'evidence_must_be_array';
  for (const ev of evidence) {
    if (!ev || typeof ev !== 'object') return 'evidence_item_invalid';
    if (!ev.id || typeof ev.id !== 'string') return 'evidence_item_id_required';
  }
  return null;
}

// Compute confidence: combines condition probability and triage urgency
function computeConfidence(conditions = [], triage = {}) {
  const top = (conditions && conditions[0]) ? Number(conditions[0].probability || 0) : 0;
  let score = Math.max(0, Math.min(1, top));
  let level = 'low';
  if (score >= 0.7) level = 'high';
  else if (score >= 0.4) level = 'medium';

  // Bump to high if triage indicates urgent/emergency
  const isUrgent = (triage && (
    triage.severity === 'red' || 
    triage.urgency === 'emergency' || 
    /emergency|call ambulance|immediate/i.test(triage.recommendation || '') ||
    triage.should_call_ambulance === true ||
    triage.should_call_emergency === true
  ));
  
  if (isUrgent) { level = 'high'; score = Math.max(score, 0.85); }
  
  const note = level === 'high' ? 'High confidence — consider urgent care if symptoms severe.' : 
               (level === 'medium' ? 'Moderate confidence — follow recommendations and monitor.' : 
                'Low confidence — follow general guidance and seek care if symptoms worsen.');
  return { level, score: Number(score.toFixed(2)), note };
}

// Build human-readable reason from evidence and top condition
function buildReason(evidence = [], conditions = []) {
  const top = conditions && conditions[0];
  const evidenceLabels = evidence
    .filter(e => e && (e.id || e.source || e.choice_id))
    .slice(0, 3)
    .map(e => e.id || e.source || e.choice_id);
  if (!top) return `Insufficient data to determine a likely condition.`;
  const evPart = evidenceLabels.length ? ` based on ${evidenceLabels.join(', ')}` : '';
  return `The most likely condition is ${top.name} (${Math.round((top.probability || 0) * 100)}%)${evPart}.`;
}

// Call Infermedica API (diagnosis or triage)
async function callInfermedica(path, payload) {
  if (!infermedicaAppId || !infermedicaAppKey) throw new Error('infermedica_credentials_missing');
  const url = `https://api.infermedica.com/v3${path}`;
  const res = await (global.fetch || fetch)(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'App-Id': infermedicaAppId,
      'App-Key': infermedicaAppKey,
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  if (!res.ok) {
    const err = new Error('infermedica_error');
    err.status = res.status;
    err.body = json || text;
    throw err;
  }
  return json;
}

// POST /assess - Main diagnosis endpoint
app.post('/assess', async (req, res) => {
  try {
    const validation = validateAssessPayload(req.body);
    if (validation) return res.status(400).json({ error: validation });

    const payload = {
      sex: req.body.sex,
      age: { value: req.body.age },
      evidence: req.body.evidence
    };

    // Call diagnosis and triage in parallel
    const [diagnosis, triage] = await Promise.all([
      callInfermedica('/diagnosis', payload),
      callInfermedica('/triage', payload)
    ]);

    const conditions = (diagnosis && diagnosis.conditions) 
      ? diagnosis.conditions.map(c => ({ id: c.id, name: c.name, probability: Number(c.probability || 0) })) 
      : [];

    const confidence = computeConfidence(conditions, triage);
    const reason = buildReason(req.body.evidence, conditions);

    return res.json({
      conditions,
      triage: triage || {},
      confidence,
      reason,
      meta: { engine: 'infermedica', timestamp: new Date().toISOString() }
    });
  } catch (err) {
    if (err.message === 'infermedica_credentials_missing') {
      log('Infermedica credentials missing');
      return res.status(500).json({ error: 'infermedica_credentials_missing' });
    }
    if (err.status) {
      log('Infermedica error', err.status);
      return res.status(502).json({ error: 'infermedica_down', details: err.body });
    }
    log('Server error in /assess', err && err.message);
    return res.status(500).json({ error: 'server_error', message: err && err.message });
  }
});

// ===== GOOGLE MAPS / PLACES PROXY =====

// Call Google Places Nearby Search
async function callGooglePlaces(lat, lng, radius = 5000) {
  if (!googleMapsApiKey) throw new Error('google_maps_key_missing');
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=hospital&key=${googleMapsApiKey}`;
  const res = await (global.fetch || fetch)(url);
  const json = await res.json();
  if (!res.ok || (json && json.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS')) {
    const err = new Error('google_places_error');
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// POST /search-hospitals - Nearby hospitals with Google Maps links
app.post('/search-hospitals', async (req, res) => {
  try {
    const { lat, lng, radius } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat_lng_required' });
    }
    const r = radius || 5000;
    const places = await callGooglePlaces(lat, lng, r);
    
    const hospitals = (places.results || []).map(p => ({
      id: p.place_id,
      name: p.name,
      address: p.vicinity || p.formatted_address || '',
      lat: p.geometry?.location?.lat,
      lng: p.geometry?.location?.lng,
      rating: p.rating,
      user_ratings_total: p.user_ratings_total,
      maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${p.place_id}`
    }));
    
    return res.json({ hospitals, count: hospitals.length, maps_key: googleMapsApiKey ? 'available' : null });
  } catch (err) {
    if (err.message === 'google_maps_key_missing') {
      log('Google Maps API key not configured');
      return res.status(500).json({ error: 'google_maps_key_missing' });
    }
    if (err.status) {
      log('Google Places error', err.status);
      return res.status(502).json({ error: 'google_places_down', details: err.body });
    }
    log('Server error in /search-hospitals', err && err.message);
    return res.status(500).json({ error: 'server_error', message: err && err.message });
  }
});

// POST /search-doctors - Nearby doctors/clinics with Google Maps
app.post('/search-doctors', async (req, res) => {
  try {
    const { lat, lng, radius, type } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat_lng_required' });
    }
    const r = radius || 5000;
    const docType = type || 'doctor'; // can search: 'doctor', 'clinic', 'dentist', 'cardiologist', etc.
    
    if (!googleMapsApiKey) throw new Error('google_maps_key_missing');
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${r}&keyword=${encodeURIComponent(docType)}&key=${googleMapsApiKey}`;
    const res_places = await (global.fetch || fetch)(url);
    const places = await res_places.json();
    
    if (!res_places.ok || (places && places.status && places.status !== 'OK' && places.status !== 'ZERO_RESULTS')) {
      const err = new Error('google_places_error');
      err.status = res_places.status;
      err.body = places;
      throw err;
    }
    
    const doctors = (places.results || []).map(p => ({
      id: p.place_id,
      name: p.name,
      address: p.vicinity || p.formatted_address || '',
      lat: p.geometry?.location?.lat,
      lng: p.geometry?.location?.lng,
      rating: p.rating,
      user_ratings_total: p.user_ratings_total,
      types: p.types || [],
      maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${p.place_id}`
    }));
    
    return res.json({ doctors, count: doctors.length });
  } catch (err) {
    if (err.message === 'google_maps_key_missing') {
      log('Google Maps API key not configured');
      return res.status(500).json({ error: 'google_maps_key_missing' });
    }
    if (err.status) {
      log('Google Places error', err.status);
      return res.status(502).json({ error: 'google_places_down', details: err.body });
    }
    log('Server error in /search-doctors', err && err.message);
    return res.status(500).json({ error: 'server_error', message: err && err.message });
  }
});

// ===== SERVER STARTUP =====
if (require.main === module) {
  app.listen(PORT, () => log(`Listening on port ${PORT}`));
}

module.exports = app;
