// server.js - Symptom-checker proxy to Infermedica (v3)
// Node 18+ compatible. Reads INFERMEDICA_APP_ID and INFERMEDICA_APP_KEY from env.

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

// Simple logger helper (do not log secrets)
function log(...args) { console.log('[server]', ...args); }

app.use(bodyParser.json());

// Health endpoint for readiness
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Utility: validate input body
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

// Compute confidence based on conditions and triage
function computeConfidence(conditions = [], triage = {}) {
  // Conditions probabilities expected 0-1
  const top = (conditions && conditions[0]) ? Number(conditions[0].probability || 0) : 0;
  let score = Math.max(0, Math.min(1, top));
  let level = 'low';
  if (score >= 0.7) level = 'high';
  else if (score >= 0.4) level = 'medium';

  // Bump to high if triage indicates urgent/emergency
  const triageUrgent = (() => {
    if (!triage) return false;
    // Infermedica triage may include 'triage_level' or 'outcome' - check common flags
    if (triage.severity === 'red' || triage.urgency === 'emergency') return true;
    if (triage.recommendation && typeof triage.recommendation === 'string' && /emergency|call ambulance|immediate/i.test(triage.recommendation)) return true;
    // some triage objects may have 'should_call_ambulance' boolean
    if (triage.should_call_ambulance === true || triage.should_call_emergency === true) return true;
    return false;
  })();
  if (triageUrgent) { level = 'high'; score = Math.max(score, 0.85); }

  const note = level === 'high' ? 'High confidence — consider urgent care if symptoms severe.' : (level === 'medium' ? 'Moderate confidence — follow recommendations and monitor.' : 'Low confidence — follow general guidance and seek care if symptoms worsen.');
  return { level, score: Number(score.toFixed(2)), note };
}

// Build a human-readable reason
function buildReason(evidence = [], conditions = []) {
  const top = conditions && conditions[0];
  const evidenceLabels = evidence
    .filter(e => e && (e.id || e.source || e.choice_id))
    .slice(0,3)
    .map(e => e.id || e.source || e.choice_id);
  if (!top) return `Insufficient data to determine a likely condition.`;
  const evPart = evidenceLabels.length ? ` based on ${evidenceLabels.join(', ')}` : '';
  return `The most likely condition is ${top.name} (${Math.round((top.probability||0)*100)}%)${evPart}.`; 
}

// Helper to call Infermedica endpoints
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
    body: JSON.stringify(payload),
    // reasonable timeout not easily available with fetch; left to infra
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

// POST /assess endpoint
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

    // Map conditions
    const conditions = (diagnosis && diagnosis.conditions) ? diagnosis.conditions.map(c => ({ id: c.id, name: c.name, probability: Number(c.probability || 0) })) : [];

    const confidence = computeConfidence(conditions, triage);
    const reason = buildReason(req.body.evidence, conditions);

    const out = {
      conditions,
      triage: triage || {},
      confidence,
      reason,
      meta: { engine: 'infermedica', timestamp: new Date().toISOString() }
    };
    return res.json(out);
  } catch (err) {
    if (err.message === 'infermedica_credentials_missing') {
      log('Infermedica credentials are not set');
      return res.status(500).json({ error: 'infermedica_credentials_missing' });
    }
    if (err.status) {
      // infermedica returned non-ok
      log('Infermedica error', err.status, err.body);
      return res.status(502).json({ error: 'infermedica_down', details: err.body });
    }
    log('Server error', err && err.message);
    return res.status(500).json({ error: 'server_error', message: err && err.message });
  }
});

