#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  classifyLegacyUrl,
  isPrivateIpv4,
  matchesLocalSuffix,
} from '../src/lib/url-heuristics.js';
import {
  detectAccessEnvironment,
  resolveLinkForViewer,
  enrichLinksForViewer,
} from '../src/lib/access-environment.js';
import { badgeForResolvedHref } from '../src/lib/resolved-url-badge.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/lib/migrations/index.js';

// --- Ambiente ---
assert.equal(detectAccessEnvironment('192.168.1.50:5000', 'auto'), 'ip');
assert.equal(detectAccessEnvironment('nas.lan', 'auto'), 'local_fqdn');
assert.equal(detectAccessEnvironment('100.64.0.5', 'auto'), 'vpn');
assert.equal(detectAccessEnvironment('dashboard.example.com', 'auto'), 'external');
assert.equal(detectAccessEnvironment('nas.lan', 'external'), 'external');

// --- Classificazione migrazione ---
const ha = classifyLegacyUrl('http://192.168.1.10:8123');
assert.equal(ha.url_ip, 'http://192.168.1.10:8123');
assert.equal(ha.access_type, 'local_only');
assert.equal(ha.url, undefined);

const fqdn = classifyLegacyUrl('http://proxmox.lan:8006');
assert.equal(fqdn.url_local_fqdn, 'http://proxmox.lan:8006');
assert.equal(fqdn.access_type, 'local_only');

const ext = classifyLegacyUrl('https://github.com');
assert.equal(ext.url_external, 'https://github.com');
assert.equal(ext.access_type, 'external');

// --- Risoluzione href ---
const localLink = {
  is_folder: 0,
  access_type: 'local_only',
  url: 'http://192.168.1.1',
  url_ip: 'http://192.168.1.1',
  url_local_fqdn: null,
  url_external: null,
};

assert.equal(resolveLinkForViewer(localLink, 'external').locked, true);
assert.equal(
  resolveLinkForViewer(localLink, 'ip').href,
  'http://192.168.1.1'
);

const exposed = {
  is_folder: 0,
  access_type: 'local_exposed',
  url_external: 'https://ext.example',
  url_ip: 'http://10.0.0.1',
};
assert.equal(
  resolveLinkForViewer(exposed, 'external').href,
  'https://ext.example'
);
assert.equal(
  resolveLinkForViewer(exposed, 'ip').href,
  'http://10.0.0.1'
);

// --- Badge = sorgente URL risolto (non ambiente viewer) ---
const externalOnly = {
  is_folder: 0,
  access_type: 'external',
  url_external: 'https://notion.so',
  url_local_fqdn: null,
  url_ip: null,
  url: 'https://notion.so',
};
const fromIpViewer = resolveLinkForViewer(externalOnly, 'ip');
assert.equal(fromIpViewer.href, 'https://notion.so');
assert.equal(fromIpViewer.badge, 'web');

const [enrichedExternal] = enrichLinksForViewer([externalOnly], 'ip');
assert.equal(enrichedExternal.envBadge, 'web');

assert.equal(
  badgeForResolvedHref(
    { url_ip: 'http://10.0.0.2', url_external: 'https://x.com' },
    'http://10.0.0.2'
  ),
  'ip'
);

const lockedExt = resolveLinkForViewer(localLink, 'external');
assert.equal(lockedExt.locked, true);
assert.equal(lockedExt.badge, null);

// --- Migrazione 003 preserva url legacy ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'homelab-env-'));
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
    color TEXT DEFAULT NULL
  )
`);
db.prepare(
  `INSERT INTO links (title, url, visible, is_folder) VALUES (?, ?, 1, 0)`
).run('Test', 'http://192.168.0.5:8080');
const urlBefore = db.prepare('SELECT url FROM links WHERE id=1').get().url;
db.close();

const live = new Database(dbPath);
runMigrations(live, dbPath);
const row = live.prepare('SELECT url, url_ip, access_type FROM links WHERE id=1').get();
assert.equal(live.pragma('user_version', { simple: true }), 3);
assert.equal(row.url, urlBefore);
assert.equal(row.url_ip, 'http://192.168.0.5:8080');
assert.equal(row.access_type, 'local_only');
live.close();
fs.rmSync(tmp, { recursive: true, force: true });

assert.ok(isPrivateIpv4('10.0.0.1'));
assert.ok(matchesLocalSuffix('server.home.arpa'));

console.log('test-environment: tutti i test superati');