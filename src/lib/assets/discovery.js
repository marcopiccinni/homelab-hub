import { getDb } from '../db.js';
import { normalizeMac } from './mac.js';
import { createAsset, addInterface, assignIp } from './crud.js';
import { resolveSubnetIdForIp } from './repository.js';
import { touchAssetPresence } from './asset-touch.js';

export function listDiscoveryQueue(status = 'pending') {
  const db = getDb();
  return db
    .prepare(
      `SELECT d.*, a.id AS suggested_asset_id, a.name AS suggested_name
       FROM discovery_queue d
       LEFT JOIN asset_interfaces ai ON ai.mac_address = d.mac_address AND d.mac_address IS NOT NULL
       LEFT JOIN assets a ON a.id = ai.asset_id AND a.status='active'
       WHERE d.status = ?
       ORDER BY d.last_seen_at DESC`
    )
    .all(status);
}

export function dismissDiscovery(id) {
  getDb().prepare(`UPDATE discovery_queue SET status='dismissed' WHERE id=?`).run(id);
}

function findActiveAssetByMac(db, mac) {
  if (!mac) return null;
  return db
    .prepare(
      `SELECT a.id, a.name FROM asset_interfaces ai
       JOIN assets a ON a.id = ai.asset_id
       WHERE ai.mac_address = ? AND a.status = 'active' LIMIT 1`
    )
    .get(mac);
}

function applyDiscoveryRowToAsset(db, row, assetId) {
  if (row.mac_address) {
    const mac = normalizeMac(row.mac_address);
    if (mac) {
      const iface = db.prepare('SELECT id FROM asset_interfaces WHERE mac_address=?').get(mac);
      if (iface) {
        db.prepare('UPDATE asset_interfaces SET asset_id=? WHERE id=?').run(assetId, iface.id);
      } else {
        addInterface(assetId, { mac_address: mac, iface_type: 'eth' });
      }
    }
  }
  if (row.ip_address) {
    assignIp(assetId, row.ip_address);
    const subnetId = resolveSubnetIdForIp(row.ip_address);
    if (subnetId) {
      db.prepare(
        `UPDATE assets SET primary_subnet_id=COALESCE(primary_subnet_id, ?) WHERE id=?`
      ).run(subnetId, assetId);
    }
  }
  if (row.last_seen_at) {
    db.prepare(`UPDATE assets SET last_seen_at=?, last_seen_source='scan' WHERE id=?`).run(
      row.last_seen_at,
      assetId
    );
  } else {
    touchAssetPresence(db, assetId, 'scan');
  }
}

export function createAssetFromDiscovery(id, fields = {}) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM discovery_queue WHERE id=?').get(id);
  if (!row) throw new Error('Voce non trovata');
  if (row.status !== 'pending') throw new Error('Voce già gestita');

  const mac = row.mac_address ? normalizeMac(row.mac_address) : null;
  const existing = findActiveAssetByMac(db, mac);
  if (existing) {
    applyDiscoveryRowToAsset(db, row, existing.id);
    db.prepare(`UPDATE discovery_queue SET status='merged' WHERE id=?`).run(id);
    return { assetId: existing.id, merged: true, assetName: existing.name };
  }

  const name = fields.name || row.hostname || `Device ${row.ip_address}`;
  const subnetId = row.ip_address ? resolveSubnetIdForIp(row.ip_address) : null;
  const assetId = createAsset({
    name,
    hostname: row.hostname,
    category: fields.category || 'IoT',
    location: fields.location || null,
    notes: 'Creato da coda discovery',
    primary_subnet_id: subnetId,
  });
  applyDiscoveryRowToAsset(db, row, assetId);
  db.prepare(`UPDATE discovery_queue SET status='merged' WHERE id=?`).run(id);
  const created = db.prepare('SELECT name FROM assets WHERE id=?').get(assetId);
  return { assetId, merged: false, assetName: created?.name || name };
}

export function mergeDiscoveryToAsset(discoveryId, assetId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM discovery_queue WHERE id=?').get(discoveryId);
  if (!row) throw new Error('Voce non trovata');
  if (row.status !== 'pending') throw new Error('Voce già gestita');
  const target = db.prepare('SELECT id, name FROM assets WHERE id=? AND status=?').get(assetId, 'active');
  if (!target) throw new Error('Asset destinazione non valido');
  applyDiscoveryRowToAsset(db, row, assetId);
  db.prepare(`UPDATE discovery_queue SET status='merged' WHERE id=?`).run(discoveryId);
  return { assetId, merged: true, assetName: target.name };
}