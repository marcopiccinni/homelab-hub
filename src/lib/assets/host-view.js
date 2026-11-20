import dns from 'node:dns/promises';
import { getDb } from '../db.js';
import { enqueueScan } from './nmap-runner.js';
import { isPrivateIPv4 } from './private-ip.js';

const IP_RE = /^\d+\.\d+\.\d+\.\d+$/;

function parseUrlEndpoint(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname;
    const port = parseInt(u.port || (u.protocol === 'https:' ? '443' : '80'), 10);
    return { host, port, protocol: 'tcp', url: raw };
  } catch {
    return null;
  }
}

function hostMatchesAsset(host, ips, fqdnSet) {
  const h = host.toLowerCase();
  if (IP_RE.test(host) && ips.includes(host)) return true;
  if (fqdnSet.has(h)) return true;
  return false;
}

function collectAssetEndpoints(assetId) {
  const db = getDb();
  const ips = db
    .prepare(
      `SELECT i.id, i.address FROM ip_addresses i
       JOIN asset_ip_assignments aia ON aia.ip_id = i.id
       WHERE aia.asset_id = ?`
    )
    .all(assetId);
  const fqdns = db
    .prepare(
      `SELECT DISTINCT f.id, f.fqdn FROM fqdns f
       JOIN fqdn_ips fi ON fi.fqdn_id = f.id
       JOIN asset_ip_assignments aia ON aia.ip_id = fi.ip_id
       WHERE aia.asset_id = ?`
    )
    .all(assetId);
  const fqdnSet = new Set(fqdns.map((f) => f.fqdn.toLowerCase()));
  return {
    ips,
    ipAddresses: ips.map((r) => r.address),
    ipIds: ips.map((r) => r.id),
    fqdns,
    fqdnSet,
  };
}

function latestObservedByKey(observed) {
  const best = new Map();
  for (const o of observed) {
    const key = `${o.protocol || 'tcp'}:${o.port}`;
    const prev = best.get(key);
    if (!prev || String(o.observed_at) > String(prev.observed_at)) best.set(key, o);
  }
  return best;
}

