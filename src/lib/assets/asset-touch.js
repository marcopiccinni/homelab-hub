import { resolveSubnetIdForIp } from './repository.js';
import { findActiveAssetIdByIp, mergeAssetInto } from './asset-merge.js';

export function touchAssetPresence(db, assetId, source = 'scan') {
  db.prepare(
    `UPDATE assets SET last_seen_at=datetime('now'), last_seen_source=?, updated_at=datetime('now') WHERE id=?`
  ).run(source, assetId);
}

export function touchAssetPresenceAt(db, assetId, source, observedAt) {
  db.prepare(
    `UPDATE assets SET last_seen_at=?, last_seen_source=?, updated_at=datetime('now') WHERE id=?`
  ).run(observedAt, source, assetId);
}

export function upsertObservedIpForAsset(db, assetId, ip) {
  if (!ip) return;
  const subnetId = resolveSubnetIdForIp(ip);
  db.prepare(
    `INSERT INTO ip_addresses (address, subnet_id, last_seen_at, allocation)
     VALUES (?, ?, datetime('now'), 'unknown')
     ON CONFLICT(address) DO UPDATE SET last_seen_at=datetime('now'),
       subnet_id=COALESCE(excluded.subnet_id, ip_addresses.subnet_id)`
  ).run(ip, subnetId);
  const ipRow = db.prepare('SELECT id FROM ip_addresses WHERE address=?').get(ip);
  if (!ipRow) return;
  const holder = findActiveAssetIdByIp(db, ip);
  if (holder && holder !== assetId) {
    mergeAssetInto(db, assetId, holder, { reason: 'observed_ip', matchKey: `ip:${ip}` });
  }
  db.prepare(`INSERT OR IGNORE INTO asset_ip_assignments (asset_id, ip_id) VALUES (?, ?)`).run(
    assetId,
    ipRow.id
  );
}