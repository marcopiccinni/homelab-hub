/** Ultima fonte di rilevazione rete (scan, mercusys). */
export function up(db) {
  const cols = db.prepare('PRAGMA table_info(assets)').all().map((c) => c.name);
  if (!cols.includes('last_seen_source')) {
    db.exec(`ALTER TABLE assets ADD COLUMN last_seen_source TEXT`);
  }
}