function mergeHostPortRows(assetId) {
  const db = getDb();
  const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND status = ?').get(assetId, 'active');
  if (!asset) return null;

  const { ips, ipAddresses, ipIds, fqdns, fqdnSet } = collectAssetEndpoints(assetId);
  if (!ipIds.length && !fqdns.length) {
    return { asset, endpoints: { ips, fqdns }, rows: [], counts: { open: 0, undocumented: 0 } };
  }

  const placeholders = ipIds.map(() => '?').join(',') || '0';
  const declared = db
    .prepare(
      `SELECT * FROM declared_services
       WHERE ip_id IN (${placeholders})
          OR fqdn_id IN (
            SELECT fi.fqdn_id FROM fqdn_ips fi
            WHERE fi.ip_id IN (${placeholders})
          )`
    )
    .all(...ipIds, ...ipIds);

  const observed = db
    .prepare(
      `SELECT o.* FROM observed_services o
       WHERE o.ip_id IN (${placeholders})
         AND o.state LIKE 'open%'
       ORDER BY o.observed_at DESC`
    )
    .all(...ipIds);
  const obsMap = latestObservedByKey(observed);

  const links = db
    .prepare(`SELECT id, title, url, url_external, url_local_fqdn, url_ip FROM links WHERE is_folder=0`)
    .all();

  const rows = new Map();

  const ensure = (protocol, port) => {
    const key = `${protocol}:${port}`;
    if (!rows.has(key)) {
      rows.set(key, {
        port,
        protocol,
        ips: new Set(),
        fqdns: new Set(),
        sources: new Set(),
        declared: null,
        observed: null,
        links: [],
        status: 'missing',
      });
    }
    return rows.get(key);
  };

  for (const d of declared) {
    const row = ensure(d.protocol || 'tcp', d.port);
    row.sources.add('declared');
    row.declared = d;
    if (d.ip_id) {
      const ip = ips.find((i) => i.id === d.ip_id);
      if (ip) row.ips.add(ip.address);
    }
    if (d.fqdn_id) {
      const f = fqdns.find((x) => x.id === d.fqdn_id) || db.prepare('SELECT fqdn FROM fqdns WHERE id=?').get(d.fqdn_id);
      if (f?.fqdn) row.fqdns.add(f.fqdn);
    }
    if (d.link_id) {
      const link = links.find((l) => l.id === d.link_id);
      if (link) row.links.push({ id: link.id, title: link.title, urlField: 'declared' });
    }
  }

  for (const [key, o] of obsMap) {
    const row = ensure(o.protocol || 'tcp', o.port);
    row.sources.add('nmap');
    row.observed = o;
    if (o.address) row.ips.add(o.address);
  }

  for (const link of links) {
    for (const field of ['url', 'url_external', 'url_local_fqdn', 'url_ip']) {
      const ep = parseUrlEndpoint(link[field]);
      if (!ep) continue;
      if (!hostMatchesAsset(ep.host, ipAddresses, fqdnSet)) continue;
      const row = ensure(ep.protocol, ep.port);
      row.sources.add('link');
      if (IP_RE.test(ep.host)) row.ips.add(ep.host);
      else row.fqdns.add(ep.host);
      if (!row.links.some((l) => l.id === link.id && l.urlField === field)) {
        row.links.push({ id: link.id, title: link.title, url: ep.url, urlField: field });
      }
    }
  }

  for (const row of rows.values()) {
    const hasObs = Boolean(row.observed);
    const hasDecl = Boolean(row.declared) || row.sources.has('link');
    if (hasObs && hasDecl) row.status = 'ok';
    else if (hasObs) row.status = 'undeclared';
    else if (hasDecl) row.status = 'missing';
    else row.status = 'undeclared';
  }

  const list = [...rows.values()]
    .sort((a, b) => a.port - b.port)
    .map((r) => ({
      port: r.port,
      protocol: r.protocol,
      ips: [...r.ips].sort(),
      fqdns: [...r.fqdns].sort(),
      sources: [...r.sources].sort(),
      sourceLabel: [...r.sources]
        .map((s) => (s === 'nmap' ? 'nmap' : s === 'declared' ? 'dichiarata' : 'link'))
        .join(', '),
      status: r.status,
      statusLabel:
        r.status === 'ok'
          ? 'Allineata'
          : r.status === 'undeclared'
            ? 'Non documentata'
            : 'Attesa assente',
      declared: r.declared,
      observed: r.observed,
      links: r.links,
      observedId: r.observed?.id ?? null,
    }));

  const open = list.filter((r) => r.observed).length;
  const undocumented = list.filter((r) => r.status === 'undeclared').length;

  return {
    asset,
    endpoints: { ips, fqdns },
    rows: list,
    counts: { open, undocumented, total: list.length },
  };
}

export function getHostView(assetId) {
  return mergeHostPortRows(assetId);
}

