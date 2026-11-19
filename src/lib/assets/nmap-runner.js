import { spawn } from 'node:child_process';
import { getDb } from '../db.js';
import { assertScanTargetAllowed, isPrivateIPv4 } from './private-ip.js';
import { resolveSubnetIdForIp } from './repository.js';
import { normalizeMac } from './mac.js';
import dns from 'node:dns/promises';

const MAX_CONCURRENT = 1;
let running = 0;
const queue = [];

async function resolveTargetHost(target) {
  const t = target.trim();
  if (/^\d+\.\d+\.\d+\.\d+(\/\d+)?$/.test(t)) return t;
  if (t.includes('/')) return t;
  const addrs = await dns.resolve4(t).catch(() => []);
  if (addrs.length === 0) throw new Error('FQDN senza record A');
  for (const a of addrs) {
    if (!isPrivateIPv4(a)) {
      throw new Error('FQDN risolve a IP non privato: scan rifiutato');
    }
  }
  return addrs[0];
}

function parseGrepable(stdout, jobId, observedAt) {
  const db = getDb();
  const insObs = db.prepare(`
    INSERT INTO observed_services
    (scan_job_id, ip_id, address, observed_at, protocol, port, state, service_name, service_version)
    VALUES (?, ?, ?, ?, 'tcp', ?, ?, ?, ?)
  `);
  const upsertIp = db.prepare(`
    INSERT INTO ip_addresses (address, subnet_id, last_seen_at, allocation)
    VALUES (?, ?, ?, 'unknown')
    ON CONFLICT(address) DO UPDATE SET last_seen_at=excluded.last_seen_at
  `);
  const getIp = db.prepare('SELECT id FROM ip_addresses WHERE address=?');
  const queueNew = db.prepare(`
    INSERT INTO discovery_queue (ip_address, hostname, first_seen_at, last_seen_at, scan_job_id, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);

  const lines = stdout.split('\n');
  for (const line of lines) {
    if (!line.startsWith('Host:')) continue;
    const ip = line.match(/Host:\s+(\d+\.\d+\.\d+\.\d+)/)?.[1];
    if (!ip) continue;
    const subnetId = resolveSubnetIdForIp(ip);
    upsertIp.run(ip, subnetId, observedAt);
    const ipId = getIp.get(ip).id;
    const known = db
      .prepare('SELECT 1 FROM asset_ip_assignments WHERE ip_id=? LIMIT 1')
      .get(ipId);
    if (!known) {
      queueNew.run(ip, null, observedAt, observedAt, jobId);
    }
    const portsSection = line.split('Ports:')[1] || '';
    const portRe = /(\d+)\/open\/tcp(?:\/\/([^/]*))?(?:\/\/([^/]*))?/g;
    let m;
    while ((m = portRe.exec(portsSection))) {
      const port = parseInt(m[1], 10);
      const svc = m[2] || null;
      const ver = m[3] || null;
      insObs.run(jobId, ipId, ip, observedAt, port, 'open', svc, ver);
    }
  }
}

function runNmap(target, profile) {
  return new Promise((resolve, reject) => {
    const args =
      profile === 'full'
        ? ['-sT', '-T3', '-p-', '-oG', '-', target]
        : ['-sT', '-T4', '--top-ports', '200', '-oG', '-', target];
    const proc = spawn('nmap', args);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => {
      out += d.toString();
    });
    proc.stderr.on('data', (d) => {
      err += d.toString();
    });
    proc.on('error', (e) => {
      if (e.code === 'ENOENT') reject(new Error('nmap non installato nel container'));
      else reject(e);
    });
    proc.on('close', (code) => {
      if (code !== 0 && !out) reject(new Error(err || `nmap exit ${code}`));
      else resolve(out);
    });
  });
}

export function enqueueScan({ jobType, target, profile = 'quick' }) {
  const db = getDb();
  const job = db
    .prepare(
      `INSERT INTO scan_jobs (job_type, target, profile, status) VALUES (?, ?, ?, 'queued')`
    )
    .run(jobType, target, profile);
  const jobId = job.lastInsertRowid;
  queue.push(jobId);
  pumpQueue();
  return jobId;
}

function pumpQueue() {
  if (running >= MAX_CONCURRENT) return;
  const jobId = queue.shift();
  if (!jobId) return;
  running += 1;
  executeJob(jobId)
    .catch((err) => {
      const db = getDb();
      db.prepare(
        `UPDATE scan_jobs SET status='failed', error=?, finished_at=datetime('now') WHERE id=?`
      ).run(err.message || String(err), jobId);
    })
    .finally(() => {
      running -= 1;
      pumpQueue();
    });
}

async function executeJob(jobId) {
  const db = getDb();
  const job = db.prepare('SELECT * FROM scan_jobs WHERE id=?').get(jobId);
  if (!job) return;
  db.prepare(
    `UPDATE scan_jobs SET status='running', started_at=datetime('now') WHERE id=?`
  ).run(jobId);
  let target = assertScanTargetAllowed(job.target);
  if (job.job_type === 'host' && !target.includes('/')) {
    target = await resolveTargetHost(target);
  }
  const observedAt = new Date().toISOString();
  const out = await runNmap(target, job.profile);
  const delOld = db.prepare('DELETE FROM observed_services WHERE scan_job_id=?');
  delOld.run(jobId);
  parseGrepable(out, jobId, observedAt);
  db.prepare(
    `UPDATE scan_jobs SET status='done', progress='100%', finished_at=datetime('now') WHERE id=?`
  ).run(jobId);
}

export function getScanJob(jobId) {
  const db = getDb();
  return db.prepare('SELECT * FROM scan_jobs WHERE id=?').get(jobId);
}

export function listScanJobs(limit = 20) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM scan_jobs ORDER BY id DESC LIMIT ?')
    .all(limit);
}