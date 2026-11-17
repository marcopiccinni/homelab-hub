/**
 * Migration 002: Null out folder_id values that reference missing parent rows
 * (required before PRAGMA foreign_keys=ON on databases created before FK enforcement).
 */
export const version = 2;

export function up(db) {
  const result = db
    .prepare(
      `UPDATE links
       SET folder_id = NULL
       WHERE folder_id IS NOT NULL
         AND folder_id NOT IN (SELECT id FROM links)`
    )
    .run();

  if (result.changes > 0) {
    console.log(
      `[migration 002] Cleared folder_id for ${result.changes} orphan row(s)`
    );
  }
}