// Helper to call Google Places API (hospital nearby search)
async function callGooglePlaces(lat, lng, radius = 5000) {
  const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!googleMapsKey) throw new Error('google_maps_key_missing');
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=hospital&key=${googleMapsKey}`;
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

// POST /search-hospitals - Google Maps hospital search
app.post('/search-hospitals', async (req, res) => {
  try {
    const { lat, lng, radius } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'lat_lng_required' });
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
    return res.json({ hospitals, count: hospitals.length });
  } catch (err) {
    if (err.message === 'google_maps_key_missing') {
      log('Google Maps key not set');
      return res.status(500).json({ error: 'google_maps_key_missing' });
    }
    if (err.status) {
      log('Google Places error', err.status);
      return res.status(502).json({ error: 'google_places_down', details: err.body });
    }
    log('Server error in search-hospitals', err && err.message);
    return res.status(500).json({ error: 'server_error', message: err && err.message });
  }
});

// Start server if run directly
if (require.main === module) {
  app.listen(PORT, () => log(`Listening on ${PORT}`));
}

module.exports = app;
app.use(cors());
app.use(bodyParser.json());

// Serve static files from project root so `index.html` is reachable
app.use(express.static(path.join(__dirname)));

// SPA fallback: send index.html for unknown GET routes (helps if using client-side routing)
app.get('*', (req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Helper: robust JSON extract
function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch (_) { return null; }
    }
    return null;
  }
}

app.post('/api/analyze-symptoms', async (req, res) => {
  try {
    const { text, severity } = req.body;
    if (!text || !severity) return res.status(400).json({ error: 'text and severity required' });

    const prompt = `
You are a careful medical-triage assistant. The user provides free-text symptoms and a selected severity (low|medium|high).
Respond ONLY with a single JSON object (no extra text) with these keys:
- matched_symptom: short label from this list if applicable (e.g., "headache","fever","cough","stomach pain","vomiting","dehydration","diarrhea","back pain","joint pain","skin symptoms","weakness","body pain") or "" if unknown.
- severity: one of "green","yellow","red" representing triage level
- conditions: array of objects { "name": string, "probability": integer } — up to 5 items sorted descending probability
- recommendations: array of short strings (3-6 items) with practical, general guidance (non-prescription where possible), prioritized.
- summary: short 1-2 sentence summary for sharing with a clinician.
Use conservative language ("possible", "may be") and DO NOT provide definitive diagnoses. Use probability values between 0 and 100.

