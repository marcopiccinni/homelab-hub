#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/lib/migrations/index.js';
import { importWorkbook, parseWorkbookPreview } from '../src/lib/assets/excel-import.js';
import { execFileSync } from 'child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(root, 'scripts/fixtures/synth-assets.xlsx');

if (!fs.existsSync(fixture)) {
  execFileSync('node', ['scripts/fixtures/create-synth-xlsx.mjs'], { cwd: root, stdio: 'inherit' });
}

const dbPath = path.join(root, 'data', 'test-excel-import.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
process.env.DATABASE_URL = `file:${path.resolve(dbPath)}`;
const db = new Database(dbPath);
runMigrations(db, dbPath);
const subnets = db.prepare('SELECT * FROM subnets ORDER BY sort_order').all();
const buf = fs.readFileSync(fixture);
const preview = parseWorkbookPreview(buf, subnets);
assert.ok(preview.assets >= 5, `asset preview ${preview.assets}`);
assert.ok(preview.grid_rows >= 5, `grid_rows ${preview.grid_rows}`);
assert.ok(preview.services >= 4, `services ${preview.services}`);

const stats = importWorkbook(buf, subnets);
assert.ok(stats.assets_new + stats.assets_updated >= 5);
assert.ok(stats.grid_rows >= 5);

const byCode = db.prepare('SELECT asset_code, name FROM assets WHERE asset_code IN (0,1,40000)').all();
assert.ok(byCode.some((r) => r.asset_code === 1));
assert.ok(byCode.some((r) => r.asset_code === 40000));

db.close();
fs.unlinkSync(dbPath);
console.log('test-excel-import-real-shape: OK');