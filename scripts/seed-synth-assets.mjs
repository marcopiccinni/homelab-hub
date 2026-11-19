#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/lib/migrations/index.js';
import { importWorkbook } from '../src/lib/assets/excel-import.js';

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('Usage: seed-synth-assets.mjs <dbPath>');
  process.exit(1);
}
process.env.DATABASE_URL = `file:${path.resolve(dbPath)}`;

const dir = path.dirname(dbPath);
fs.mkdirSync(dir, { recursive: true });
const db = new Database(dbPath);
runMigrations(db, dbPath);
const subnets = db.prepare('SELECT * FROM subnets ORDER BY sort_order').all();
const fixture = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures/synth-assets.xlsx');
const stats = importWorkbook(fs.readFileSync(fixture), subnets);
db.close();
console.log(JSON.stringify(stats));