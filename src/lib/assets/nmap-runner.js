import { spawn, execFileSync } from 'node:child_process';
import { getDb } from '../db.js';
import { assertScanTargetAllowed, isPrivateIPv4 } from './private-ip.js';
import { resolveSubnetIdForIp } from './repository.js';
import { normalizeMac } from './mac.js';
import { touchAssetPresence, touchAssetPresenceAt } from './asset-touch.js';
import { assignIp } from './crud.js';
import dns from 'node:dns/promises';

const MAX_CONCURRENT = 1;
const STALE_MS = Math.max(
  60_000,
  parseInt(process.env.SCAN_STALE_MS || '900000', 10) || 900_000
);

let running = 0;
const queue = [];
const activeProcs = new Map();
let workerBootstrapped = false;
let staleTimer = null;
let nmapAvailableCache = null;

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

function touchJobProgress(db, jobId, progress, detail = null) {
  const text = detail ? `${progress || ''}${progress ? ' — ' : ''}${detail}` : progress;
  db.prepare(
    `UPDATE scan_jobs SET progress=?, updated_at=datetime('now') WHERE id=?`
  ).run(text, jobId);
}

function touchAssetLastSeenForIp(db, ipId, observedAt) {
  const rows = db
    .prepare(`SELECT asset_id FROM asset_ip_assignments WHERE ip_id=?`)
    .all(ipId);
  for (const r of rows) {
    touchAssetPresenceAt(db, r.asset_id, 'scan', observedAt);
  }
}

function syncArpMacs(jobId) {
  const db = getDb();
  let text = '';
  try {
    text = execFileSync('ip', ['neigh', 'show'], { encoding: 'utf8', timeout: 5000 });
  } catch {
    try {
      text = execFileSync('arp', ['-an'], { encoding: 'utf8', timeout: 5000 });
    } catch {
      return;
    }
  }
  const updateQueue = db.prepare(
    `UPDATE discovery_queue SET mac_address=? WHERE scan_job_id=? AND ip_address=? AND (mac_address IS NULL OR mac_address='')`
  );
  const findIface = db.prepare(
    `SELECT ai.asset_id, ai.id AS iface_id FROM asset_interfaces ai WHERE ai.mac_address=? LIMIT 1`
  );
  const getIp = db.prepare('SELECT id FROM ip_addresses WHERE address=?');
  for (const line of text.split('\n')) {
    const m =
      line.match(/(\d+\.\d+\.\d+\.\d+)\s+dev\s+\S+\s+lladdr\s+([0-9a-f:]+)/i) ||
      line.match(/\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-f:]+)/i);
    if (!m) continue;
    const ip = m[1];
    const mac = normalizeMac(m[2]);
    if (!mac) continue;
    updateQueue.run(mac, jobId, ip);
    const ipRow = getIp.get(ip);
    if (!ipRow) continue;
    const hit = findIface.get(mac);
    if (hit?.asset_id) {
      assignIp(hit.asset_id, ip);
      touchAssetPresence(db, hit.asset_id, 'scan');
    }
  }
}

