#!/usr/bin/env node
/**
 * Copies a legacy-schema SQLite DB, runs migrations, and asserts row data is unchanged.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/lib/migrations/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'homelab-migrate-'));
const dbPath = path.join(tmpDir, 'intranet.db');

const db = new Database(dbPath);
db.exec(`
  CREATE TABLE links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    visible INTEGER DEFAULT 1,
    is_folder INTEGER DEFAULT 0,
    folder_id INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    color TEXT DEFAULT NULL
  )
`);

db.prepare(
  `INSERT INTO links (title, url, icon, sort_order, visible, is_folder, folder_id, color)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
).run('Home Assistant', 'http://192.168.1.10:8123', '/default-icon.svg', 0, 1, 0, null, '#3367d6');

db.prepare(
  `INSERT INTO links (title, url, icon, sort_order, visible, is_folder, folder_id, color)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
).run('Smart Home', '', null, 1, 1, 1, null, null);

db.prepare(
  `INSERT INTO links (title, url, icon, sort_order, visible, is_folder, folder_id, color)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
).run('Orphan link', 'http://10.0.0.5', null, 2, 1, 0, 999, null);

const before = db.prepare('SELECT id, title, url, icon, sort_order, visible, is_folder, folder_id, color FROM links ORDER BY id').all();
db.close();

const live = new Database(dbPath);
runMigrations(live, dbPath);

const version = live.pragma('user_version', { simple: true });
if (version !== 8) {
  console.error('Expected user_version 8, got', version);
  process.exit(1);
}
const assetCols = live.prepare('PRAGMA table_info(assets)').all().map((c) => c.name);
if (!assetCols.includes('last_seen_source')) {
  console.error('Migration 007: last_seen_source missing');
  process.exit(1);
}
const mergeLog = live
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='asset_merge_log'`)
  .get();
if (!mergeLog) {
  console.error('Migration 008: asset_merge_log missing');
  process.exit(1);
}

const after = live.prepare('SELECT id, title, url, icon, sort_order, visible, is_folder, folder_id, color FROM links ORDER BY id').all();

const ha = live.prepare('SELECT url_ip, access_type FROM links WHERE title = ?').get('Home Assistant');
if (ha.url_ip !== 'http://192.168.1.10:8123' || ha.access_type !== 'local_only') {
  console.error('Migration 003: Home Assistant classification wrong', ha);
  process.exit(1);
}

function rowKey(r) {
  return `${r.id}|${r.title}|${r.url}|${r.icon}|${r.sort_order}|${r.visible}|${r.is_folder}`;
}

for (const row of before) {
  const match = after.find((a) => a.id === row.id);
  if (!match) {
    console.error('Missing row id', row.id);
    process.exit(1);
  }
  if (row.title === 'Orphan link') {
    if (rowKey(row) !== rowKey(match)) {
      console.error('Orphan row core fields changed', row, match);
      process.exit(1);
    }
    if (match.folder_id !== null) {
      console.error('Orphan folder_id should be null, got', match.folder_id);
      process.exit(1);
    }
    continue;
  }
  if (
    rowKey(row) !== rowKey(match) ||
    row.folder_id !== match.folder_id ||
    row.color !== match.color
  ) {
    console.error('Row content changed for id', row.id, row, match);
    process.exit(1);
  }
}

live.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('Migration test passed: rows preserved, orphans fixed, user_version=', version);