Input:
user_text: """${text}"""
user_selected_severity: ${severity}
Return the JSON now.
`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful and careful medical assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.0,
      max_tokens: 500
    });

    const assistantText = completion.choices?.[0]?.message?.content || '';
    const parsed = extractJson(assistantText);

    if (!parsed) {
      return res.status(200).json({ error: 'ai_parse_failed' });
    }

    parsed.conditions = (parsed.conditions || []).slice(0,5).map(c => ({
      name: c.name || '',
      probability: Math.min(100, Math.max(0, Math.round(Number(c.probability) || 0)))
    })).sort((a,b)=>b.probability-a.probability);

    parsed.recommendations = parsed.recommendations || [];
    parsed.matched_symptom = (parsed.matched_symptom || '').toLowerCase();
    parsed.severity = parsed.severity || 'yellow';
    parsed.summary = parsed.summary || '';

    // Persist analysis to sqlite DB
    try {
      const recordId = uuidv4();
      const record = {
        id: recordId,
        input: text,
        userSeverity: severity,
        parsed,
        ts: new Date().toISOString()
      };
      db.insertAnalysis(record);
      parsed.recordId = recordId;
    } catch (e) {
      console.error('persist analysis error', e);
    }

    return res.json(parsed);

  } catch (err) {
    console.error('analyze-symptoms error', err?.response?.data || err.message || err);
    return res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/request-consult', (req, res) => {
  const { name, email, phone, summary } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });

  const requestId = uuidv4();
  console.log('Consult request:', { requestId, name, email, phone, summary, ts: new Date().toISOString() });

  // Persist consult request
  try {
    const rec = {
      id: requestId,
      name,
      email,
      phone,
      summary,
      ts: new Date().toISOString()
    };
    db.insertConsult(rec);
  } catch (e) {
    console.error('persist consult error', e);
  }

  return res.json({ requestId, status: 'received' });
});

// Admin/debug: return stored records (analyses & consults)
app.get('/api/records', (req, res) => {
  try {
    const records = db.getRecords();
    return res.json(records);
  } catch (e) {
    console.error('records read error', e);
    return res.status(500).json({ error: 'failed_to_read_records' });
  }
});

// Get single analysis or consult by id
app.get('/api/analysis/:id', (req, res) => {
  const id = req.params.id;
  const rec = db.getAnalysisById(id);
  if (!rec) return res.status(404).json({ error: 'not_found' });
  return res.json(rec);
});

app.get('/api/consult/:id', (req, res) => {
  const id = req.params.id;
  const rec = db.getConsultById(id);
  if (!rec) return res.status(404).json({ error: 'not_found' });
  return res.json(rec);
});

// Update analysis or consult
app.put('/api/analysis/:id', (req, res) => {
  const id = req.params.id;
  const ok = db.updateAnalysis(id, req.body || {});
  if (!ok) return res.status(404).json({ error: 'not_found_or_no_change' });
  return res.json({ status: 'updated' });
});

app.put('/api/consult/:id', (req, res) => {
  const id = req.params.id;
  const ok = db.updateConsult(id, req.body || {});
  if (!ok) return res.status(404).json({ error: 'not_found_or_no_change' });
  return res.json({ status: 'updated' });
});

// Return maps key for client-side loader (keep key restricted in Google Cloud Console)
app.get('/api/maps-key', (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  if (!key) return res.status(400).json({ error: 'maps_key_not_configured' });
  return res.json({ key });
});

// Find nearby hospitals using Google Places Nearby Search (server-side proxy)
app.post('/api/nearby-hospitals', async (req, res) => {
  try {
    const { lat, lng, radius } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'lat_lng_required' });
    const r = radius || 5000; // default 5km
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return res.status(500).json({ error: 'maps_key_missing' });

    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${r}&type=hospital&key=${key}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return res.status(500).json({ error: 'places_error', details: data });
    }

    const results = (data.results || []).map(p => ({
      name: p.name,
      vicinity: p.vicinity || p.formatted_address || '',
      location: p.geometry?.location || null,
      place_id: p.place_id,
      rating: p.rating,
      user_ratings_total: p.user_ratings_total
    }));

    return res.json({ results });
  } catch (e) {
    console.error('nearby-hospitals error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Fetch place details by place_id
app.post('/api/place-details', async (req, res) => {
  try {
    const { place_id } = req.body;
    if (!place_id) return res.status(400).json({ error: 'place_id_required' });
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return res.status(500).json({ error: 'maps_key_missing' });

    const fields = encodeURIComponent('name,rating,formatted_phone_number,formatted_address,website,opening_hours,geometry');
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=${fields}&key=${key}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status && data.status !== 'OK') {
      return res.status(500).json({ error: 'place_details_error', details: data });
    }

    return res.json({ result: data.result });
  } catch (e) {
    console.error('place-details error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Search hospitals by region text (uses Places Text Search)
app.post('/api/search-hospitals-region', async (req, res) => {
  try {
    const { region, radius } = req.body;
    if (!region || typeof region !== 'string') return res.status(400).json({ error: 'region_required' });
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return res.status(500).json({ error: 'maps_key_missing' });

    // Use Places Text Search: "hospital in {region}"
    const query = encodeURIComponent(`hospital in ${region}`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${key}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return res.status(500).json({ error: 'places_error', details: data });
    }

    const results = (data.results || []).map(p => ({
      name: p.name,
      vicinity: p.formatted_address || p.vicinity || '',
      location: p.geometry?.location || null,
      place_id: p.place_id,
      rating: p.rating,
      user_ratings_total: p.user_ratings_total
    }));

    return res.json({ results });
  } catch (e) {
    console.error('search-hospitals-region error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