function parseNmapStats(stderrChunk) {
  const elapsed = stderrChunk.match(/Stats:\s+([\d:]+)\s+elapsed/)?.[1];
  const pct = stderrChunk.match(/About\s+([\d.]+)%\s+done/i)?.[1];
  const hosts = stderrChunk.match(/(\d+)\s+hosts?\s+completed/i)?.[1];
  const parts = [];
  if (elapsed) parts.push(`trascorso ${elapsed}`);
  if (pct) parts.push(`${pct}%`);
  if (hosts) parts.push(`${hosts} host`);
  return parts.length ? parts.join(' · ') : null;
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
    INSERT INTO discovery_queue (ip_address, mac_address, hostname, first_seen_at, last_seen_at, scan_job_id, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);

  const lines = stdout.split('\n');
  const hostLines = lines.filter((l) => l.startsWith('Host:'));
  let done = 0;
  for (const line of lines) {
    if (!line.startsWith('Host:')) continue;
    const ip = line.match(/Host:\s+(\d+\.\d+\.\d+\.\d+)/)?.[1];
    if (!ip) continue;
    const macRaw = line.match(/MAC:\s+([0-9A-F:]+)/i)?.[1];
    const macFromLine = macRaw ? normalizeMac(macRaw) : null;
    const subnetId = resolveSubnetIdForIp(ip);
    upsertIp.run(ip, subnetId, observedAt);
    const ipId = getIp.get(ip).id;
    touchAssetLastSeenForIp(db, ipId, observedAt);
    if (macFromLine) {
      db.prepare(
        `UPDATE discovery_queue SET mac_address=? WHERE scan_job_id=? AND ip_address=?`
      ).run(macFromLine, jobId, ip);
    }
    const known = db
      .prepare('SELECT 1 FROM asset_ip_assignments WHERE ip_id=? LIMIT 1')
      .get(ipId);
    if (!known) {
      queueNew.run(ip, macFromLine, null, observedAt, observedAt, jobId);
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
    done += 1;
    if (hostLines.length) {
      const pct = Math.min(99, Math.round((done / hostLines.length) * 100));
      touchJobProgress(db, jobId, `${pct}%`, `host ${done}/${hostLines.length}`);
    }
  }
}

function runNmap(target, profile, jobId) {
  return new Promise((resolve, reject) => {
    const args =
      profile === 'full'
        ? [
            '-sT',
            '-sV',
            '--version-light',
            '-T3',
            '-p-',
            '--stats-every',
            '5s',
            '-oG',
            '-',
            target,
          ]
        : ['-sT', '-T4', '--top-ports', '200', '--stats-every', '5s', '-oG', '-', target];
    const proc = spawn('nmap', args);
    activeProcs.set(jobId, proc);
  let out = '';
  let err = '';
    const db = getDb();
    proc.stdout.on('data', (d) => {
      out += d.toString();
    });
    proc.stderr.on('data', (d) => {
      const chunk = d.toString();
      err += chunk;
      const detail = parseNmapStats(chunk);
      if (detail) {
        touchJobProgress(db, jobId, 'in corso', detail);
      }
    });
    proc.on('error', (e) => {
      activeProcs.delete(jobId);
      if (e.code === 'ENOENT') reject(new Error('nmap non installato nel container'));
      else reject(e);
    });
    proc.on('close', (code) => {
      activeProcs.delete(jobId);
      if (code !== 0 && !out) reject(new Error(err.trim() || `nmap exit ${code}`));
      else resolve(out);
    });
  });
}

function markJobFailed(db, jobId, message, status = 'failed') {
  db.prepare(
    `UPDATE scan_jobs SET status=?, error=?, finished_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
  ).run(status, message, jobId);
}

export function bootstrapScanWorker() {
  if (workerBootstrapped) return;
  workerBootstrapped = true;
  const db = getDb();
  const staleRunning = db
    .prepare(`SELECT id FROM scan_jobs WHERE status='running'`)
    .all();
  for (const row of staleRunning) {
    markJobFailed(db, row.id, 'Interrotto al riavvio del servizio', 'stale');
  }
  const queued = db
    .prepare(`SELECT id FROM scan_jobs WHERE status='queued' ORDER BY id ASC`)
    .all();
  for (const row of queued) {
    if (!queue.includes(row.id)) queue.push(row.id);
  }
  pumpQueue();
  if (!staleTimer) {
    staleTimer = setInterval(() => checkStaleJobs(), 30_000);
    if (staleTimer.unref) staleTimer.unref();
  }
}

function checkStaleJobs() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, target, updated_at, started_at FROM scan_jobs WHERE status='running'`
    )
    .all();
  const now = Date.now();
  for (const row of rows) {
    const ref = row.updated_at || row.started_at;
    if (!ref) continue;
    const t = Date.parse(ref.replace(' ', 'T') + 'Z');
    if (Number.isFinite(t) && now - t > STALE_MS) {
      const proc = activeProcs.get(row.id);
      if (proc) {
        try {
          proc.kill('SIGTERM');
        } catch {
          /* ignore */
        }
        activeProcs.delete(row.id);
      }
      markJobFailed(
        db,
        row.id,
        `Nessun avanzamento per oltre ${Math.round(STALE_MS / 60000)} min (job bloccato)`,
        'stale'
      );
      running = Math.max(0, running - 1);
      pumpQueue();
    }
  }
}

function enqueueJobId(jobId) {
  if (!queue.includes(jobId)) queue.push(jobId);
  pumpQueue();
}

export function enqueueScan({ jobType, target, profile = 'quick' }) {
  bootstrapScanWorker();
  const db = getDb();
  const job = db
    .prepare(
      `INSERT INTO scan_jobs (job_type, target, profile, status, updated_at) VALUES (?, ?, ?, 'queued', datetime('now'))`
    )
    .run(jobType, target, profile);
  const jobId = job.lastInsertRowid;
  enqueueJobId(jobId);
  return jobId;
}

function pumpQueue() {
  if (running >= MAX_CONCURRENT) return;
  const jobId = queue.shift();
  if (!jobId) return;
  const db = getDb();
  const row = db.prepare('SELECT status FROM scan_jobs WHERE id=?').get(jobId);
  if (!row || row.status !== 'queued') {
    pumpQueue();
    return;
  }
  running += 1;
  executeJob(jobId)
    .catch((err) => {
      const db2 = getDb();
      markJobFailed(db2, jobId, err.message || String(err), 'failed');
    })
    .finally(() => {
      running -= 1;
      pumpQueue();
    });
}

async function executeJob(jobId) {
  const db = getDb();
  const job = db.prepare('SELECT * FROM scan_jobs WHERE id=?').get(jobId);
  if (!job || job.status === 'cancelled') return;
  db.prepare(
    `UPDATE scan_jobs SET status='running', started_at=datetime('now'), updated_at=datetime('now'), progress='avvio', error=NULL WHERE id=?`
  ).run(jobId);
  let target = assertScanTargetAllowed(job.target);
  if (job.job_type === 'host' && !target.includes('/')) {
    target = await resolveTargetHost(target);
  }
  const observedAt = new Date().toISOString();
  const cancelRow = () =>
    db.prepare('SELECT cancel_requested FROM scan_jobs WHERE id=?').get(jobId)?.cancel_requested;
  if (cancelRow()) {
    db.prepare(
      `UPDATE scan_jobs SET status='cancelled', finished_at=datetime('now'), updated_at=datetime('now'), error='Annullato dall''utente' WHERE id=?`
    ).run(jobId);
    return;
  }
  touchJobProgress(db, jobId, 'in corso', `target ${target}`);
  const out = await runNmap(target, job.profile, jobId);
  if (cancelRow()) {
    db.prepare(
      `UPDATE scan_jobs SET status='cancelled', finished_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
    ).run(jobId);
    return;
  }
  const delOld = db.prepare('DELETE FROM observed_services WHERE scan_job_id=?');
  delOld.run(jobId);
  parseGrepable(out, jobId, observedAt);
  syncArpMacs(jobId);
  db.prepare(
    `UPDATE scan_jobs SET status='done', progress='100%', finished_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
  ).run(jobId);
}

export function cancelScanJob(jobId) {
  bootstrapScanWorker();
  const db = getDb();
  const job = db.prepare('SELECT status FROM scan_jobs WHERE id=?').get(jobId);
  if (!job) throw new Error('Job non trovato');
  if (job.status === 'done' || job.status === 'cancelled') {
    return { ok: true, status: job.status };
  }
  db.prepare(
    `UPDATE scan_jobs SET cancel_requested=1, updated_at=datetime('now') WHERE id=?`
  ).run(jobId);
  const proc = activeProcs.get(jobId);
  if (proc) {
    proc.kill('SIGTERM');
    activeProcs.delete(jobId);
  }
  if (job.status === 'queued') {
    const idx = queue.indexOf(jobId);
    if (idx >= 0) queue.splice(idx, 1);
    db.prepare(
      `UPDATE scan_jobs SET status='cancelled', finished_at=datetime('now'), error='Annullato' WHERE id=?`
    ).run(jobId);
  }
  return { ok: true, status: 'cancelled' };
}

export function retryScanJob(jobId) {
  bootstrapScanWorker();
  const db = getDb();
  const job = db.prepare('SELECT * FROM scan_jobs WHERE id=?').get(jobId);
  if (!job) throw new Error('Job non trovato');
  if (job.status === 'running' || job.status === 'queued') {
    throw new Error('Job ancora attivo');
  }
  db.prepare(
    `UPDATE scan_jobs SET status='queued', progress=NULL, error=NULL, started_at=NULL, finished_at=NULL, cancel_requested=0, updated_at=datetime('now') WHERE id=?`
  ).run(jobId);
  enqueueJobId(jobId);
  return { ok: true, id: jobId, status: 'queued' };
}

export function getScanJob(jobId) {
  const db = getDb();
  return db.prepare('SELECT * FROM scan_jobs WHERE id=?').get(jobId);
}

export function listScanJobs(limit = 30) {
  bootstrapScanWorker();
  const db = getDb();
  return db
    .prepare('SELECT * FROM scan_jobs ORDER BY id DESC LIMIT ?')
    .all(limit);
}

function detectNmapAvailable() {
  if (nmapAvailableCache !== null) return nmapAvailableCache;
  try {
    execFileSync('which', ['nmap'], { encoding: 'utf8', stdio: 'pipe' });
    nmapAvailableCache = true;
  } catch {
    nmapAvailableCache = false;
  }
  return nmapAvailableCache;
}

export function getScanWorkerStatus() {
  bootstrapScanWorker();
  const db = getDb();
  const dbQueued = db
    .prepare(`SELECT COUNT(*) AS n FROM scan_jobs WHERE status='queued'`)
    .get().n;
  return {
    active: workerBootstrapped,
    nmapAvailable: detectNmapAvailable(),
    running,
    memoryQueue: queue.length,
    dbQueued,
    staleTimeoutMs: STALE_MS,
  };
}