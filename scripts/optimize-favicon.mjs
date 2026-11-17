#!/usr/bin/env node
/**
 * Genera favicon ottimizzate da public/favicon.png (sorgente ad alta risoluzione).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'public', 'favicon.png');
const outDir = path.join(root, 'public', 'icons');

const SIZES = [
  { name: 'favicon-32', size: 32 },
  { name: 'favicon-180', size: 180 },
  { name: 'favicon-192', size: 192 },
  { name: 'favicon-512', size: 512 },
];

if (!fs.existsSync(src)) {
  console.error('Manca public/favicon.png');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const meta = await sharp(src).metadata();
console.log(`Sorgente: ${src} (${meta.width}x${meta.height}, ${fs.statSync(src).size} byte)`);

for (const { name, size } of SIZES) {
  const pngPath = path.join(outDir, `${name}.png`);
  const webpPath = path.join(outDir, `${name}.webp`);

  await sharp(src)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9, quality: 85 })
    .toFile(pngPath);

  await sharp(src)
    .resize(size, size, { fit: 'cover' })
    .webp({ quality: 82, effort: 4 })
    .toFile(webpPath);

  console.log(
    `${name}: png ${fs.statSync(pngPath).size} B, webp ${fs.statSync(webpPath).size} B`
  );
}

// Legacy path usato in passato
const legacy192 = path.join(root, 'public', 'favicon-192.png');
await sharp(src)
  .resize(192, 192, { fit: 'cover' })
  .png({ compressionLevel: 9, quality: 85 })
  .toFile(legacy192);

const icoPath = path.join(root, 'public', 'favicon.ico');
await sharp(src).resize(32, 32).toFile(icoPath);
console.log(`favicon.ico aggiornato (${fs.statSync(icoPath).size} B)`);

console.log('Favicon ottimizzate in public/icons/');