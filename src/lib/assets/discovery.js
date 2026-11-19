import { getDb } from '../db.js';
import { normalizeMac } from './mac.js';
import { createAsset, addInterface, assignIp } from './crud.js';

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

export function createAssetFromDiscovery(id, fields = {}) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM discovery_queue WHERE id=?').get(id);
  if (!row) throw new Error('Voce non trovata');
  const name = fields.name || row.hostname || `Device ${row.ip_address}`;
  const assetId = createAsset({
    name,
    hostname: row.hostname,
    category: fields.category || 'IoT',
    location: fields.location || null,
    notes: 'Creato da coda discovery',
  });
  if (row.mac_address) {
    const mac = normalizeMac(row.mac_address);
    if (mac) addInterface(assetId, { mac_address: mac, iface_type: 'eth' });
  }
  if (row.ip_address) assignIp(assetId, row.ip_address);
  db.prepare(`UPDATE discovery_queue SET status='merged' WHERE id=?`).run(id);
  return assetId;
}

export function mergeDiscoveryToAsset(discoveryId, assetId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM discovery_queue WHERE id=?').get(discoveryId);
  if (!row) throw new Error('Voce non trovata');
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
  if (row.ip_address) assignIp(assetId, row.ip_address);
  db.prepare(`UPDATE discovery_queue SET status='merged' WHERE id=?`).run(discoveryId);
}