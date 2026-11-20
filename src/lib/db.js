import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migrations/index.js';

function resolveDbPath() {
  const raw = process.env.DATABASE_URL || 'file:./data/intranet.db';
  if (
    !raw ||
    raw === 'file:./data/intranet.db' ||
    raw === 'file:data/intranet.db'
  ) {
    return path.join(process.cwd(), 'data', 'intranet.db');
  }
  let dbPath = raw.startsWith('file:') ? raw.slice('file:'.length) : raw;
  if (!path.isAbsolute(dbPath)) {
    dbPath = path.join(process.cwd(), 'data', path.basename(dbPath));
  }
  return path.resolve(/* turbopackIgnore: true */ dbPath);
}

let dbInstance = null;
let initDbPath = null;

/**
 * Lazy SQLite connection (no open at module load — safe for `next build`).
 */
export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = resolveDbPath();
  const dataDir = path.dirname(dbPath);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  console.log('Initializing database at:', dbPath);
  const db = new Database(dbPath);

  try {
    runMigrations(db, dbPath);
  } catch (err) {
    console.error('Database migration failed:', err);
    db.close();
    throw err;
  }

  console.log(
    'Database initialized successfully (user_version=%s)',
    db.pragma('user_version', { simple: true })
  );

  dbInstance = db;
  initDbPath = dbPath;

  queueMicrotask(() => {
    import('./assets/nmap-runner.js')
      .then((m) => m.bootstrapScanWorker())
      .catch((err) => {
        console.warn('Scan worker bootstrap skipped:', err instanceof Error ? err.message : err);
      });
  });

  return dbInstance;
}

export function getDbPath() {
  return initDbPath ?? resolveDbPath();
}

const dbProxy = new Proxy(
  {},
  {
    get(_target, prop) {
      const db = getDb();
      const value = db[prop];
      if (typeof value === 'function') {
        return value.bind(db);
      }
      return value;
    },
  }
);

export default dbProxy;