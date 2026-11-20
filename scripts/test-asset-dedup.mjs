#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../src/lib/migrations/index.js';
import * as m008 from '../src/lib/migrations/008_asset_dedup.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function runThroughVersion(db, maxVersion) {
  for (const migration of MIGRATIONS.filter((m) => m.version <= maxVersion)) {
    const run = db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    });
    run();
  }
}

const dbPath = path.join(root, 'data', 'test-asset-dedup.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
const db = new Database(dbPath);
runThroughVersion(db, 7);

const a1 = db
  .prepare(`INSERT INTO assets (name, status) VALUES ('Canon host', 'active')`)
  .run().lastInsertRowid;
const a2 = db
  .prepare(`INSERT INTO assets (name, status) VALUES ('Dup host', 'active')`)
  .run().lastInsertRowid;
const subnet = db.prepare(`SELECT id FROM subnets LIMIT 1`).get()?.id;
const ipId = db
  .prepare(`INSERT INTO ip_addresses (address, subnet_id) VALUES ('10.0.4.77', ?)`)
  .run(subnet).lastInsertRowid;
db.prepare(`INSERT INTO asset_ip_assignments (asset_id, ip_id) VALUES (?, ?)`).run(a1, ipId);
db.prepare(`INSERT INTO asset_ip_assignments (asset_id, ip_id) VALUES (?, ?)`).run(a2, ipId);
db.close();

const db2 = new Database(dbPath);
m008.up(db2);
db2.pragma('user_version = 8');
const dupCount = db2
  .prepare(
    `SELECT COUNT(DISTINCT aia.asset_id) AS n FROM asset_ip_assignments aia
     JOIN assets a ON a.id=aia.asset_id AND a.status='active'
     WHERE aia.ip_id=?`
  )
  .get(ipId).n;
assert.equal(dupCount, 1, 'migration 008 unisce IP condivisi');
const logs = db2.prepare('SELECT COUNT(*) AS n FROM asset_merge_log').get().n;
assert.ok(logs >= 1, 'log merge presente');
db2.close();

process.env.DATABASE_URL = `file:${dbPath}`;
const { listHostsSummary } = await import('../src/lib/assets/host-view.js');
const { assignIp, createAsset } = await import('../src/lib/assets/crud.js');

const rows = listHostsSummary().filter((h) => h.ip_list?.includes('10.0.4.77'));
assert.equal(rows.length, 1, 'lista host: una riga per IP');

const id1 = createAsset({ name: 'Prevent A', category: 'PC' });
const id2 = createAsset({ name: 'Prevent B', category: 'PC' });
assignIp(id1, '10.0.4.88');
assignIp(id2, '10.0.4.88');
const rows88 = listHostsSummary().filter((h) => h.ip_list?.includes('10.0.4.88'));
assert.equal(rows88.length, 1, 'assignIp impedisce nuovi duplicati');

console.log('test-asset-dedup: OK');