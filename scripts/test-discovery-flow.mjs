#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { runMigrations } from '../src/lib/migrations/index.js';
import { createAssetFromDiscovery } from '../src/lib/assets/discovery.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(root, 'data', 'test-discovery-flow.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
process.env.DATABASE_URL = `file:${dbPath}`;

const db = new Database(dbPath);
runMigrations(db, dbPath);

const subnet = db.prepare(`SELECT id FROM subnets WHERE cidr LIKE '10.0.5.%' LIMIT 1`).get();
assert.ok(subnet, 'subnet synth');

const q = db
  .prepare(
    `INSERT INTO discovery_queue (ip_address, mac_address, hostname, status, last_seen_at)
     VALUES ('10.0.5.77', '02:AA:BB:CC:DD:EE', 'synth-disc', 'pending', datetime('now'))`
  )
  .run().lastInsertRowid;

const created = createAssetFromDiscovery(q, {});
assert.equal(created.merged, false);
assert.ok(created.assetId);

const asset = db.prepare('SELECT primary_subnet_id, last_seen_at FROM assets WHERE id=?').get(created.assetId);
assert.equal(asset.primary_subnet_id, subnet.id);
assert.ok(asset.last_seen_at);

const listed = db
  .prepare(
    `SELECT a.id FROM assets a WHERE a.status='active' AND EXISTS (
      SELECT 1 FROM asset_ip_assignments aia JOIN ip_addresses i ON i.id=aia.ip_id
      WHERE aia.asset_id=a.id AND i.subnet_id=?)`
  )
  .all(subnet.id);
assert.ok(listed.some((r) => r.id === created.assetId));

const q2 = db
  .prepare(
    `INSERT INTO discovery_queue (ip_address, mac_address, hostname, status) VALUES (?,?,?,'pending')`
  )
  .run('10.0.5.78', '02:AA:BB:CC:DD:EE', 'dup-mac');

const merged = createAssetFromDiscovery(q2.lastInsertRowid, {});
assert.equal(merged.merged, true);
assert.equal(merged.assetId, created.assetId);

db.close();
fs.unlinkSync(dbPath);
console.log('test-discovery-flow: OK');