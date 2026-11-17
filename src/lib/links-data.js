import { getDb } from './db.js';

export function getVisibleLinks() {
  const db = getDb();
  return db
    .prepare(
      'SELECT * FROM links WHERE visible = 1 ORDER BY sort_order ASC, created_at DESC'
    )
    .all();
}

export function getAllLinks() {
  const db = getDb();
  return db
    .prepare('SELECT * FROM links ORDER BY sort_order ASC, created_at DESC')
    .all();
}

export function getNetworkHostsReport() {
  const db = getDb();
  const links = db.prepare('SELECT url FROM links WHERE url IS NOT NULL AND url != ?').all('');

  const hostsMap = {};

  for (const { url } of links) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
      if (!hostsMap[host]) {
        hostsMap[host] = new Set();
      }
      hostsMap[host].add(port);
    } catch {
      /* skip */
    }
  }

  return Object.keys(hostsMap)
    .map((host) => ({
      host,
      ports: Array.from(hostsMap[host]).sort(
        (a, b) => parseInt(a, 10) - parseInt(b, 10)
      ),
    }))
    .sort((a, b) => a.host.localeCompare(b.host));
}