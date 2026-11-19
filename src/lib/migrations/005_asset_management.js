export const version = 5;

const DEFAULT_SUBNETS = [
  { sort: 1, family: 'Guest / nuovi device', cidr: '10.0.0.0/24', dhcp: '.50+', notes: 'DHCP es. da .50' },
  { sort: 2, family: 'Management / Network', cidr: '10.0.1.0/24' },
  { sort: 3, family: 'Shared / Storage', cidr: '10.0.2.0/24' },
  { sort: 4, family: 'Security / Cameras', cidr: '10.0.3.0/24' },
  { sort: 5, family: 'IoT / Domotica', cidr: '10.0.4.0/24' },
  { sort: 6, family: 'Multimedia', cidr: '10.0.5.0/24' },
  { sort: 7, family: 'Wired / Workstation', cidr: '10.0.6.0/24' },
  { sort: 8, family: 'Wireless personal', cidr: '10.0.7.0/24' },
  { sort: 9, family: 'VPN / Lab / Dev', cidr: '10.0.8.0/24' },
  { sort: 10, family: 'Default modem', cidr: '192.168.1.0/24' },
  { sort: 11, family: 'Zigbee', cidr: null, nonIp: 1, notes: 'Rete IEEE senza IP' },
];

function tableExists(db, name) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name);
  return Boolean(row);
}

function migrateFromLinks(db) {
  const links = db
    .prepare(
      'SELECT id, title, url, url_external, url_local_fqdn, url_ip, is_folder FROM links'
    )
    .all();
  const upsertIp = db.prepare(`
    INSERT INTO ip_addresses (address, subnet_id, notes)
    VALUES (?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      subnet_id = COALESCE(excluded.subnet_id, ip_addresses.subnet_id)
  `);
  const getIp = db.prepare('SELECT id FROM ip_addresses WHERE address = ?');
  const upsertFqdn = db.prepare(`
    INSERT INTO fqdns (fqdn) VALUES (?)
    ON CONFLICT(fqdn) DO NOTHING
  `);
  const getFqdn = db.prepare('SELECT id FROM fqdns WHERE fqdn = ?');
  const linkFqdnIp = db.prepare(`
    INSERT OR IGNORE INTO fqdn_ips (fqdn_id, ip_id) VALUES (?, ?)
  `);
  const insSvc = db.prepare(`
    INSERT INTO declared_services (name, protocol, port, url, description, in_intranet, link_id, ip_id, fqdn_id)
    VALUES (?, 'tcp', ?, ?, ?, 1, ?, ?, ?)
  `);

  const urlsFor = (row) => {
    const u = new Set();
    for (const f of ['url', 'url_external', 'url_local_fqdn', 'url_ip']) {
      if (row[f]) u.add(row[f]);
    }
    return [...u];
  };

  for (const row of links) {
    if (row.is_folder === 1) continue;
    for (const raw of urlsFor(row)) {
      try {
        const parsed = new URL(raw);
        const host = parsed.hostname;
        const port = parseInt(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'), 10);
        let ipId = null;
        let fqdnId = null;
        if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
          let subnetId = null;
          const subnets = db.prepare('SELECT id, cidr FROM subnets WHERE cidr IS NOT NULL').all();
          for (const s of subnets) {
            const base = s.cidr.split('/')[0];
            const parts = base.split('.');
            const prefix = `${parts[0]}.${parts[1]}.${parts[2]}.`;
            if (host.startsWith(prefix)) {
              subnetId = s.id;
              break;
            }
          }
          upsertIp.run(host, subnetId, 'Migrato da link dashboard');
          ipId = getIp.get(host)?.id;
        } else if (host && host !== 'localhost') {
          upsertFqdn.run(host);
          fqdnId = getFqdn.get(host).id;
          if (ipId) linkFqdnIp.run(fqdnId, ipId);
        }
        insSvc.run(row.title, port, raw, 'Da collegamento dashboard', row.id, ipId, fqdnId);
      } catch {
        /* skip invalid */
      }
    }
  }
}

