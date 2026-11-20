#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { runMigrations } from '../src/lib/migrations/index.js';
import { applyMercusysClientRecords } from '../src/lib/assets/mercusys.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(root, 'data', 'test-mercusys-sync.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
process.env.DATABASE_URL = `file:${dbPath}`;

const db = new Database(dbPath);
runMigrations(db, dbPath);

const assetId = db
  .prepare(`INSERT INTO assets (name, status) VALUES ('synth-device', 'active')`)
  .run().lastInsertRowid;
db.prepare(`INSERT INTO asset_interfaces (asset_id, mac_address, iface_type) VALUES (?, ?, 'eth')`).run(
  assetId,
  '02:11:22:33:44:55'
);

const { updated, imported } = applyMercusysClientRecords(
  [
    {
      ip: '10.0.5.10',
      mac: '02:11:22:33:44:55',
      hostname: 'phone',
      routerOnline: true,
    },
    { ip: '10.0.5.99', mac: '02:99:88:77:66:55', hostname: 'new', routerOnline: true },
  ],
  { queueNew: true }
);

assert.equal(updated, 1);
assert.equal(imported, 1);

const row = db.prepare('SELECT last_seen_at, last_seen_source FROM assets WHERE id=?').get(assetId);
assert.ok(row.last_seen_at);
assert.equal(row.last_seen_source, 'mercusys');

const queued = db.prepare(`SELECT ip_address FROM discovery_queue WHERE status='pending'`).all();
assert.equal(queued.length, 1);
assert.equal(queued[0].ip_address, '10.0.5.99');

const onlySync = applyMercusysClientRecords(
  [{ ip: '10.0.5.99', mac: '02:99:88:77:66:55', routerOnline: true }],
  { queueNew: false }
);
assert.equal(onlySync.imported, 0);

db.close();
fs.unlinkSync(dbPath);
console.log('test-mercusys-sync: OK');