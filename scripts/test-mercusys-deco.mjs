#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
    s.on('error', rej);
  });
}

const port = await freePort();
const mock = spawn(process.execPath, ['scripts/fixtures/mercusys-halo-mock.mjs', String(port)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});

await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('mock timeout')), 5000);
  mock.stdout.on('data', (d) => {
    if (String(d).includes('listening')) {
      clearTimeout(t);
      resolve();
    }
  });
  mock.on('error', reject);
});

process.env.MERCUSYS_URL = `http://127.0.0.1:${port}`;
process.env.MERCUSYS_PASSWORD = 'synth-test';
process.env.DATABASE_URL = `file:${path.join(root, 'data', 'test-mercusys-deco.db')}`;
delete process.env.MERCUSYS_MOCK;

const { fetchMercusysClients, mercusysMockEnabled } = await import('../src/lib/assets/mercusys.js');
assert.equal(mercusysMockEnabled(), false);

const result = await fetchMercusysClients();
assert.equal(result.ok, true, JSON.stringify(result));
assert.equal(result.firmware, 'deco_luci');
assert.ok(result.clients.length >= 2, 'clients');
assert.ok(result.clients.some((c) => c.ip === '10.0.5.10'));
const lanA = result.clients.find((c) => c.ip === '10.0.5.10');
assert.equal(lanA?.hostname, 'synth-lan-a');
assert.equal(lanA?.mac, '02:11:22:33:44:55');
assert.ok(lanA?.notes?.includes('mesh_host='));

mock.kill('SIGTERM');
console.log('test-mercusys-deco: OK');