export function up(db) {
  if (tableExists(db, 'subnets')) {
    return;
  }

  db.exec(`
    CREATE TABLE subnets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      family_label TEXT NOT NULL,
      cidr TEXT UNIQUE,
      is_non_ip INTEGER NOT NULL DEFAULT 0,
      vlan TEXT,
      description TEXT,
      content_examples TEXT,
      notes TEXT,
      dhcp_range TEXT,
      static_range TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_code INTEGER UNIQUE,
      name TEXT NOT NULL,
      hostname TEXT,
      manufacturer TEXT,
      model TEXT,
      category TEXT,
      location TEXT,
      ecosystem TEXT,
      description TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      primary_subnet_id INTEGER REFERENCES subnets(id),
      first_seen_at TEXT,
      last_seen_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE asset_interfaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      mac_address TEXT,
      iface_type TEXT NOT NULL DEFAULT 'eth',
      ieee_address TEXT,
      label TEXT,
      coordinator_asset_id INTEGER REFERENCES assets(id)
    );
    CREATE UNIQUE INDEX idx_iface_mac ON asset_interfaces(mac_address) WHERE mac_address IS NOT NULL;
    CREATE UNIQUE INDEX idx_iface_ieee ON asset_interfaces(ieee_address) WHERE ieee_address IS NOT NULL;

    CREATE TABLE ip_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL UNIQUE,
      subnet_id INTEGER REFERENCES subnets(id),
      allocation TEXT DEFAULT 'unknown',
      last_seen_at TEXT,
      notes TEXT
    );

    CREATE TABLE asset_ip_assignments (
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      ip_id INTEGER NOT NULL REFERENCES ip_addresses(id) ON DELETE CASCADE,
      interface_id INTEGER REFERENCES asset_interfaces(id),
      PRIMARY KEY (asset_id, ip_id)
    );

    CREATE TABLE fqdns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fqdn TEXT NOT NULL UNIQUE COLLATE NOCASE,
      notes TEXT
    );

    CREATE TABLE fqdn_ips (
      fqdn_id INTEGER NOT NULL REFERENCES fqdns(id) ON DELETE CASCADE,
      ip_id INTEGER NOT NULL REFERENCES ip_addresses(id) ON DELETE CASCADE,
      PRIMARY KEY (fqdn_id, ip_id)
    );

    CREATE TABLE declared_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      protocol TEXT NOT NULL DEFAULT 'tcp',
      port INTEGER NOT NULL,
      service_name TEXT,
      service_version TEXT,
      url TEXT,
      description TEXT,
      notes TEXT,
      in_intranet INTEGER NOT NULL DEFAULT 0,
      link_id INTEGER REFERENCES links(id) ON DELETE SET NULL,
      ip_id INTEGER REFERENCES ip_addresses(id) ON DELETE CASCADE,
      fqdn_id INTEGER REFERENCES fqdns(id) ON DELETE CASCADE
    );

    CREATE TABLE scan_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL,
      target TEXT NOT NULL,
      profile TEXT NOT NULL DEFAULT 'quick',
      status TEXT NOT NULL DEFAULT 'queued',
      progress TEXT,
      error TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE observed_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_job_id INTEGER NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
      ip_id INTEGER REFERENCES ip_addresses(id),
      address TEXT,
      observed_at TEXT NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'tcp',
      port INTEGER NOT NULL,
      state TEXT,
      service_name TEXT,
      service_version TEXT
    );

    CREATE TABLE discovery_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_address TEXT,
      mac_address TEXT,
      hostname TEXT,
      first_seen_at TEXT,
      last_seen_at TEXT,
      scan_job_id INTEGER REFERENCES scan_jobs(id),
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT
    );

    CREATE TABLE asset_tags (
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (asset_id, tag)
    );

    CREATE INDEX idx_assets_status ON assets(status);
    CREATE INDEX idx_ips_subnet ON ip_addresses(subnet_id);
    CREATE INDEX idx_observed_ip_port ON observed_services(ip_id, port);
    CREATE INDEX idx_declared_ip_port ON declared_services(ip_id, port);
  `);

  const count = db.prepare('SELECT COUNT(*) AS c FROM subnets').get().c;
  if (count === 0) {
    const ins = db.prepare(`
      INSERT INTO subnets (sort_order, family_label, cidr, is_non_ip, notes, dhcp_range)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const s of DEFAULT_SUBNETS) {
      ins.run(s.sort, s.family, s.cidr, s.nonIp ? 1 : 0, s.notes || null, s.dhcp || null);
    }
  }

  migrateFromLinks(db);
}