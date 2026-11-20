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

const shellyIp = db.prepare('SELECT id FROM ip_addresses WHERE address=?').get('10.0.4.10');
if (shellyIp) {
  const link = db
    .prepare(
      `INSERT INTO links (title, url, url_local_fqdn, visible, is_folder, sort_order, access_type)
       VALUES ('Synth Shelly dash', 'http://shelly.test.lan:8080', 'http://shelly.test.lan:8080', 1, 0, 0, 'local_fqdn')`
    )
    .run();
  db.prepare(
    `INSERT INTO declared_services (name, protocol, port, in_intranet, link_id, ip_id)
     VALUES ('Synth HTTP', 'tcp', 8080, 1, ?, ?)`
  ).run(link.lastInsertRowid, shellyIp.id);
  const jobId = db
    .prepare(
      `INSERT INTO scan_jobs (job_type, target, profile, status, finished_at) VALUES ('host', '10.0.4.10', 'quick', 'done', datetime('now'))`
    )
    .run().lastInsertRowid;
  db.prepare(
    `INSERT INTO observed_services (scan_job_id, ip_id, address, observed_at, protocol, port, state, service_name)
     VALUES (?, ?, '10.0.4.10', datetime('now'), 'tcp', 8080, 'open', 'http')`
  ).run(jobId, shellyIp.id);
  db.prepare(
    `INSERT INTO observed_services (scan_job_id, ip_id, address, observed_at, protocol, port, state, service_name)
     VALUES (?, ?, '10.0.4.10', datetime('now'), 'tcp', 8443, 'open', 'https-alt')`
  ).run(jobId, shellyIp.id);
}

db.close();
console.log(JSON.stringify(stats));