export function listHostsSummary({ subnetId = null, q = '' } = {}) {
  const db = getDb();
  let sql = `
    SELECT DISTINCT a.id, a.asset_code, a.name, a.category, a.primary_subnet_id,
      (SELECT GROUP_CONCAT(i.address, ', ')
       FROM asset_ip_assignments aia JOIN ip_addresses i ON i.id = aia.ip_id
       WHERE aia.asset_id = a.id) AS ip_list
    FROM assets a
    JOIN asset_ip_assignments aia ON aia.asset_id = a.id
    JOIN ip_addresses i ON i.id = aia.ip_id
    WHERE a.status = 'active'
  `;
  const params = [];
  if (subnetId) {
    sql += ' AND i.subnet_id = ?';
    params.push(subnetId);
  }
  if (q) {
    sql += ` AND (a.name LIKE ? OR CAST(a.asset_code AS TEXT) LIKE ? OR i.address LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY a.name COLLATE NOCASE ASC';
  const assets = db.prepare(sql).all(...params);

  return assets.map((a) => {
    const view = mergeHostPortRows(a.id);
    return {
      id: a.id,
      asset_code: a.asset_code,
      name: a.name,
      category: a.category,
      ip_list: a.ip_list,
      open_ports: view?.counts.open ?? 0,
      undocumented_ports: view?.counts.undocumented ?? 0,
      total_ports: view?.counts.total ?? 0,
    };
  });
}

export async function suggestHostAssociations() {
  const db = getDb();
  const suggestions = [];

  const assetIps = new Set(
    db.prepare('SELECT address FROM ip_addresses').all().map((r) => r.address)
  );
  const assignedFqdns = new Set(
    db
      .prepare(
        `SELECT DISTINCT f.fqdn FROM fqdns f
         JOIN fqdn_ips fi ON fi.fqdn_id = f.id
         JOIN asset_ip_assignments aia ON aia.ip_id = fi.ip_id`
      )
      .all()
      .map((r) => r.fqdn.toLowerCase())
  );

  const links = db
    .prepare(`SELECT id, title, url, url_external, url_local_fqdn, url_ip FROM links WHERE is_folder=0`)
    .all();

  for (const link of links) {
    for (const field of ['url', 'url_external', 'url_local_fqdn', 'url_ip']) {
      const ep = parseUrlEndpoint(link[field]);
      if (!ep) continue;
      if (IP_RE.test(ep.host)) {
        if (assetIps.has(ep.host)) continue;
        const asset = db
          .prepare(
            `SELECT a.id, a.name FROM assets a
             JOIN asset_ip_assignments aia ON aia.asset_id = a.id
             JOIN ip_addresses i ON i.id = aia.ip_id
             WHERE i.address = ?`
          )
          .get(ep.host);
        if (asset) continue;
        suggestions.push({
          kind: 'link',
          link_id: link.id,
          title: link.title,
          field,
          host: ep.host,
          port: ep.port,
          reason: 'IP non assegnata ad alcun asset',
        });
        continue;
      }
      const h = ep.host.toLowerCase();
      if (assignedFqdns.has(h)) continue;
      let resolved = [];
      try {
        resolved = await dns.resolve4(ep.host);
      } catch {
        resolved = [];
      }
      const priv = resolved.filter((a) => isPrivateIPv4(a));
      let suggestedAsset = null;
      for (const addr of priv) {
        suggestedAsset = db
          .prepare(
            `SELECT a.id, a.name FROM assets a
             JOIN asset_ip_assignments aia ON aia.asset_id = a.id
             JOIN ip_addresses i ON i.id = aia.ip_id
             WHERE i.address = ? LIMIT 1`
          )
          .get(addr);
        if (suggestedAsset) break;
      }
      suggestions.push({
        kind: 'link',
        link_id: link.id,
        title: link.title,
        field,
        host: ep.host,
        port: ep.port,
        resolved_ips: priv,
        suggested_asset_id: suggestedAsset?.id ?? null,
        suggested_asset_name: suggestedAsset?.name ?? null,
        reason: suggestedAsset
          ? `DNS → ${priv.join(', ')} (asset ${suggestedAsset.name})`
          : priv.length
            ? `DNS → ${priv.join(', ')} (nessun asset con questi IP)`
            : 'FQDN senza record A privato',
      });
    }
  }

  const orphanFqdns = db
    .prepare(
      `SELECT f.id, f.fqdn FROM fqdns f
       WHERE NOT EXISTS (
         SELECT 1 FROM fqdn_ips fi
         JOIN asset_ip_assignments aia ON aia.ip_id = fi.ip_id
         WHERE fi.fqdn_id = f.id
       )`
    )
    .all();

  for (const f of orphanFqdns) {
    let resolved = [];
    try {
      resolved = await dns.resolve4(f.fqdn);
    } catch {
      /* ignore */
    }
    const priv = resolved.filter((a) => isPrivateIPv4(a));
    let suggestedAsset = null;
    for (const addr of priv) {
      suggestedAsset = db
        .prepare(
          `SELECT a.id, a.name FROM assets a
           JOIN asset_ip_assignments aia ON aia.asset_id = a.id
           JOIN ip_addresses i ON i.id = aia.ip_id
           WHERE i.address = ? LIMIT 1`
        )
        .get(addr);
      if (suggestedAsset) break;
    }
    if (suggestedAsset || priv.length) {
      suggestions.push({
        kind: 'fqdn',
        fqdn_id: f.id,
        host: f.fqdn,
        resolved_ips: priv,
        suggested_asset_id: suggestedAsset?.id ?? null,
        suggested_asset_name: suggestedAsset?.name ?? null,
        reason: suggestedAsset
          ? `FQDN orfano, DNS → ${priv.join(', ')}`
          : `FQDN orfano, DNS → ${priv.join(', ')}`,
      });
    }
  }

  return suggestions.slice(0, 40);
}

export function enqueueHostScan(assetId, profile = 'quick') {
  const view = mergeHostPortRows(assetId);
  if (!view?.endpoints?.ips?.length) {
    throw new Error('Asset senza IP assegnati');
  }
  const targets = view.endpoints.ips.map((i) => i.address);
  const ids = [];
  for (const target of targets) {
    ids.push(enqueueScan({ jobType: 'host', target, profile }));
  }
  return { jobIds: ids, targets };
}