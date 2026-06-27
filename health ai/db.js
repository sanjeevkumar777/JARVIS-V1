const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');

// ensure directory exists (in case DB_PATH includes folders)
try {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
} catch (e) {
  console.error('db init mkdir error', e);
}

const db = new Database(DB_PATH);

// Initialize schema
db.exec(`
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  input TEXT,
  userSeverity TEXT,
  parsed TEXT,
  ts TEXT
);

CREATE TABLE IF NOT EXISTS consults (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  phone TEXT,
  summary TEXT,
  ts TEXT
);
`);

function insertAnalysis(record) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO analyses (id, input, userSeverity, parsed, ts) VALUES (?, ?, ?, ?, ?)`);
  stmt.run(record.id, record.input || '', record.userSeverity || '', JSON.stringify(record.parsed || {}), record.ts || new Date().toISOString());
}

function insertConsult(rec) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO consults (id, name, email, phone, summary, ts) VALUES (?, ?, ?, ?, ?, ?)`);
  stmt.run(rec.id, rec.name || '', rec.email || '', rec.phone || '', rec.summary || '', rec.ts || new Date().toISOString());
}

function getRecords() {
  const analyses = db.prepare(`SELECT * FROM analyses ORDER BY ts DESC`).all().map(r => ({
    id: r.id,
    input: r.input,
    userSeverity: r.userSeverity,
    parsed: (() => { try { return JSON.parse(r.parsed); } catch (e) { return {}; } })(),
    ts: r.ts
  }));

  const consults = db.prepare(`SELECT * FROM consults ORDER BY ts DESC`).all().map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    summary: r.summary,
    ts: r.ts
  }));

  return { analyses, consults };
}

module.exports = {
  db,
  insertAnalysis,
  insertConsult,
  getRecords,
  DB_PATH
};

// Additional helpers: get by id and update
function getAnalysisById(id) {
  const r = db.prepare(`SELECT * FROM analyses WHERE id = ?`).get(id);
  if (!r) return null;
  try { r.parsed = JSON.parse(r.parsed); } catch (e) { r.parsed = {}; }
  return r;
}

function updateAnalysis(id, fields) {
  // fields: input, userSeverity, parsed, ts
  const existing = getAnalysisById(id);
  if (!existing) return false;
  const input = fields.input ?? existing.input;
  const userSeverity = fields.userSeverity ?? existing.userSeverity;
  const parsed = fields.parsed ? JSON.stringify(fields.parsed) : JSON.stringify(existing.parsed || {});
  const ts = fields.ts ?? existing.ts;
  const stmt = db.prepare(`UPDATE analyses SET input = ?, userSeverity = ?, parsed = ?, ts = ? WHERE id = ?`);
  const info = stmt.run(input, userSeverity, parsed, ts, id);
  return info.changes > 0;
}

function getConsultById(id) {
  const r = db.prepare(`SELECT * FROM consults WHERE id = ?`).get(id);
  return r || null;
}

function updateConsult(id, fields) {
  const existing = getConsultById(id);
  if (!existing) return false;
  const name = fields.name ?? existing.name;
  const email = fields.email ?? existing.email;
  const phone = fields.phone ?? existing.phone;
  const summary = fields.summary ?? existing.summary;
  const ts = fields.ts ?? existing.ts;
  const stmt = db.prepare(`UPDATE consults SET name = ?, email = ?, phone = ?, summary = ?, ts = ? WHERE id = ?`);
  const info = stmt.run(name, email, phone, summary, ts, id);
  return info.changes > 0;
}

module.exports.getAnalysisById = getAnalysisById;
module.exports.updateAnalysis = updateAnalysis;
module.exports.getConsultById = getConsultById;
module.exports.updateConsult = updateConsult;
