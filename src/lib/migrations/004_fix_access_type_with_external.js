export const version = 4;

/**
 * Corregge access_type dedotto dalla 003 quando esiste url_external:
 * - con URL locali (IP/FQDN) -> local_exposed
 * - solo esterno -> external
 */
export function up(db) {
  const rows = db
    .prepare(
      `SELECT id, url_external, url_local_fqdn, url_ip, access_type
       FROM links
       WHERE is_folder = 0
         AND url_external IS NOT NULL
         AND TRIM(url_external) != ''
         AND access_type IN ('local_only', 'vpn_only')`
    )
    .all();

  const update = db.prepare(`UPDATE links SET access_type = ? WHERE id = ?`);

  for (const row of rows) {
    const hasLocal =
      (row.url_ip && String(row.url_ip).trim()) ||
      (row.url_local_fqdn && String(row.url_local_fqdn).trim());
    const next = hasLocal ? 'local_exposed' : 'external';
    if (next !== row.access_type) {
      update.run(next, row.id);
    }
  }
}