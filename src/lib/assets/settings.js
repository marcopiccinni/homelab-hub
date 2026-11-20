import { getDb } from '../db.js';

export function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

export function setSetting(key, value) {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(key, value);
}

export function getMercusysRouterUrl() {
  const fromDb = getSetting('mercusys_url');
  if (fromDb?.trim()) return fromDb.trim().replace(/\/$/, '');
  const fromEnv = process.env.MERCUSYS_URL?.trim();
  return fromEnv ? fromEnv.replace(/\/$/, '') : null;
}

export function setMercusysLastError(message) {
  if (!message) {
    getDb().prepare(`DELETE FROM app_settings WHERE key = 'mercusys_last_error'`).run();
    return;
  }
  setSetting('mercusys_last_error', String(message).slice(0, 2000));
}

export function getMercusysLastError() {
  return getSetting('mercusys_last_error');
}