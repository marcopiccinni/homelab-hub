#!/usr/bin/env node
/**
 * Titoli card: due righe visibili, Playwright 1024/1280/390 + riorganizza + cartella.
 */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { chromium, devices } from 'playwright';
import { runMigrations } from '../src/lib/migrations/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const ARTIFACTS = '/opt/cursor/artifacts';
let child;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close((err) => (err ? reject(err) : resolve(p)));
    });
    s.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const LONG_TITLES = [
  'Home Assistant',
  'Google Calendar',
  'Salute e benessere',
  'Sleeves Manager',
  'Advanced D&D Card',
];

const results = [];
function record(scenario, step, pass, detail = '') {
  results.push({ scenario, step, pass: pass ? 'OK' : 'FAIL', detail });
}

async function titlesNotClipped(page) {
  return page.evaluate((titles) => {
    const issues = [];
    for (const el of document.querySelectorAll('.card-title')) {
      const text = el.textContent?.trim() || '';
      const card = el.closest('.card');
      if (!card) continue;
      const tr = el.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      if (tr.bottom > cr.bottom - 4) {
        issues.push(`overflow:${text}`);
      }
    }
    for (const t of titles) {
      const found = [...document.querySelectorAll('.card-title')].find(
        (el) => el.textContent?.trim() === t
      );
      if (!found) issues.push(`missing:${t}`);
    }
    return { ok: issues.length === 0, issues };
  }, LONG_TITLES);
}

async function main() {
  const tmpData = path.join(root, 'data', 'test-e2e-titles');
  fs.mkdirSync(tmpData, { recursive: true });
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const dbPath = path.join(tmpData, 'intranet.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = new Database(dbPath);
  runMigrations(db, dbPath);
  const folderId = db
    .prepare(
      `INSERT INTO links (title, url, sort_order, visible, is_folder, folder_id, access_type)
       VALUES ('Servizi domestici lunghi', '', 5, 1, 1, NULL, 'external')`
    )
    .run().lastInsertRowid;

  LONG_TITLES.forEach((title, order) => {
    const url = `https://example.com/${order}`;
    db.prepare(
      `INSERT INTO links (title, url, url_external, sort_order, visible, is_folder, folder_id, access_type)
       VALUES (?, ?, ?, ?, 1, 0, NULL, 'external')`
    ).run(title, url, url, order);
  });

  db.prepare(
    `INSERT INTO links (title, url, url_external, sort_order, visible, is_folder, folder_id, access_type)
     VALUES ('NAS backup lungo nome', 'http://192.168.1.20', 'http://192.168.1.20', 0, 1, 0, ?, 'local_only')`
  ).run(folderId);

  db.close();

  const PORT = await getFreePort();
  const BASE = `http://127.0.0.1:${PORT}`;

  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });

  child = spawn('npm', ['run', 'start'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: `file:${path.resolve(dbPath)}`,
    },
    stdio: 'ignore',
  });

  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {
      await sleep(400);
    }
  }

  const browser = await chromium.launch();

  for (const [label, width] of [
    ['Desktop 1024px', 1024],
    ['Desktop 1280px', 1280],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 800 },
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const check = await titlesNotClipped(page);
    record(label, 'Titoli non troncati (off)', check.ok, check.issues.join(';'));
    assert.ok(check.ok, check.issues.join(';'));

    await page.locator('.dashboard-fab-cluster [data-reorder-toggle]').click();
    await sleep(300);
    const on = await titlesNotClipped(page);
    record(label, 'Titoli non troncati (riorganizza)', on.ok, on.issues.join(';'));
    assert.ok(on.ok);
    await page.keyboard.press('Escape');

    if (width === 1280) {
      await page.screenshot({
        path: path.join(ARTIFACTS, 'dashboard-card-titles-desktop.png'),
      });
      record(label, 'Screenshot', true, 'dashboard-card-titles-desktop.png');
    }

    await page.locator('button[data-link-title="Servizi domestici lunghi"]').click();
    await page.waitForSelector('.modal-grid .card-title');
    const folderCheck = await titlesNotClipped(page);
    record(label, 'Titoli gruppo/cartella', folderCheck.ok, folderCheck.issues.join(';'));
    assert.ok(folderCheck.ok);
    await page.locator('.modal-close').click();
    await ctx.close();
  }

  const mob = await browser.newContext({
    ...devices['iPhone 12'],
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const mpage = await mob.newPage();
  await mpage.goto(BASE, { waitUntil: 'networkidle' });
  const mobOff = await titlesNotClipped(mpage);
  record('Mobile 390px', 'Titoli non troncati (off)', mobOff.ok, mobOff.issues.join(';'));
  assert.ok(mobOff.ok);

  await mpage.screenshot({
    path: path.join(ARTIFACTS, 'dashboard-card-titles-mobile.png'),
  });
  record('Mobile 390px', 'Screenshot', true, 'dashboard-card-titles-mobile.png');

  await mpage.locator('.dashboard-fab-cluster [data-reorder-toggle]').tap();
  await sleep(300);
  const mobOn = await titlesNotClipped(mpage);
  record('Mobile 390px', 'Titoli (riorganizza)', mobOn.ok, mobOn.issues.join(';'));
  assert.ok(mobOn.ok);

  await mob.close();
  await browser.close();

  console.log('\n=== Tabella titoli card ===');
  console.table(results);

  child.kill('SIGTERM');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  if (child) child.kill('SIGTERM');
  process.exit(1);
});