const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const DATA_FILE = path.join(__dirname, 'data.json');

function migrate() {
  if (!fs.existsSync(DATA_FILE)) {
    console.log('No data.json found, nothing to migrate.');
    return;
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');

    const analyses = parsed.analyses || [];
    const consults = parsed.consults || [];

    console.log(`Migrating ${analyses.length} analyses and ${consults.length} consults to sqlite at ${db.DB_PATH}`);

    analyses.forEach(a => {
      const id = a.id || uuidv4();
      db.insertAnalysis({ id, input: a.input || '', userSeverity: a.userSeverity || '', parsed: a.parsed || {}, ts: a.ts || new Date().toISOString() });
    });

    consults.forEach(c => {
      const id = c.id || uuidv4();
      db.insertConsult({ id, name: c.name || '', email: c.email || '', phone: c.phone || '', summary: c.summary || '', ts: c.ts || new Date().toISOString() });
    });

    const backup = DATA_FILE + '.bak.' + Date.now();
    fs.renameSync(DATA_FILE, backup);
    console.log('Migration complete. Original file renamed to', backup);
  } catch (e) {
    console.error('Migration failed', e);
  }
}

migrate();
