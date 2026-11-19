import { getDb } from '../db.js';
import { hostOctet, ipInCidr } from './private-ip.js';

export function listSubnets() {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM subnets ORDER BY sort_order ASC, id ASC`
    )
    .all();
}

export function getAssetSummary() {
  const db = getDb();
  const assetsActive = db
    .prepare(`SELECT COUNT(*) AS c FROM assets WHERE status = 'active'`)
    .get().c;
  const byCategory = db
    .prepare(
      `SELECT category, COUNT(*) AS c FROM assets WHERE status='active' AND category IS NOT NULL GROUP BY category ORDER BY c DESC`
    )
    .all();
  const byLocation = db
    .prepare(
      `SELECT location, COUNT(*) AS c FROM assets WHERE status='active' AND location IS NOT NULL GROUP BY location ORDER BY c DESC LIMIT 8`
    )
    .all();
  const pendingDiscovery = db
    .prepare(`SELECT COUNT(*) AS c FROM discovery_queue WHERE status='pending'`)
    .get().c;
  const lastScan = db
    .prepare(
      `SELECT id, status, target, profile, finished_at, started_at FROM scan_jobs ORDER BY id DESC LIMIT 1`
    )
    .get();
  const undeclared = db
    .prepare(
      `SELECT COUNT(DISTINCT o.ip_id || '-' || o.port) AS c
       FROM observed_services o
       LEFT JOIN declared_services d ON d.ip_id = o.ip_id AND d.port = o.port AND d.protocol = o.protocol
       WHERE d.id IS NULL AND o.state IN ('open','open|filtered')`
    )
    .get().c;
  const missingExpected = db
    .prepare(
      `SELECT COUNT(*) AS c FROM declared_services d
       WHERE d.ip_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM observed_services o
           WHERE o.ip_id = d.ip_id AND o.port = d.port AND o.state LIKE 'open%'
         )`
    )
    .get().c;

  return {
    assetsActive,
    byCategory,
    byLocation,
    pendingDiscovery,
    lastScan: lastScan || null,
    portDrift: { undeclared, missingExpected },
  };
}

export function subnetIpGrid(subnetId) {
  const db = getDb();
  const subnet = db.prepare('SELECT * FROM subnets WHERE id = ?').get(subnetId);
  if (!subnet || !subnet.cidr || subnet.is_non_ip) {
    return { subnet, cells: [] };
  }
  const ips = db
    .prepare(
      `SELECT i.*, a.id AS asset_id, a.name AS asset_name, a.asset_code
       FROM ip_addresses i
       LEFT JOIN asset_ip_assignments aia ON aia.ip_id = i.id
       LEFT JOIN assets a ON a.id = aia.asset_id AND a.status = 'active'
       WHERE i.subnet_id = ?
       ORDER BY i.address`
    )
    .all(subnetId);

  const byOctet = new Map();
  for (const row of ips) {
    byOctet.set(hostOctet(row.address), row);
  }

  const cells = [];
  for (let h = 1; h <= 254; h++) {
    const addr = `${subnet.cidr.split('/')[0].split('.').slice(0, 3).join('.')}.${h}`;
    const row = byOctet.get(h) || null;
    let state = 'free';
    if (row) {
      state = row.asset_id ? 'assigned' : row.allocation === 'dhcp' ? 'dhcp' : 'reserved';
    }
    cells.push({
      host: h,
      address: addr,
      state,
      assetName: row?.asset_name || null,
      assetCode: row?.asset_code || null,
      ipId: row?.id || null,
    });
  }
  return { subnet, cells };
}

export function listAssets({ q = '', subnetId = null, status = 'active' } = {}) {
  const db = getDb();
  let sql = `
    SELECT a.*, s.family_label AS subnet_label,
      (SELECT GROUP_CONCAT(i.address, ', ') FROM asset_ip_assignments aia
        JOIN ip_addresses i ON i.id = aia.ip_id WHERE aia.asset_id = a.id) AS ip_list
    FROM assets a
    LEFT JOIN subnets s ON s.id = a.primary_subnet_id
    WHERE a.status = ?
  `;
  const params = [status];
  if (subnetId) {
    sql += ` AND a.primary_subnet_id = ?`;
    params.push(subnetId);
  }
  if (q) {
    sql += ` AND (a.name LIKE ? OR a.hostname LIKE ? OR a.location LIKE ? OR CAST(a.asset_code AS TEXT) LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += ` ORDER BY a.asset_code IS NULL, a.asset_code ASC, a.name ASC`;
  return db.prepare(sql).all(...params);
}

