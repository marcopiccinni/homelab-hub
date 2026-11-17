import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migrations/index.js';

function resolveDbPath() {
  const raw = process.env.DATABASE_URL || 'file:./data/intranet.db';
  let dbPath = raw.startsWith('file:') ? raw.slice('file:'.length) : raw;
  if (!path.isAbsolute(dbPath)) {
    dbPath = path.join(process.cwd(), dbPath);
  }
  return path.resolve(dbPath);
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

console.log('Database initialized successfully (user_version=%s)', db.pragma('user_version', { simple: true }));

export default db;