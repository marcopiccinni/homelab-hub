#!/usr/bin/env node
/**
 * Elenca file 0 byte (o mancanti) in public/uploads referenziati nel DB.
 * Non modifica file né record validi.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const uploadsRoot = path.join(root, 'public', 'uploads');

const dbUrl = process.env.DATABASE_URL || 'file:./data/intranet.db';
const dbPath = dbUrl.replace(/^file:/, '');
const absDb = path.isAbsolute(dbPath) ? dbPath : path.join(root, dbPath);

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else acc.push({ full, size: st.size, rel: path.relative(uploadsRoot, full) });
  }
  return acc;
}

console.log('Audit upload — root:', uploadsRoot);
console.log('Database:', absDb);

const zeroFiles = walk(uploadsRoot).filter((f) => f.size === 0);
if (zeroFiles.length) {
  console.log('\nFile da 0 byte sul disco:');
  for (const f of zeroFiles) {
    console.log(`  - ${f.rel} (0 byte)`);
  }
} else {
  console.log('\nNessun file 0 byte in public/uploads.');
}

if (!fs.existsSync(absDb)) {
  console.log('\nDB non trovato — salto controllo icon nel database.');
  process.exit(zeroFiles.length ? 1 : 0);
}

const db = new Database(absDb, { readonly: true });
const rows = db
  .prepare(`SELECT id, title, icon FROM links WHERE icon LIKE '/uploads/%'`)
  .all();
db.close();

const broken = [];
for (const row of rows) {
  const rel = row.icon.replace(/^\/uploads\//, '');
  const disk = path.join(uploadsRoot, rel);
  let bad = false;
  let reason = '';
  if (!fs.existsSync(disk)) {
    bad = true;
    reason = 'file mancante';
  } else if (fs.statSync(disk).size === 0) {
    bad = true;
    reason = '0 byte';
  }
  if (bad) broken.push({ ...row, reason, path: rel });
}

if (broken.length) {
  console.log('\nCollegamenti con icona rotta:');
  for (const b of broken) {
    console.log(`  - [${b.id}] ${b.title}: ${b.icon} (${b.reason})`);
  }
  process.exit(1);
}

console.log('\nNessuna icona rotta referenziata nel DB.');
process.exit(zeroFiles.length ? 1 : 0);