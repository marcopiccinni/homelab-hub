import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as m001 from './001_baseline.js';
import * as m002 from './002_fix_orphan_folder_ids.js';
import * as m003 from './003_multi_url_access.js';

const migrationsDir = path.dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = [
  { version: 1, file: '001_baseline.js', up: m001.up },
  { version: 2, file: '002_fix_orphan_folder_ids.js', up: m002.up },
  { version: 3, file: '003_multi_url_access.js', up: m003.up },
];

function getBackupDir(dataDir) {
  return path.join(dataDir, 'backups');
}

function pruneBackups(backupDir, keep = 10) {
  if (!fs.existsSync(backupDir)) return;
  const backups = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith('intranet-') && f.endsWith('.db'))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(backupDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const old of backups.slice(keep)) {
    fs.unlinkSync(path.join(backupDir, old.name));
  }
}

function backupDatabase(db, dbPath) {
  const dataDir = path.dirname(dbPath);
  const backupDir = getBackupDir(dataDir);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

  const backupPath = path.join(backupDir, `intranet-${stamp}.db`);
  const backupCli = path.join(migrationsDir, 'backup-cli.cjs');
  execFileSync(process.execPath, [backupCli, dbPath, backupPath], {
    stdio: 'pipe',
  });
  console.log(`Database backup created: ${backupPath}`);
  pruneBackups(backupDir, 10);
}

/**
 * Run pending migrations; throws on failure (abort startup).
 * @param {import('better-sqlite3').Database} db
 * @param {string} dbPath
 */
export function runMigrations(db, dbPath) {
  const currentVersion = db.pragma('user_version', { simple: true });

  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion);

  if (pending.length > 0) {
    backupDatabase(db, dbPath);
  }

  for (const migration of pending) {
    console.log(
      `Applying migration ${String(migration.version).padStart(3, '0')} (${migration.file})`
    );
    const run = db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    });
    try {
      run();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Migration ${migration.version} (${migration.file}) failed: ${message}`
      );
    }
  }

  db.pragma('foreign_keys = ON');
}

export { MIGRATIONS };