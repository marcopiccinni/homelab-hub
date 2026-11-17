#!/usr/bin/env node
/**
 * Ottimizza le icone già presenti in public/uploads (e sottocartelle).
 * - Backup in data/backups/uploads-YYYYMMDD-HHMMSS/
 * - Ridimensiona max 128px, ricodifica (stessa estensione; GIF/ICO -> WebP con aggiornamento DB)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const uploadsRoot = path.join(root, 'public', 'uploads');
const MAX_EDGE = 128;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico']);

function resolveDbPath() {
  const raw = process.env.DATABASE_URL || 'file:./data/intranet.db';
  if (
    raw === 'file:./data/intranet.db' ||
    raw === 'file:data/intranet.db'
  ) {
    return path.join(root, 'data', 'intranet.db');
  }
  let p = raw.startsWith('file:') ? raw.slice(5) : raw;
  if (!path.isAbsolute(p)) p = path.join(root, p);
  return path.resolve(p);
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.startsWith('.backup-')) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function listImages(dir, base = []) {
  if (!fs.existsSync(dir)) return base;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.backup-')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) listImages(abs, base);
    else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) base.push(abs);
  }
  return base;
}

async function optimizeFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  const input = fs.readFileSync(absPath);
  const pipeline = sharp(input)
    .rotate()
    .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true });

  let output;
  let newExt = ext;

  if (ext === '.webp') {
    output = await pipeline.webp({ quality: 82, effort: 4 }).toBuffer();
  } else if (ext === '.png') {
    output = await pipeline.png({ compressionLevel: 9, quality: 85 }).toBuffer();
  } else if (ext === '.jpg' || ext === '.jpeg') {
    output = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  } else if (ext === '.gif' || ext === '.ico') {
    output = await pipeline.webp({ quality: 82 }).toBuffer();
    newExt = '.webp';
  } else {
    return null;
  }

  const rel = path.relative(uploadsRoot, absPath).split(path.sep).join('/');
  const oldWeb = `/uploads/${rel}`;

  if (newExt !== ext) {
    const newAbs = absPath.replace(new RegExp(`${ext.replace('.', '\\.')}$`, 'i'), newExt);
    const newRel = path.relative(uploadsRoot, newAbs).split(path.sep).join('/');
    const newWeb = `/uploads/${newRel}`;
    fs.writeFileSync(newAbs, output);
    if (newAbs !== absPath) fs.unlinkSync(absPath);
    return { oldWeb, newWeb, changedPath: true };
  }

  const tmp = `${absPath}.opt.tmp`;
  fs.writeFileSync(tmp, output);
  fs.renameSync(tmp, absPath);
  const after = fs.statSync(absPath).size;
  return { oldWeb, newWeb: oldWeb, changedPath: false, bytes: after };
}

async function main() {
  if (!fs.existsSync(uploadsRoot)) {
    console.log('Nessuna cartella public/uploads — nulla da fare.');
    return;
  }

  const backupDir = path.join(root, 'data', 'backups', `uploads-${stamp()}`);
  console.log(`Backup upload in ${backupDir}`);
  copyDirRecursive(uploadsRoot, backupDir);

  const files = listImages(uploadsRoot);
  const pathUpdates = [];

  for (const file of files) {
    try {
      const result = await optimizeFile(file);
      if (!result) continue;
      if (result.changedPath) {
        pathUpdates.push(result);
        console.log(`Convertito: ${result.oldWeb} -> ${result.newWeb}`);
      } else {
        console.log(`Ottimizzato: ${result.oldWeb} (${result.bytes} B)`);
      }
    } catch (err) {
      console.error(`Errore su ${file}:`, err.message);
    }
  }

  if (pathUpdates.length > 0) {
    const dbPath = resolveDbPath();
    if (!fs.existsSync(dbPath)) {
      console.warn('DB non trovato; aggiorna manualmente i percorsi icona:', pathUpdates);
      return;
    }
    const db = new Database(dbPath);
    const stmt = db.prepare('UPDATE links SET icon = ? WHERE icon = ?');
    const tx = db.transaction((rows) => {
      for (const { oldWeb, newWeb } of rows) {
        const info = stmt.run(newWeb, oldWeb);
        if (info.changes > 0) {
          console.log(`DB: ${info.changes} riga/e icon ${oldWeb} -> ${newWeb}`);
        }
      }
    });
    tx(pathUpdates);
    db.close();
  }

  console.log(`Completato. ${files.length} file elaborati.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});