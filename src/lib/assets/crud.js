import { getDb } from '../db.js';
import { normalizeMac } from './mac.js';
import { resolveSubnetIdForIp } from './repository.js';

const CATEGORIES = [
  'router',
  'switch',
  'NAS',
  'camera',
  'IoT',
  'TV',
  'PC',
  'smartphone',
  'zigbee',
  'altro',
];

export function suggestCategories() {
  const db = getDb();
  const fromDb = db
    .prepare(
      `SELECT DISTINCT category FROM assets WHERE category IS NOT NULL AND category != '' ORDER BY category`
    )
    .all()
    .map((r) => r.category);
  return [...new Set([...CATEGORIES, ...fromDb])];
}

export function suggestLocations() {
  const db = getDb();
  return db
    .prepare(
      `SELECT DISTINCT location FROM assets WHERE location IS NOT NULL AND location != '' ORDER BY location LIMIT 30`
    )
    .all()
    .map((r) => r.location);
}

export function createAsset(payload) {
  const db = getDb();
  const r = db
    .prepare(
      `INSERT INTO assets (asset_code, name, hostname, manufacturer, model, category, location, ecosystem, description, notes, status, primary_subnet_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      payload.asset_code ?? null,
      payload.name,
      payload.hostname || null,
      payload.manufacturer || null,
      payload.model || null,
      payload.category || null,
      payload.location || null,
      payload.ecosystem || null,
      payload.description || null,
      payload.notes || null,
      payload.status || 'active',
      payload.primary_subnet_id || null
    );
  return r.lastInsertRowid;
}

export function updateAsset(id, payload) {
  const db = getDb();
  db.prepare(
    `UPDATE assets SET asset_code=?, name=?, hostname=?, manufacturer=?, model=?, category=?, location=?, ecosystem=?, description=?, notes=?, status=?, primary_subnet_id=?, updated_at=datetime('now') WHERE id=?`
  ).run(
    payload.asset_code ?? null,
    payload.name,
    payload.hostname || null,
    payload.manufacturer || null,
    payload.model || null,
    payload.category || null,
    payload.location || null,
    payload.ecosystem || null,
    payload.description || null,
    payload.notes || null,
    payload.status || 'active',
    payload.primary_subnet_id || null,
    id
  );
}

export function deleteAsset(id) {
  getDb().prepare('DELETE FROM assets WHERE id = ?').run(id);
}

export function addInterface(assetId, { mac_address, iface_type, ieee_address, label }) {
  const db = getDb();
  const mac = mac_address ? normalizeMac(mac_address) : null;
  return db
    .prepare(
      `INSERT INTO asset_interfaces (asset_id, mac_address, iface_type, ieee_address, label) VALUES (?, ?, ?, ?, ?)`
    )
    .run(assetId, mac, iface_type || 'eth', ieee_address || null, label || null).lastInsertRowid;
}

export function deleteInterface(id) {
  getDb().prepare('DELETE FROM asset_interfaces WHERE id=?').run(id);
}

export function assignIp(assetId, address) {
  const db = getDb();
  const subnetId = resolveSubnetIdForIp(address);
  db.prepare(
    `INSERT INTO ip_addresses (address, subnet_id, allocation) VALUES (?, ?, 'static')
     ON CONFLICT(address) DO UPDATE SET subnet_id=excluded.subnet_id`
  ).run(address, subnetId);
  const ipId = db.prepare('SELECT id FROM ip_addresses WHERE address=?').get(address).id;
  db.prepare(
    `INSERT OR IGNORE INTO asset_ip_assignments (asset_id, ip_id) VALUES (?, ?)`
  ).run(assetId, ipId);
  return ipId;
}

export function unassignIp(assetId, ipId) {
  getDb()
    .prepare('DELETE FROM asset_ip_assignments WHERE asset_id=? AND ip_id=?')
    .run(assetId, ipId);
}

export function linkFqdnToIp(fqdn, address) {
  const db = getDb();
  db.prepare(`INSERT INTO fqdns (fqdn) VALUES (?) ON CONFLICT(fqdn) DO NOTHING`).run(fqdn);
  const fqdnId = db.prepare('SELECT id FROM fqdns WHERE fqdn=?').get(fqdn).id;
  const ipRow = db.prepare('SELECT id FROM ip_addresses WHERE address=?').get(address);
  let ipId = ipRow?.id;
  if (!ipId) {
    const subnetId = resolveSubnetIdForIp(address);
    db.prepare(
      `INSERT INTO ip_addresses (address, subnet_id) VALUES (?, ?)`
    ).run(address, subnetId);
    ipId = db.prepare('SELECT id FROM ip_addresses WHERE address=?').get(address).id;
  }
  db.prepare(`INSERT OR IGNORE INTO fqdn_ips (fqdn_id, ip_id) VALUES (?, ?)`).run(fqdnId, ipId);
  return { fqdnId, ipId };
}

export function addDeclaredService(payload) {
  const db = getDb();
  return db
    .prepare(
      `INSERT INTO declared_services (name, protocol, port, service_name, service_version, url, description, notes, in_intranet, link_id, ip_id, fqdn_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      payload.name || null,
      payload.protocol || 'tcp',
      payload.port,
      payload.service_name || null,
      payload.service_version || null,
      payload.url || null,
      payload.description || null,
      payload.notes || null,
      payload.in_intranet ? 1 : 0,
      payload.link_id || null,
      payload.ip_id || null,
      payload.fqdn_id || null
    ).lastInsertRowid;
}

export function deleteDeclaredService(id) {
  getDb().prepare('DELETE FROM declared_services WHERE id=?').run(id);
}

export function documentObservedPort(observedId, extra = {}) {
  const db = getDb();
  const o = db.prepare('SELECT * FROM observed_services WHERE id=?').get(observedId);
  if (!o) return null;
  const existing = db
    .prepare(
      `SELECT id FROM declared_services WHERE ip_id=? AND port=? AND protocol=?`
    )
    .get(o.ip_id, o.port, o.protocol || 'tcp');
  if (existing) return existing.id;
  return addDeclaredService({
    name: extra.name || o.service_name || `Porta ${o.port}`,
    protocol: o.protocol || 'tcp',
    port: o.port,
    service_name: o.service_name,
    service_version: o.service_version,
    ip_id: o.ip_id,
    description: 'Documentata da scan',
    in_intranet: extra.link_id ? 1 : 0,
    link_id: extra.link_id || null,
  });
}

export function upsertSubnet(payload) {
  const db = getDb();
  if (payload.id) {
    db.prepare(
      `UPDATE subnets SET sort_order=?, family_label=?, cidr=?, description=?, notes=?, dhcp_range=?, content_examples=?, vlan=? WHERE id=?`
    ).run(
      payload.sort_order ?? 0,
      payload.family_label,
      payload.cidr,
      payload.description || null,
      payload.notes || null,
      payload.dhcp_range || null,
      payload.content_examples || null,
      payload.vlan || null,
      payload.id
    );
    return payload.id;
  }
  const r = db
    .prepare(
      `INSERT INTO subnets (sort_order, family_label, cidr, description, notes, dhcp_range, content_examples, vlan, is_non_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .run(
      payload.sort_order ?? 0,
      payload.family_label,
      payload.cidr,
      payload.description || null,
      payload.notes || null,
      payload.dhcp_range || null,
      payload.content_examples || null,
      payload.vlan || null
    );
  return r.lastInsertRowid;
}

export function deleteSubnet(id) {
  getDb().prepare('DELETE FROM subnets WHERE id=?').run(id);
}