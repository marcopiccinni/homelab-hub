#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/lib/migrations/index.js';
import { importWorkbook } from '../src/lib/assets/excel-import.js';
import { getHostView, listHostsSummary } from '../src/lib/assets/host-view.js';
import { execFileSync } from 'child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(root, 'data', 'test-host-view.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
process.env.DATABASE_URL = `file:${path.resolve(dbPath)}`;
const db = new Database(dbPath);
runMigrations(db, dbPath);
execFileSync('node', ['scripts/seed-synth-assets.mjs', dbPath], { cwd: root, stdio: 'inherit' });

const asset = db
  .prepare(`SELECT a.id FROM assets a JOIN asset_ip_assignments aia ON aia.asset_id=a.id JOIN ip_addresses i ON i.id=aia.ip_id WHERE i.address='10.0.4.10'`)
  .get();
assert.ok(asset, 'shelly asset');
const view = getHostView(asset.id);
assert.ok(view.rows.length >= 2, `rows ${view.rows.length}`);
const p8080 = view.rows.find((r) => r.port === 8080);
assert.ok(p8080, 'port 8080');
assert.ok(p8080.sources.includes('nmap'), 'nmap source');
assert.ok(p8080.sources.includes('declared') || p8080.sources.includes('link'), 'declared or link');

const hosts = listHostsSummary({});
assert.ok(hosts.length >= 1);
assert.ok(hosts.some((h) => h.id === asset.id));

db.close();
fs.unlinkSync(dbPath);
console.log('test-host-view: OK');