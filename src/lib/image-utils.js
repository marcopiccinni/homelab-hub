import { detectImageType } from './upload-utils.js';

export const MAX_ICON_EDGE = 128;

let sharpModule;

async function getSharp() {
  if (sharpModule !== undefined) return sharpModule;
  try {
    sharpModule = (await import('sharp')).default;
  } catch {
    sharpModule = null;
  }
  return sharpModule;
}

function isDecodableImage(buffer) {
  if (!buffer?.length) return false;
  return detectImageType(buffer) !== null;
}

/**
 * New uploads / remote cache: WebP, max edge 128px.
 * @returns {Promise<{ buffer: Buffer, ext: string }|null>}
 */
export async function optimizeIconToWebp(buffer, { maxSize = MAX_ICON_EDGE } = {}) {
  const sharp = await getSharp();
  if (!sharp || !buffer?.length) return null;
  try {
    const out = await sharp(buffer)
      .rotate()
      .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    if (!out?.length || !isDecodableImage(out)) return null;
    return { buffer: out, ext: '.webp' };
  } catch (err) {
    console.error('optimizeIconToWebp:', err?.message ?? err);
    return null;
  }
}

/**
 * Sceglie WebP ottimizzato o buffer originale validato (mai output vuoto).
 * @param {Buffer} buffer
 * @param {{ type: string, ext: string }} detected from detectImageType
 */
export async function prepareIconUploadOutput(buffer, detected) {
  if (!detected || !buffer?.length || !isDecodableImage(buffer)) {
    return null;
  }

  const optimized = await optimizeIconToWebp(buffer);
  if (optimized?.buffer?.length) {
    return optimized;
  }

  return { buffer, ext: detected.ext };
}

/**
 * Re-encode keeping extension (for in-place migration script).
 */
export async function optimizeIconInPlace(buffer, ext, { maxSize = MAX_ICON_EDGE } = {}) {
  const sharp = await getSharp();
  if (!sharp) return null;
  try {
    const pipeline = sharp(buffer)
      .rotate()
      .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true });

    const lower = ext.toLowerCase();
    if (lower === '.webp') {
      return pipeline.webp({ quality: 82, effort: 4 }).toBuffer();
    }
    if (lower === '.png') {
      return pipeline.png({ compressionLevel: 9, quality: 85 }).toBuffer();
    }
    if (lower === '.jpg' || lower === '.jpeg') {
      return pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    }
    if (lower === '.gif') {
      return pipeline.webp({ quality: 82 }).toBuffer();
    }
    if (lower === '.ico') {
      return pipeline.png({ compressionLevel: 9 }).toBuffer();
    }
    return null;
  } catch {
    return null;
  }
}

/** @deprecated use optimizeIconToWebp */
export async function resizeUploadBuffer(buffer, { maxSize = MAX_ICON_EDGE } = {}) {
  const result = await optimizeIconToWebp(buffer, { maxSize });
  return result?.buffer ?? null;
}