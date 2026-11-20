/**
 * Impostazioni app (URL Mercusys in DB) + rimozione voci discovery mock da test.
 */

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare(
    `DELETE FROM discovery_queue
     WHERE status = 'pending'
       AND notes IN ('Import Mercusys', 'Import Mercusys (mock)')
       AND (
         ip_address IN ('10.0.4.88', '10.0.4.89')
         OR (mac_address IS NOT NULL AND mac_address LIKE '02:00:00:00:00:%')
       )`
  ).run();
}