import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('file:', '')
  : path.join(process.cwd(), 'data', 'intranet.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log('Initializing database at:', dbPath);
const db = new Database(dbPath);
console.log('Database initialized successfully');

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    visible INTEGER DEFAULT 1,
    is_folder INTEGER DEFAULT 0,
    folder_id INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(folder_id) REFERENCES links(id) ON DELETE CASCADE
  )
`);

// Migrations
const migrateColumn = (colName, defVal, type = 'INTEGER') => {
  try {
    db.prepare(`ALTER TABLE links ADD COLUMN ${colName} ${type} DEFAULT ${defVal}`).run();
  } catch (e) {
    // Column already exists or table doesn't exist yet
  }
};

migrateColumn('visible', 1);
migrateColumn('is_folder', 0);
migrateColumn('folder_id', 'NULL');
migrateColumn('color', 'NULL', 'TEXT');

export default db;
