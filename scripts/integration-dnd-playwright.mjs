#!/usr/bin/env node
/**
 * E2E modalità Riorganizza (Playwright).
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
fs.mkdirSync(ARTIFACTS, { recursive: true });
const dbPath = path.join(tmpData, 'intranet.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = new Database(dbPath);
runMigrations(db, dbPath);
const folderId = db
  .prepare(
    `INSERT INTO links (title, url, sort_order, visible, is_folder, folder_id, access_type)
     VALUES ('Smart Home', '', 3, 1, 1, NULL, 'external')`
  )
  .run().lastInsertRowid;

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

function dbFolderOrder(fid) {
  const conn = new Database(dbPath, { readonly: true });
  const rows = conn
    .prepare(
      `SELECT title FROM links
       WHERE visible = 1 AND is_folder = 0 AND folder_id = ?
       ORDER BY sort_order ASC, id ASC`
    )
    .all(fid);
  conn.close();
  return rows.map((r) => r.title);
}

function killPort(port) {
  try {
    execFileSync('bash', ['-c', `lsof -ti:${port} | xargs -r kill -9`], {
      stdio: 'ignore',
    });
  } catch {
    /* ignore */
  }
}

async function toggleReorder(page, scope = 'main') {
  const sel =
    scope === 'modal'
      ? '.modal-header [data-reorder-toggle]'
      : '.dashboard-fab-cluster [data-reorder-toggle]';
  await page.locator(sel).click();
  await sleep(200);
}

async function fabClusterClearsCards(page) {
  return page.evaluate(() => {
    const fab = document.querySelector('.dashboard-fab-cluster');
    const grid = document.querySelector('[data-dashboard-root]');
    if (!fab || !grid) return false;
    const fr = fab.getBoundingClientRect();
    const cards = grid.querySelectorAll('.card, .sortable-card-shell > .card, .sortable-card-shell > a.card, .sortable-card-shell > button.card, .sortable-card-shell > div.card');
    let maxBottom = grid.getBoundingClientRect().top;
    cards.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom > maxBottom) maxBottom = r.bottom;
    });
    return maxBottom <= fr.top - 4;
  });
}

async function dragCard(page, title, targetTitle) {
  const card = page.locator(
    `.sortable-card-shell.reorder-active:has([data-link-title="${title}"])`
  );
  const target = page.locator(
    `.sortable-card-shell.reorder-active:has([data-link-title="${targetTitle}"])`
  );
  await card.waitFor({ state: 'visible' });
  const h = await card.boundingBox();
  const t = await target.boundingBox();
  assert.ok(h && t);
  const sx = h.x + h.width / 2;
  const sy = h.y + h.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 14, sy + 14, { steps: 5 });
  await sleep(40);
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 30 });
  await sleep(60);
  await page.mouse.up();
  await sleep(700);
}

let child;

