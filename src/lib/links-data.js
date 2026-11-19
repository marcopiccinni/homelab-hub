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
  const links = db
    .prepare(
      `SELECT url, url_external, url_local_fqdn, url_ip FROM links
       WHERE is_folder = 0`
    )
    .all();

  const hostsMap = {};

  for (const row of links) {
    const urls = new Set();
    for (const f of ['url', 'url_external', 'url_local_fqdn', 'url_ip']) {
      if (row[f]) urls.add(row[f]);
    }
    for (const url of urls) {
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