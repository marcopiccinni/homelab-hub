#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/lib/migrations/index.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hl-m004-'));
const dbPath = path.join(tmp, 'intranet.db');
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
    color TEXT DEFAULT NULL,
    url_external TEXT,
    url_local_fqdn TEXT,
    url_ip TEXT,
    access_type TEXT NOT NULL DEFAULT 'external'
  );
`);

db.prepare(
  `INSERT INTO links (title, url_external, url_ip, access_type, visible, is_folder)
   VALUES (?, ?, ?, ?, 1, 0)`
).run(
  'Home Assistant',
  'https://ha.example.com',
  'http://192.168.1.10:8123',
  'local_only'
);

db.prepare(
  `INSERT INTO links (title, url_external, access_type, visible, is_folder)
   VALUES (?, ?, ?, 1, 0)`
).run('Notion dup', 'https://notion.so', 'local_only');

db.prepare(
  `INSERT INTO links (title, url_ip, access_type, visible, is_folder)
   VALUES (?, ?, ?, 1, 0)`
).run('NAS', 'http://192.168.1.2', 'local_only');

db.pragma('user_version = 3');
db.close();

const live = new Database(dbPath);
runMigrations(live, dbPath);

assert.equal(live.pragma('user_version', { simple: true }), 4);

const ha = live.prepare('SELECT access_type FROM links WHERE title = ?').get('Home Assistant');
assert.equal(ha.access_type, 'local_exposed');

const notion = live.prepare('SELECT access_type FROM links WHERE title = ?').get('Notion dup');
assert.equal(notion.access_type, 'external');

const nas = live.prepare('SELECT access_type FROM links WHERE title = ?').get('NAS');
assert.equal(nas.access_type, 'local_only');

live.close();
fs.rmSync(tmp, { recursive: true, force: true });

console.log('test-migration-004: superato');