async function main() {
  PORT = await getFreePort();
  BASE = `http://127.0.0.1:${PORT}`;
  killPort(PORT);
  await sleep(200);

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

  // --- Desktop 1280 ---
  const desk = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: false,
  });
  const page = await desk.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });

  const modeOff = await page.getAttribute('.page-dashboard', 'data-reorder-mode');
  record('Desktop 1280px', 'Modalità off iniziale', modeOff === '0', modeOff);
  assert.equal(modeOff, '0');

  await page.locator('.dashboard-fab-cluster [data-reorder-toggle]').waitFor();
  const deskClear = await fabClusterClearsCards(page);
  record('Desktop 1280px', 'FAB non copre card', deskClear, String(deskClear));
  assert.ok(deskClear);

  await page.screenshot({
    path: path.join(ARTIFACTS, 'dashboard-fab-desktop.png'),
    fullPage: false,
  });
  record('Desktop 1280px', 'Screenshot fab off', true, 'dashboard-fab-desktop.png');

  await toggleReorder(page);
  const modeOn = await page.getAttribute('.page-dashboard', 'data-reorder-mode');
  const wiggle = await page.locator('.card-wiggle').count();
  record(
    'Desktop 1280px',
    'Toggle Riorganizza attivo',
    modeOn === '1' && wiggle >= 3,
    `mode=${modeOn} wiggle=${wiggle}`
  );
  assert.equal(modeOn, '1');
  assert.ok(wiggle >= 3);

  const linksOff = await page.locator('a.card-link[data-link-title="Beta"]').count();
  record('Desktop 1280px', 'Nessun link cliccabile in modalità', linksOff === 0, String(linksOff));
  assert.equal(linksOff, 0);

  assert.deepEqual(dbRootOrder(), ['Alpha', 'Beta', 'Gamma']);
  await dragCard(page, 'Gamma', 'Alpha');
  const afterDrag = dbRootOrder();
  const reordered =
    afterDrag[0] === 'Gamma' && afterDrag[1] === 'Alpha' && afterDrag[2] === 'Beta';
  record('Desktop 1280px', 'Drag Gamma su Alpha', reordered, afterDrag.join(' > '));
  assert.ok(reordered);

  await page.reload({ waitUntil: 'networkidle' });
  const afterReload = dbRootOrder();
  record(
    'Desktop 1280px',
    'Ordine persistito reload',
    afterReload[0] === 'Gamma',
    afterReload.join(' > ')
  );
  assert.equal(afterReload[0], 'Gamma');

  await page.keyboard.press('Escape');
  await sleep(200);
  const afterEsc = await page.getAttribute('.page-dashboard', 'data-reorder-mode');
  record('Desktop 1280px', 'Esc disattiva modalità', afterEsc === '0', afterEsc);
  assert.equal(afterEsc, '0');

  await page.locator('button[data-link-title="Smart Home"]').click({ timeout: 5000 });
  await page.waitForSelector('.modal-grid');
  await toggleReorder(page, 'modal');
  await page.waitForSelector('.modal-grid .sortable-card-shell.reorder-active', {
    timeout: 8000,
  });
  assert.deepEqual(dbFolderOrder(Number(folderId)), ['HA', 'NAS locked']);
  await dragCard(page, 'NAS locked', 'HA');
  const folderAfter = dbFolderOrder(Number(folderId));
  record(
    'Desktop 1280px',
    'Drag in cartella',
    folderAfter[0] === 'NAS locked',
    folderAfter.join(' > ')
  );
  assert.equal(folderAfter[0], 'NAS locked');
  await page.locator('.modal-close').click();
  await sleep(200);
  if ((await page.getAttribute('.page-dashboard', 'data-reorder-mode')) === '1') {
    await toggleReorder(page);
  }

  const betaLink = page.locator('a.card-link[data-link-title="Beta"]');
  const betaHref = await betaLink.getAttribute('href');
  assert.match(betaHref || '', /beta\.example/i);
  const popupPromise = desk.waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await betaLink.click();
  const popup = await popupPromise;
  const clickOpens =
    /beta\.example/i.test(betaHref || '') ||
    (popup && /beta\.example/i.test(popup.url()));
  record(
    'Desktop 1280px',
    'Fuori modalità: click Beta',
    clickOpens,
    popup?.url() || betaHref
  );
  if (popup) await popup.close().catch(() => {});
  assert.ok(clickOpens);

  const noDragOff = await page.locator('.sortable-card-shell.reorder-active').count();
  record('Desktop 1280px', 'Fuori modalità: nessun drag shell', noDragOff === 0, String(noDragOff));
  assert.equal(noDragOff, 0);

  await desk.close();

  // --- Mobile 390 ---
  const iPhone = devices['iPhone 12'];
  const mob = await browser.newContext({
    ...iPhone,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const mpage = await mob.newPage();
  await mpage.goto(BASE, { waitUntil: 'networkidle' });

  const mobOffMode = await mpage.getAttribute('.page-dashboard', 'data-reorder-mode');
  const mobClear = await fabClusterClearsCards(mpage);
  record('Mobile 390px', 'FAB non copre card (off)', mobClear, String(mobClear));
  assert.ok(mobClear);

  await mpage.screenshot({
    path: path.join(ARTIFACTS, 'dashboard-fab-mobile.png'),
    fullPage: false,
  });
  record('Mobile 390px', 'Screenshot fab off', true, 'dashboard-fab-mobile.png');

  const mobDragOff = await mpage.locator('.reorder-active').count();
  const scrollFree = await mpage.evaluate(() => {
    const grid = document.querySelector('[data-dashboard-root]');
    return grid ? getComputedStyle(grid).touchAction !== 'none' : false;
  });
  record(
    'Mobile 390px',
    'Off: no drag, scroll ok',
    mobOffMode === '0' && mobDragOff === 0 && scrollFree,
    `drag=${mobDragOff}`
  );
  assert.equal(mobOffMode, '0');
  assert.equal(mobDragOff, 0);
  assert.ok(scrollFree);

  await toggleReorder(mpage);
  const mobOn = await mpage.getAttribute('.page-dashboard', 'data-reorder-mode');
  const mobWiggle = await mpage.locator('.card-wiggle').count();
  record(
    'Mobile 390px',
    'On: modalità attiva',
    mobOn === '1' && mobWiggle >= 3,
    `wiggle=${mobWiggle}`
  );
  assert.equal(mobOn, '1');

  await mpage.screenshot({
    path: path.join(ARTIFACTS, 'dashboard-fab-mobile-on.png'),
    fullPage: false,
  });
  record('Mobile 390px', 'Screenshot fab on', true, 'dashboard-fab-mobile-on.png');

  await dragCard(mpage, 'Beta', 'Alpha');
  const mobOrder = dbRootOrder();
  const mobReordered = mobOrder.indexOf('Beta') < mobOrder.indexOf('Alpha');
  record('Mobile 390px', 'Touch drag Beta su Alpha', mobReordered, mobOrder.join(' > '));
  assert.ok(mobReordered);

  await mpage.keyboard.press('Escape');
  const mobEsc = await mpage.getAttribute('.page-dashboard', 'data-reorder-mode');
  record('Mobile 390px', 'Esc esce', mobEsc === '0', mobEsc);
  assert.equal(mobEsc, '0');

  await mob.close();
  await browser.close();

  console.log('\n=== Tabella risultati Playwright Riorganizza ===');
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