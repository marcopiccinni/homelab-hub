import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { MAX_UPLOAD_BYTES } from './upload-utils';
import { assertSafeFetchUrl, safeFetch } from './ssrf';
import { detectImageType } from './upload-utils';
import { prepareIconUploadOutput } from './image-utils';

const CACHE_DIR = path.join(process.cwd(), 'public', 'uploads', 'icons');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

async function readBinaryLimited(response, maxBytes = MAX_UPLOAD_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) {
    const buf = Buffer.from(await response.arrayBuffer());
    return buf.length <= maxBytes ? buf : null;
  }
  const chunks = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

/**
 * Download a remote favicon/icon and store under /uploads/icons (LAN-safe fetch).
 * @returns {Promise<string|null>} local web path or null
 */
export async function cacheRemoteIcon(iconUrl) {
  if (!iconUrl || typeof iconUrl !== 'string') return null;
  if (iconUrl.startsWith('/uploads/')) return iconUrl;

  try {
    const check = await assertSafeFetchUrl(iconUrl);
    if (!check.ok) return null;

    const cacheKey = crypto
      .createHash('sha256')
      .update(check.url.href)
      .digest('hex')
      .slice(0, 32);

    ensureCacheDir();
    const existing = fs
      .readdirSync(CACHE_DIR)
      .find((f) => f.startsWith(cacheKey));
    if (existing) {
      return `/uploads/icons/${existing}`;
    }

    const { response } = await safeFetch(check.url.href, {
      method: 'GET',
      headers: { Accept: 'image/*' },
    });

    if (!response.ok) return null;

    const buffer = await readBinaryLimited(response);
    if (!buffer) return null;

    const detected = detectImageType(buffer);
    if (!detected) return null;

    const prepared = await prepareIconUploadOutput(buffer, detected);
    if (!prepared?.buffer?.length) return null;

    const fileName = `${cacheKey}${prepared.ext}`;
    const outPath = path.join(CACHE_DIR, fileName);
    fs.writeFileSync(outPath, prepared.buffer);

    return `/uploads/icons/${fileName}`;
  } catch (err) {
    console.error('icon-cache:', err);
    return null;
  }
}