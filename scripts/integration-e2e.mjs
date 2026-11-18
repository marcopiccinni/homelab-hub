#!/usr/bin/env node
/**
 * E2E locale: DB fixture, next start, curl Host/cookie, upload icona.
 */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/lib/migrations/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = 38977;
const BASE = `http://127.0.0.1:${PORT}`;

const tmpData = path.join(root, 'data', 'test-e2e-integration');
fs.mkdirSync(tmpData, { recursive: true });
const dbPath = path.join(tmpData, 'intranet.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = new Database(dbPath);
runMigrations(db, dbPath);
db.close();

const live = new Database(dbPath);
const fixtures = [
  ['Notion', 'https://notion.so', 'https://notion.so', null, null, 'external', 0],
  [
    'Google Calendar',
    'https://calendar.google.com',
    'https://calendar.google.com',
    null,
    null,
    'external',
    1,
  ],
  [
    'Home Assistant',
    'http://192.168.1.10:8123',
    'https://ha.example.com',
    'http://192.168.1.10:8123',
    null,
    'local_only',
    2,
  ],
  ['NAS solo IP', 'http://192.168.1.20', null, 'http://192.168.1.20', null, 'local_only', 3],
  [
    'Proxmox LAN',
    'http://pve.lan:8006',
    null,
    null,
    'http://pve.lan:8006',
    'local_only',
    4,
  ],
];

const ins = live.prepare(
  `INSERT INTO links (title, url, url_external, url_ip, url_local_fqdn, access_type, sort_order, visible, is_folder)
   VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`
);
for (const f of fixtures) ins.run(...f);
live.close();

const uploadsDir = path.join(root, 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

let child;
const results = [];

function record(scenario, host, cookie, title, expect) {
  results.push({ scenario, host, cookie, title, ...expect });
}

function parseOneCard(html, title) {
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const chunkRe = new RegExp(
    `data-link-title="${esc}"[\\s\\S]{0,1200}?(?:data-locked="([^"]*)")?[\\s\\S]{0,400}?(?:data-badge="([^"]*)")?[\\s\\S]{0,400}?(?:data-resolved-href="([^"]*)")?`,
    'i'
  );
  const m = chunkRe.exec(html);
  if (!m) return null;
  const lockedRe = new RegExp(
    `data-link-title="${esc}"[\\s\\S]{0,800}?data-locked="([^"]*)"`,
    'i'
  );
  const lm = lockedRe.exec(html);
  const badgeRe = new RegExp(
    `data-link-title="${esc}"[\\s\\S]{0,800}?data-badge="([^"]*)"`,
    'i'
  );
  const bm = badgeRe.exec(html);
  const hrefRe = new RegExp(
    `data-link-title="${esc}"[\\s\\S]{0,800}?data-resolved-href="([^"]*)"`,
    'i'
  );
  const hm = hrefRe.exec(html);
  return {
    title,
    locked: lm ? lm[1] === '1' : false,
    badge: bm ? bm[1] : '',
    href: hm ? hm[1] : '',
  };
}

function parseCards(html) {
  const titles = [
    'Notion',
    'Google Calendar',
    'Home Assistant',
    'NAS solo IP',
    'Proxmox LAN',
  ];
  return titles.map((t) => parseOneCard(html, t)).filter(Boolean);
}

function fetchHome(forwardedHost, cookie) {
  return new Promise((resolve, reject) => {
    const headers = {
      Host: `127.0.0.1:${PORT}`,
      'X-Forwarded-Host': forwardedHost,
      Accept: 'text/html',
    };
    if (cookie) headers.Cookie = cookie;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/',
        method: 'GET',
        headers,
      },
      (res) => {
        let html = '';
        res.on('data', (c) => {
          html += c;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode, cards: parseCards(html) });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function card(cards, title) {
  return cards.find((c) => c.title === title);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('Build produzione…');
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });

  child = spawn('npm', ['run', 'start'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: `file:${dbPath}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const h = await fetch(`${BASE}/api/health`);
      if (h.ok) {
        ready = true;
        break;
      }
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  assert.ok(ready, 'server non avviato');

  const scenarios = [
    {
      name: 'Auto + IP host',
      host: '192.168.1.5:5000',
      cookie: '',
      checks: [
        ['Home Assistant', { locked: false, badge: 'ip', hrefIncludes: '192.168' }],
        ['Notion', { locked: false, badge: 'web', hrefIncludes: 'notion' }],
        ['NAS solo IP', { locked: false, badge: 'ip' }],
        ['Proxmox LAN', { locked: false, badge: 'local' }],
      ],
    },
    {
      name: 'Override Esterno',
      host: '192.168.1.5:5000',
      cookie: 'homelab_env_override=external',
      checks: [
        ['Home Assistant', { locked: false, badge: 'web', hrefIncludes: 'ha.example' }],
        ['Notion', { locked: false, badge: 'web' }],
        ['NAS solo IP', { locked: true }],
        ['Proxmox LAN', { locked: true }],
      ],
    },
    {
      name: 'Host esterno + Auto',
      host: 'intranet.example.com:443',
      cookie: '',
      checks: [
        ['Google Calendar', { locked: false, badge: 'web', hrefIncludes: 'calendar' }],
        ['Home Assistant', { locked: false, badge: 'web', hrefIncludes: 'ha.example' }],
      ],
    },
    {
      name: 'Override Locale FQDN',
      host: 'intranet.example.com:443',
      cookie: 'homelab_env_override=local_fqdn',
      checks: [
        ['Proxmox LAN', { locked: false, badge: 'local', hrefIncludes: 'pve.lan' }],
        ['Home Assistant', { locked: false, badge: 'ip' }],
      ],
    },
  ];

  for (const sc of scenarios) {
    const { status, cards } = await fetchHome(sc.host, sc.cookie);
    assert.equal(status, 200, sc.name);
    for (const [title, exp] of sc.checks) {
      const c = card(cards, title);
      assert.ok(c, `${sc.name}: card ${title} mancante`);
      const ok =
        c.locked === exp.locked &&
        (!exp.badge || c.badge === exp.badge) &&
        (!exp.hrefIncludes || (c.href && c.href.includes(exp.hrefIncludes)));
      record(sc.name, sc.host, sc.cookie || 'auto', title, {
        locked: c.locked,
        badge: c.badge,
        href: c.href,
        pass: ok,
      });
      assert.ok(ok, `${sc.name} / ${title}: ${JSON.stringify(c)} vs ${JSON.stringify(exp)}`);
    }
  }

  // Override: due richieste consecutive (simula refresh dopo cookie)
  const before = await fetchHome('192.168.1.5:38977', '');
  const haBefore = card(before.cards, 'Home Assistant');
  const after = await fetchHome('192.168.1.5:38977', 'homelab_env_override=external');
  const haAfter = card(after.cards, 'Home Assistant');
  assert.notEqual(haBefore.href, haAfter.href);
  assert.match(haAfter.href, /ha\.example/);
  record(
    'Cambio override (curl)',
    '192.168.1.5',
    'external',
    'Home Assistant',
    {
      locked: haAfter.locked,
      badge: haAfter.badge,
      href: haAfter.href,
      pass: true,
    }
  );

  // Upload
  const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const form = new FormData();
  form.append('file', new Blob([PNG_1X1], { type: 'image/png' }), 't.png');
  const up = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form });
  assert.equal(up.status, 200);
  const { url } = await up.json();
  assert.match(url, /^\/uploads\//);
  const img = await fetch(`${BASE}${url}`);
  assert.equal(img.status, 200);
  const buf = Buffer.from(await img.arrayBuffer());
  assert.ok(buf.length > 50);
  record('Upload icona', '-', '-', '-', {
    locked: '-',
    badge: '-',
    href: url,
    pass: img.status === 200 && buf.length > 50,
    bytes: buf.length,
  });

  console.log('\n=== Tabella risultati E2E ===');
  console.table(results);

  child.kill('SIGTERM');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  if (child) child.kill('SIGTERM');
  process.exit(1);
});