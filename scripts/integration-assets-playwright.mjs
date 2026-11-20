#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium, devices } from 'playwright';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = '/opt/cursor/artifacts';
const FIXTURE = path.join(root, 'scripts/fixtures/synth-assets.xlsx');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!fs.existsSync(FIXTURE)) {
    execFileSync('node', ['scripts/fixtures/create-synth-xlsx.mjs'], { cwd: root, stdio: 'inherit' });
  }

  const tmp = path.join(root, 'data', 'test-e2e-assets');
  fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const dbPath = path.join(tmp, 'intranet.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  execFileSync('node', ['scripts/seed-synth-assets.mjs', dbPath], {
    cwd: root,
    stdio: 'inherit',
  });

  const MOCK_PORT = await new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
    s.on('error', rej);
  });
  const mockChild = spawn(process.execPath, ['scripts/fixtures/mercusys-halo-mock.mjs', String(MOCK_PORT)], {
    cwd: root,
    stdio: 'ignore',
  });
  await sleep(300);

  const PORT = await new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
    s.on('error', rej);
  });

  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  const child = spawn('npm', ['run', 'start'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: `file:${path.resolve(dbPath)}`,
      MERCUSYS_URL: `http://127.0.0.1:${MOCK_PORT}`,
      MERCUSYS_PASSWORD: 'synth-test',
    },
    stdio: 'ignore',
  });

  const BASE = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {
      await sleep(400);
    }
  }

  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(`${BASE}/admin/assets`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-assets-tab]').waitFor();
  await page.waitForResponse((r) => r.url().includes('/api/assets/summary') && r.ok(), {
    timeout: 20000,
  });
  await page.locator('.assets-stat-value').first().waitFor({ timeout: 20000 });
  await page.screenshot({ path: path.join(ARTIFACTS, 'assets-summary-desktop.png'), fullPage: true });

  await page.locator('button.assets-tab', { hasText: 'Subnet' }).click();
  await page.waitForSelector('.ip-grid');
  const gridResp = page.waitForResponse((r) => r.url().includes('/subnets/5/grid'));
  await page.locator('.assets-field select').selectOption('5');
  await gridResp;
  await page.waitForFunction(
    () => document.querySelectorAll('.ip-cell-assigned').length >= 1,
    { timeout: 10000 }
  );
  await page.screenshot({ path: path.join(ARTIFACTS, 'assets-subnet-desktop.png'), fullPage: true });

  await page.locator('button.assets-tab', { hasText: 'Asset' }).click();
  await page.locator('.assets-table tbody tr').first().waitFor({ timeout: 10000 });
  const listBody = await page.locator('.assets-table tbody').innerText();
  assert.ok(!listBody.includes('Offline'), 'non deve mostrare etichetta Offline');
  assert.ok(listBody.includes('Mai rilevato') || listBody.includes('Online'), 'badge presenza rete');
  await page.screenshot({ path: path.join(ARTIFACTS, 'assets-list-desktop.png'), fullPage: true });
  await page.locator('.assets-table tbody tr').first().click();
  await page.waitForSelector('.assets-detail-card');
  await page.screenshot({ path: path.join(ARTIFACTS, 'assets-detail-desktop.png'), fullPage: true });

  await page.locator('button.assets-tab', { hasText: 'Coda' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ARTIFACTS, 'assets-discovery-desktop.png'), fullPage: true });

  await page.locator('button.assets-tab', { hasText: 'Import / Export' }).click();
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('.assets-import label').first().click(),
  ]);
  await fileChooser.setFiles(FIXTURE);
  await page.locator('[data-testid="import-preview"]').waitFor({ timeout: 15000 });
  const previewText = await page.locator('[data-testid="import-preview"]').innerText();
  assert.match(
    previewText,
    /Asset in anteprima:\s+[1-9]/,
    'anteprima import deve contare asset sintetici'
  );
  await page.screenshot({ path: path.join(ARTIFACTS, 'assets-import-preview-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Conferma import' }).click();
  await page.waitForSelector('[data-testid="import-result"]', { timeout: 20000 });
  await page.locator('.assets-msg', { hasText: 'Import completato' }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(ARTIFACTS, 'assets-import-success-desktop.png'), fullPage: true });

  await page.locator('button.assets-tab', { hasText: 'Asset' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.assets-table tbody tr').length >= 3,
    { timeout: 15000 }
  );
  await page.screenshot({ path: path.join(ARTIFACTS, 'assets-list-after-import-desktop.png'), fullPage: true });

  await page.locator('button.assets-tab', { hasText: 'Host' }).click();
  await page.waitForSelector('[data-testid="hosts-tab"]', { timeout: 15000 });
  await page.screenshot({ path: path.join(ARTIFACTS, 'assets-hosts-list-desktop.png'), fullPage: true });
  await page.locator('a', { hasText: 'Dettaglio host' }).first().click();
  await page.waitForSelector('[data-testid="host-view-detail"]', { timeout: 15000 });
  await page.screenshot({ path: path.join(ARTIFACTS, 'assets-host-detail-desktop.png'), fullPage: true });
  await page.goto(`${BASE}/admin/assets`, { waitUntil: 'domcontentloaded' });

  await page.locator('button.assets-tab', { hasText: 'Router Mercusys' }).click();
  await page.waitForSelector('[data-testid="mercusys-tab"]');
  await page.screenshot({ path: path.join(ARTIFACTS, 'assets-mercusys-settings-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Importa client dal router' }).click();
  await page.waitForSelector('.assets-msg', { hasText: /(Importati|in coda|aggiornati|coda)/i }, { timeout: 20000 });
  await page.screenshot({
    path: path.join(ARTIFACTS, 'assets-mercusys-import-desktop.png'),
    fullPage: true,
  });

  await page.locator('button.assets-tab', { hasText: 'Coda' }).click();
  await page.waitForSelector('.assets-discovery', { timeout: 10000 });
  const createBtn = page.locator('[data-testid="discovery-create"]').first();
  await createBtn.waitFor({ timeout: 15000 });
  await createBtn.click();
  await page.waitForSelector('.assets-detail-card', { timeout: 20000 });
  await page.locator('.assets-table tbody tr', { hasText: '10.0.5' }).first().waitFor({ timeout: 15000 });
  await page.screenshot({
    path: path.join(ARTIFACTS, 'assets-discovery-approve-desktop.png'),
    fullPage: true,
  });

  const mob = await browser.newContext({
    ...devices['iPhone 12'],
    viewport: { width: 390, height: 844 },
  });
  const mpage = await mob.newPage();
  await mpage.goto(`${BASE}/admin/assets`, { waitUntil: 'networkidle' });
  await mpage.screenshot({ path: path.join(ARTIFACTS, 'assets-mobile.png'), fullPage: true });
  await mpage.locator('button.assets-tab', { hasText: 'Host' }).click();
  await mpage.waitForSelector('[data-testid="hosts-tab"]', { timeout: 15000 });
  await mpage.screenshot({ path: path.join(ARTIFACTS, 'assets-hosts-mobile.png'), fullPage: true });

  await browser.close();
  child.kill('SIGTERM');
  mockChild.kill('SIGTERM');
  console.log('integration-assets-playwright: OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});