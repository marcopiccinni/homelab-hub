/**
 * Migration 001: Baseline schema for the links table.
 * Existing databases with the links table already present: no-op (data preserved).
 * Fresh databases: create the full schema.
 */
export const version = 1;

export function up(db) {
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='links'"
    )
    .get();

  if (tableExists) {
  // Existing production DB — schema already applied via legacy migrateColumn(); do not alter.
    return;
  }

  db.exec(`
    CREATE TABLE links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      visible INTEGER DEFAULT 1,
      is_folder INTEGER DEFAULT 0,
      folder_id INTEGER DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      color TEXT DEFAULT NULL,
      FOREIGN KEY(folder_id) REFERENCES links(id) ON DELETE CASCADE
    )
  `);
}