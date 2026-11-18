import { classifyLegacyUrl } from '../url-heuristics.js';

export const version = 3;

function columnExists(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

export function up(db) {
  if (!columnExists(db, 'links', 'url_external')) {
    db.exec(`ALTER TABLE links ADD COLUMN url_external TEXT DEFAULT NULL`);
  }
  if (!columnExists(db, 'links', 'url_local_fqdn')) {
    db.exec(`ALTER TABLE links ADD COLUMN url_local_fqdn TEXT DEFAULT NULL`);
  }
  if (!columnExists(db, 'links', 'url_ip')) {
    db.exec(`ALTER TABLE links ADD COLUMN url_ip TEXT DEFAULT NULL`);
  }
  if (!columnExists(db, 'links', 'access_type')) {
    db.exec(
      `ALTER TABLE links ADD COLUMN access_type TEXT NOT NULL DEFAULT 'external'`
    );
  }

  const rows = db.prepare('SELECT id, url FROM links WHERE url IS NOT NULL AND url != ?').all('');

  const stmt = db.prepare(`
    UPDATE links
    SET url_external = COALESCE(url_external, ?),
        url_local_fqdn = COALESCE(url_local_fqdn, ?),
        url_ip = COALESCE(url_ip, ?),
        access_type = ?
    WHERE id = ?
  `);

  for (const row of rows) {
    const c = classifyLegacyUrl(row.url);
    stmt.run(
      c.url_external,
      c.url_local_fqdn,
      c.url_ip,
      c.access_type,
      row.id
    );
  }
}