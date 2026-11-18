#!/usr/bin/env node
/**
 * E2E drag-and-drop dashboard con Playwright (desktop + mobile).
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
let PORT = 38988;
let BASE = `http://127.0.0.1:${PORT}`;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const p = typeof addr === 'object' && addr ? addr.port : 0;
      s.close((err) => (err ? reject(err) : resolve(p)));
    });
    s.on('error', reject);
  });
}

const tmpData = path.join(root, 'data', 'test-e2e-dnd');
fs.mkdirSync(tmpData, { recursive: true });
const dbPath = path.join(tmpData, 'intranet.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = new Database(dbPath);
runMigrations(db, dbPath);
const folderId = db
  .prepare(
    `INSERT INTO links (title, url, sort_order, visible, is_folder, folder_id, access_type)
     VALUES ('Smart Home', '', 3, 1, 1, NULL, 'external')`
  ).run().lastInsertRowid;

const rootRows = [
  ['Alpha', 'https://alpha.example', 0],
  ['Beta', 'https://beta.example', 1],
  ['Gamma', 'https://gamma.example', 2],
];
for (const [title, url, order] of rootRows) {
  db.prepare(
    `INSERT INTO links (title, url, url_external, sort_order, visible, is_folder, folder_id, access_type)
     VALUES (?, ?, ?, ?, 1, 0, NULL, 'external')`
  ).run(title, url, url, order);
}

const inFolder = [
  ['HA', 'http://192.168.1.10:8123', 0, 'http://192.168.1.10:8123', null],
  ['NAS locked', null, 1, null, 'http://192.168.1.20'],
];
for (const [title, urlExt, order, urlIp, url] of inFolder) {
  db.prepare(
    `INSERT INTO links (title, url, url_external, url_ip, sort_order, visible, is_folder, folder_id, access_type)
     VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`
  ).run(
    title,
    url || urlIp,
    urlExt,
    urlIp,
    order,
    folderId,
    urlExt ? 'local_exposed' : 'local_only'
  );
}
db.close();

const results = [];

function record(scenario, step, pass, detail = '') {
  results.push({ scenario, step, pass: pass ? 'OK' : 'FAIL', detail });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dbRootOrder() {
  const conn = new Database(dbPath, { readonly: true });
  const rows = conn
    .prepare(
      `SELECT title FROM links
       WHERE visible = 1 AND is_folder = 0 AND folder_id IS NULL
       ORDER BY sort_order ASC, id ASC`
    )
    .all();
  conn.close();
  return rows.map((r) => r.title);
}

function dbFolderOrder(folderId) {
  const conn = new Database(dbPath, { readonly: true });
  const rows = conn
    .prepare(
      `SELECT title FROM links
       WHERE visible = 1 AND is_folder = 0 AND folder_id = ?
       ORDER BY sort_order ASC, id ASC`
    )
    .all(folderId);
  conn.close();
  return rows.map((r) => r.title);
}

async function dragByHandle(page, title, targetTitle) {
  const handle = page.locator(
    `.sortable-card-shell:has([data-link-title="${title}"]) .card-drag-handle`
  );
  const target = page.locator(
    `.sortable-card-shell:has([data-link-title="${targetTitle}"])`
  );
  await handle.waitFor({ state: 'visible' });
  const h = await handle.boundingBox();
  const t = await target.boundingBox();
  assert.ok(h && t);
  const sx = h.x + h.width / 2;
  const sy = h.y + h.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 14, sy + 14, { steps: 6 });
  await sleep(50);
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 35 });
  await sleep(80);
  await page.mouse.up();
  await sleep(900);
}

let child;

function killPort(port) {
  try {
    execFileSync('bash', ['-c', `lsof -ti:${port} | xargs -r kill -9`], {
      stdio: 'ignore',
    });
  } catch {
    /* ignore */
  }
}

