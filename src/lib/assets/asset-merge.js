import { normalizeMac } from './mac.js';

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} assetId
 */
export function scoreAssetForCanonical(db, assetId) {
  const a = db.prepare('SELECT id, asset_code, name, created_at FROM assets WHERE id=?').get(assetId);
  if (!a) return -1;
  let score = 0;
  if (a.asset_code != null) score += 100;
  score += db.prepare('SELECT COUNT(*) AS n FROM asset_interfaces WHERE asset_id=?').get(assetId).n * 5;
  score += db
    .prepare('SELECT COUNT(*) AS n FROM asset_ip_assignments WHERE asset_id=?')
    .get(assetId).n * 3;
  score += db.prepare('SELECT COUNT(*) AS n FROM declared_services WHERE ip_id IN (SELECT ip_id FROM asset_ip_assignments WHERE asset_id=?)').get(assetId).n;
  score += Math.max(0, 1000 - assetId);
  return score;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} canonicalId
 * @param {number} duplicateId
 * @param {{ reason?: string, matchKey?: string }} meta
 */
export function mergeAssetInto(db, canonicalId, duplicateId, meta = {}) {
  if (canonicalId === duplicateId) return { merged: false };
  const canon = db.prepare(`SELECT id, status FROM assets WHERE id=?`).get(canonicalId);
  const dup = db.prepare(`SELECT id, status FROM assets WHERE id=?`).get(duplicateId);
  if (!canon || !dup || dup.status !== 'active') return { merged: false };
  if (canon.status !== 'active') {
    throw new Error(`Asset canonico ${canonicalId} non attivo`);
  }

  const reason = meta.reason || 'merge';
  const matchKey = meta.matchKey || null;

  db.prepare(
    `INSERT INTO asset_merge_log (canonical_asset_id, merged_asset_id, match_key, reason, detail, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    canonicalId,
    duplicateId,
    matchKey,
    reason,
    JSON.stringify({
      canonicalName: db.prepare('SELECT name FROM assets WHERE id=?').get(canonicalId)?.name,
      duplicateName: db.prepare('SELECT name FROM assets WHERE id=?').get(duplicateId)?.name,
    })
  );

  const interfaces = db
    .prepare(`SELECT * FROM asset_interfaces WHERE asset_id=?`)
    .all(duplicateId);
  for (const iface of interfaces) {
    const mac = iface.mac_address ? normalizeMac(iface.mac_address) : null;
    const ieee = iface.ieee_address || null;
    if (mac) {
      const taken = db
        .prepare(`SELECT id FROM asset_interfaces WHERE mac_address=? AND asset_id!=? LIMIT 1`)
        .get(mac, canonicalId);
      if (taken) {
        db.prepare(`DELETE FROM asset_interfaces WHERE id=?`).run(iface.id);
        continue;
      }
    }
    if (ieee) {
      const taken = db
        .prepare(`SELECT id FROM asset_interfaces WHERE ieee_address=? AND asset_id!=? LIMIT 1`)
        .get(ieee, canonicalId);
      if (taken) {
        db.prepare(`DELETE FROM asset_interfaces WHERE id=?`).run(iface.id);
        continue;
      }
    }
    db.prepare(`UPDATE asset_interfaces SET asset_id=? WHERE id=?`).run(canonicalId, iface.id);
  }

  const dupAssignments = db
    .prepare(`SELECT ip_id FROM asset_ip_assignments WHERE asset_id=?`)
    .all(duplicateId);
  for (const row of dupAssignments) {
    const onCanon = db
      .prepare(`SELECT 1 FROM asset_ip_assignments WHERE asset_id=? AND ip_id=?`)
      .get(canonicalId, row.ip_id);
    if (!onCanon) {
      const otherHolder = db
        .prepare(
          `SELECT asset_id FROM asset_ip_assignments WHERE ip_id=? AND asset_id NOT IN (?, ?) LIMIT 1`
        )
        .get(row.ip_id, canonicalId, duplicateId);
      if (otherHolder) {
        db.prepare(`DELETE FROM asset_ip_assignments WHERE asset_id=? AND ip_id=?`).run(
          duplicateId,
          row.ip_id
        );
        continue;
      }
      db.prepare(`UPDATE asset_ip_assignments SET asset_id=? WHERE asset_id=? AND ip_id=?`).run(
        canonicalId,
        duplicateId,
        row.ip_id
      );
    } else {
      db.prepare(`DELETE FROM asset_ip_assignments WHERE asset_id=? AND ip_id=?`).run(
        duplicateId,
        row.ip_id
      );
    }
  }

  const dupMeta = db.prepare(`SELECT notes, hostname, location, category FROM assets WHERE id=?`).get(duplicateId);
  const canonMeta = db.prepare(`SELECT notes, hostname, location, category FROM assets WHERE id=?`).get(canonicalId);
  const noteLine = `[merge ${new Date().toISOString().slice(0, 10)}] unito asset #${duplicateId} (${reason})`;
  db.prepare(
    `UPDATE assets SET
      notes = trim(COALESCE(notes,'') || char(10) || ?),
      hostname = COALESCE(hostname, ?),
      location = COALESCE(location, ?),
      category = COALESCE(category, ?),
      updated_at=datetime('now')
     WHERE id=?`
  ).run(noteLine, dupMeta?.hostname || null, dupMeta?.location || null, dupMeta?.category || null, canonicalId);

  db.prepare(
    `UPDATE assets SET status='archived', notes=trim(COALESCE(notes,'') || char(10) || ?), updated_at=datetime('now') WHERE id=?`
  ).run(`Archiviato: unito in asset #${canonicalId}`, duplicateId);

  db.prepare(`UPDATE asset_interfaces SET coordinator_asset_id=? WHERE coordinator_asset_id=?`).run(
    canonicalId,
    duplicateId
  );

  return { merged: true, canonicalId, duplicateId };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} address
 */
export function findActiveAssetIdByIp(db, address) {
  return db
    .prepare(
      `SELECT aia.asset_id
       FROM ip_addresses i
       JOIN asset_ip_assignments aia ON aia.ip_id = i.id
       JOIN assets a ON a.id = aia.asset_id AND a.status='active'
       WHERE i.address = ?
       LIMIT 1`
    )
    .get(address)?.asset_id ?? null;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string|null} mac
 */
export function findActiveAssetIdByMac(db, mac) {
  const m = mac ? normalizeMac(mac) : null;
  if (!m) return null;
  return db
    .prepare(
      `SELECT ai.asset_id FROM asset_interfaces ai
       JOIN assets a ON a.id = ai.asset_id AND a.status='active'
       WHERE ai.mac_address = ? LIMIT 1`
    )
    .get(m)?.asset_id ?? null;
}