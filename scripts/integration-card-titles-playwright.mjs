#!/usr/bin/env node
/**
 * Titoli card: altezza uniforme, 2 righe, Playwright 1024/1280/390.
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
  'Servizi domestici lunghi',
];

const results = [];
function record(scenario, step, pass, detail = '') {
  results.push({ scenario, step, pass: pass ? 'OK' : 'FAIL', detail });
}

async function measureCards(page) {
  return page.evaluate((titles) => {
    const issues = [];
    const rootGrid = document.querySelector('[data-dashboard-root]');
    const cards = rootGrid
      ? [...rootGrid.querySelectorAll('.card')]
      : [...document.querySelectorAll('.modal-grid .card')];
    const heights = cards.map((c) => Math.round(c.getBoundingClientRect().height));
    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);
    if (maxH - minH > 1) {
      issues.push(`heights:${minH}-${maxH}`);
    }
    for (const el of document.querySelectorAll('.card-title')) {
      const text = el.textContent?.trim() || '';
      if (el.scrollHeight > el.clientHeight) {
        issues.push(`scroll:${text} (${el.scrollHeight}>${el.clientHeight})`);
      }
      const card = el.closest('.card');
      if (card) {
        const tr = el.getBoundingClientRect();
        const cr = card.getBoundingClientRect();
        if (tr.bottom > cr.bottom - 5) {
          issues.push(`margin:${text}`);
        }
      }
    }
    for (const t of titles) {
      if (
        ![...document.querySelectorAll('.card-title')].some(
          (el) => el.textContent?.trim() === t
        )
      ) {
        issues.push(`missing:${t}`);
      }
    }
    return {
      ok: issues.length === 0,
      issues,
      heights: `${minH}-${maxH}`,
    };
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

  LONG_TITLES.filter((t) => t !== 'Servizi domestici lunghi').forEach(
    (title, order) => {
      const url = `https://example.com/${order}`;
      db.prepare(
        `INSERT INTO links (title, url, url_external, sort_order, visible, is_folder, folder_id, access_type)
         VALUES (?, ?, ?, ?, 1, 0, NULL, 'external')`
      ).run(title, url, url, order);
    }
  );

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

  async function runViewport(label, width, screenshotName) {
    const ctx = await browser.newContext({
      viewport: { width, height: 800 },
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });

    const off = await measureCards(page);
    record(
      label,
      'Altezza uniforme + titoli (off)',
      off.ok,
      off.issues.join('; ') || `h=${off.heights}`
    );
    assert.ok(off.ok, off.issues.join(';'));

    if (screenshotName) {
      await page.screenshot({ path: path.join(ARTIFACTS, screenshotName) });
      record(label, 'Screenshot', true, screenshotName);
    }

    await page.locator('.dashboard-fab-cluster [data-reorder-toggle]').click();
    await sleep(250);
    const on = await measureCards(page);
    record(label, 'Titoli (riorganizza)', on.ok, on.issues.join(';'));
    assert.ok(on.ok);
    await page.keyboard.press('Escape');

    await page.locator('button[data-link-title="Servizi domestici lunghi"]').click();
    await page.waitForSelector('.modal-grid');
    const folder = await measureCards(page);
    record(label, 'Gruppo in modal', folder.ok, folder.issues.join(';'));
    assert.ok(folder.ok);
    await page.locator('.modal-close').click();
    await ctx.close();
  }

  await runViewport('Desktop 1024px', 1024);
  await runViewport('Desktop 1280px', 1280, 'dashboard-card-titles-desktop.png');

  const mob = await browser.newContext({
    ...devices['iPhone 12'],
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const mpage = await mob.newPage();
  await mpage.goto(BASE, { waitUntil: 'networkidle' });
  const mobOff = await measureCards(mpage);
  record(
    'Mobile 390px',
    'Altezza uniforme + titoli (off)',
    mobOff.ok,
    mobOff.issues.join(';')
  );
  assert.ok(mobOff.ok);
  await mpage.screenshot({
    path: path.join(ARTIFACTS, 'dashboard-card-titles-mobile.png'),
  });
  record('Mobile 390px', 'Screenshot', true, 'dashboard-card-titles-mobile.png');

  await mpage.locator('.dashboard-fab-cluster [data-reorder-toggle]').tap();
  await sleep(250);
  const mobOn = await measureCards(mpage);
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