import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/lib/migrations/index.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hl-m005-'));
const dbPath = path.join(tmp, 'intranet.db');
const db = new Database(dbPath);
runMigrations(db, dbPath);

const version = db.pragma('user_version', { simple: true });
assert.ok(version >= 5 && version <= 6, `user_version ${version}`);

const subnets = db.prepare('SELECT COUNT(*) AS c FROM subnets').get().c;
assert.ok(subnets >= 10);

db.prepare(
  `INSERT INTO links (title, url, url_external, sort_order, visible, is_folder)
   VALUES ('Synth', 'https://synth.example', 'https://synth.example', 0, 1, 0)`
).run();

db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('test-migration-005: superato');