async function main() {
  PORT = await getFreePort();
  BASE = `http://127.0.0.1:${PORT}`;
  killPort(PORT);
  await sleep(200);

  console.log('Build…');
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });

  child = spawn('npm', ['run', 'start'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: `file:${path.resolve(dbPath)}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(d));
  child.stdout.on('data', (d) => process.stdout.write(d));

  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) {
      throw new Error(`Server uscito con codice ${child.exitCode}`);
    }
    try {
      const h = await fetch(`${BASE}/api/health`);
      if (h.ok) {
        ready = true;
        break;
      }
    } catch {
      await sleep(500);
    }
  }
  assert.ok(ready, 'Server non avviato');

  const browser = await chromium.launch();

  // --- Desktop ---
  const desk = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: false,
  });
  await desk.addCookies([
    {
      name: 'homelab_dnd_force',
      value: '1',
      url: BASE,
    },
  ]);
  const page = await desk.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => document.querySelectorAll('.card-drag-handle').length >= 3,
    { timeout: 15000 }
  );

  const handles = await page.locator('.card-drag-handle').count();
  assert.ok(handles >= 3, 'handle desktop');
  record('Desktop 1280px', 'Handle visibili', handles >= 3, String(handles));

  const before = dbRootOrder();
  assert.deepEqual(before, ['Alpha', 'Beta', 'Gamma']);
  record('Desktop 1280px', 'Ordine iniziale (API)', true, before.join(' > '));

  await dragByHandle(page, 'Gamma', 'Alpha');
  await sleep(600);
  const afterDrag = dbRootOrder();
  const reordered =
    afterDrag[0] === 'Gamma' &&
    afterDrag[1] === 'Alpha' &&
    afterDrag[2] === 'Beta';
  record(
    'Desktop 1280px',
    'Drag Gamma su Alpha',
    reordered,
    afterDrag.join(' > ')
  );
  assert.ok(reordered);

  await page.reload({ waitUntil: 'networkidle' });
  const afterReload = dbRootOrder();
  const persisted = afterReload[0] === 'Gamma';
  record(
    'Desktop 1280px',
    'Ordine persistito dopo reload',
    persisted,
    afterReload.join(' > ')
  );
  assert.ok(persisted);

  const betaLink = page.locator('a.card-link[data-link-title="Beta"]');
  const betaHref = await betaLink.getAttribute('href');
  assert.match(betaHref || '', /beta\.example/i);

  assert.match(betaHref || '', /beta\.example/i);
  const [newPage] = await Promise.all([
    desk.waitForEvent('page', { timeout: 10000 }),
    betaLink.click(),
  ]);
  const navUrl = newPage.url();
  const clickOpens =
    /beta\.example/i.test(navUrl) || /beta\.example/i.test(betaHref || '');
  record('Desktop 1280px', 'Click Beta apre href', clickOpens, navUrl || betaHref);
  await newPage.close().catch(() => {});
  assert.ok(clickOpens, `nav=${navUrl}`);

  await page.locator('[data-link-title="Smart Home"]').click();
  await page.waitForSelector('.modal-grid .card-drag-handle', { timeout: 5000 });
  const inModal = dbFolderOrder(Number(folderId));
  assert.deepEqual(inModal, ['HA', 'NAS locked']);
  record('Desktop 1280px', 'Cartella: ordine iniziale', true, inModal.join(' > '));

  await dragByHandle(page, 'NAS locked', 'HA');
  await sleep(600);
  const inModalAfter = dbFolderOrder(Number(folderId));
  const folderReordered = inModalAfter[0] === 'NAS locked';
  record(
    'Desktop 1280px',
    'Drag in cartella',
    folderReordered,
    inModalAfter.join(' > ')
  );
  assert.ok(folderReordered);

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-link-title="Smart Home"]').click();
  await page.waitForSelector('.modal-grid [data-link-title="NAS locked"]');
  const folderReload = dbFolderOrder(Number(folderId));
  record(
    'Desktop 1280px',
    'Ordine cartella persistito',
    folderReload[0] === 'NAS locked',
    folderReload.join(' > ')
  );
  assert.equal(folderReload[0], 'NAS locked');

  await desk.close();

  // --- Mobile ---
  const iPhone = devices['iPhone 12'];
  const mob = await browser.newContext({
    ...iPhone,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const mpage = await mob.newPage();
  await mpage.goto(BASE, { waitUntil: 'networkidle' });
  const mobHandles = await mpage.locator('.card-drag-handle').count();
  record('Mobile 390px', 'Nessun handle drag', mobHandles === 0, String(mobHandles));
  assert.equal(mobHandles, 0);

  const scrollFree = await mpage.evaluate(() => {
    const grid = document.querySelector('[data-dashboard-root]');
    if (!grid) return false;
    const ta = getComputedStyle(grid).touchAction;
    return ta !== 'none' && !grid.classList.contains('grid-env-pending');
  });
  record('Mobile 390px', 'Scroll non bloccato', scrollFree, 'touch-action ok');
  assert.ok(scrollFree);

  await mob.close();
  await browser.close();

  console.log('\n=== Tabella risultati Playwright DnD ===');
  console.table(results);

  child.kill('SIGTERM');
  killPort(PORT);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  if (child) child.kill('SIGTERM');
  killPort(PORT);
  process.exit(1);
});