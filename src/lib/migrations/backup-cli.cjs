'use strict';

const Database = require('better-sqlite3');

const [sourcePath, destPath] = process.argv.slice(2);

if (!sourcePath || !destPath) {
  console.error('Usage: backup-cli.cjs <source.db> <dest.db>');
  process.exit(1);
}

(async () => {
  const db = new Database(sourcePath, { readonly: true });
  try {
    await db.backup(destPath);
  } finally {
    db.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});