export function getAssetDetail(assetId) {
  const db = getDb();
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId);
  if (!asset) return null;
  const interfaces = db
    .prepare('SELECT * FROM asset_interfaces WHERE asset_id = ?')
    .all(assetId);
  const ips = db
    .prepare(
      `SELECT i.* FROM ip_addresses i
       JOIN asset_ip_assignments aia ON aia.ip_id = i.id
       WHERE aia.asset_id = ?`
    )
    .all(assetId);
  const fqdns = db
    .prepare(
      `SELECT DISTINCT f.* FROM fqdns f
       JOIN fqdn_ips fi ON fi.fqdn_id = f.id
       JOIN asset_ip_assignments aia ON aia.ip_id = fi.ip_id
       WHERE aia.asset_id = ?`
    )
    .all(assetId);
  const declared = db
    .prepare(
      `SELECT * FROM declared_services
       WHERE ip_id IN (SELECT ip_id FROM asset_ip_assignments WHERE asset_id = ?)
          OR fqdn_id IN (
            SELECT fi.fqdn_id FROM fqdn_ips fi
            JOIN asset_ip_assignments aia ON aia.ip_id = fi.ip_id
            WHERE aia.asset_id = ?
          )`
    )
    .all(assetId, assetId);
  const observed = db
    .prepare(
      `SELECT o.* FROM observed_services o
       WHERE o.ip_id IN (SELECT ip_id FROM asset_ip_assignments WHERE asset_id = ?)
       ORDER BY o.observed_at DESC LIMIT 100`
    )
    .all(assetId);
  const tags = db
    .prepare('SELECT tag FROM asset_tags WHERE asset_id = ?')
    .all(assetId)
    .map((r) => r.tag);
  return { asset, interfaces, ips, fqdns, declared, observed, tags };
}

export function listFqdns() {
  const db = getDb();
  return db
    .prepare(
      `SELECT f.id, f.fqdn, GROUP_CONCAT(i.address, ', ') AS ips
       FROM fqdns f
       LEFT JOIN fqdn_ips fi ON fi.fqdn_id = f.id
       LEFT JOIN ip_addresses i ON i.id = fi.ip_id
       GROUP BY f.id
       ORDER BY f.fqdn`
    )
    .all();
}

export function upsertAssetFromImport(row, subnetByCidr) {
  const db = getDb();
  const tx = db.transaction(() => {
    let assetId = null;
    if (row.asset_code) {
      const existing = db
        .prepare('SELECT id FROM assets WHERE asset_code = ?')
        .get(row.asset_code);
      if (existing) assetId = existing.id;
    }
    if (!assetId) {
      const r = db
        .prepare(
          `INSERT INTO assets (asset_code, name, location, notes, category, primary_subnet_id, status)
           VALUES (?, ?, ?, ?, ?, ?, 'active')`
        )
        .run(
          row.asset_code || null,
          row.name,
          row.location || null,
          row.notes || null,
          row.category || null,
          row.subnet_id || null
        );
      assetId = r.lastInsertRowid;
    } else {
      db.prepare(
        `UPDATE assets SET name=?, location=?, notes=?, category=?, primary_subnet_id=?, updated_at=datetime('now') WHERE id=?`
      ).run(
        row.name,
        row.location || null,
        row.notes || null,
        row.category || null,
        row.subnet_id || null,
        assetId
      );
    }
    if (row.mac) {
      const mac = row.mac;
      const iface = db.prepare('SELECT id FROM asset_interfaces WHERE mac_address = ?').get(mac);
      if (iface) {
        db.prepare('UPDATE asset_interfaces SET asset_id=? WHERE id=?').run(assetId, iface.id);
      } else {
        db.prepare(
          `INSERT INTO asset_interfaces (asset_id, mac_address, iface_type) VALUES (?, ?, ?)`
        ).run(assetId, mac, row.iface_type || 'eth');
      }
    }
    if (row.ieee) {
      const ieee = row.ieee;
      const iface = db
        .prepare('SELECT id FROM asset_interfaces WHERE ieee_address = ?')
        .get(ieee);
      if (!iface) {
        db.prepare(
          `INSERT INTO asset_interfaces (asset_id, ieee_address, iface_type, label) VALUES (?, ?, 'zigbee', ?)`
        ).run(assetId, ieee, row.zigbee_model || null);
      }
    }
    if (row.ip) {
      const subnetId = resolveSubnetIdForIp(row.ip) || row.subnet_id || null;
      db.prepare(
        `INSERT INTO ip_addresses (address, subnet_id, allocation) VALUES (?, ?, 'static')
         ON CONFLICT(address) DO UPDATE SET subnet_id=excluded.subnet_id`
      ).run(row.ip, subnetId);
      const ipId = db.prepare('SELECT id FROM ip_addresses WHERE address=?').get(row.ip).id;
      db.prepare(
        `INSERT OR IGNORE INTO asset_ip_assignments (asset_id, ip_id) VALUES (?, ?)`
      ).run(assetId, ipId);
    }
    if (row.fqdn && row.ip) {
      db.prepare(`INSERT INTO fqdns (fqdn) VALUES (?) ON CONFLICT(fqdn) DO NOTHING`).run(row.fqdn);
      const fqdnId = db.prepare('SELECT id FROM fqdns WHERE fqdn=?').get(row.fqdn).id;
      const ipId = db.prepare('SELECT id FROM ip_addresses WHERE address=?').get(row.ip)?.id;
      if (ipId) {
        db.prepare(`INSERT OR IGNORE INTO fqdn_ips (fqdn_id, ip_id) VALUES (?, ?)`).run(fqdnId, ipId);
      }
    }
    return assetId;
  });
  return tx();
}

export function resolveSubnetIdForIp(ip) {
  const db = getDb();
  const subnets = db.prepare('SELECT id, cidr FROM subnets WHERE cidr IS NOT NULL').all();
  for (const s of subnets) {
    if (ipInCidr(ip, s.cidr)) return s.id;
  }
  return null;
}