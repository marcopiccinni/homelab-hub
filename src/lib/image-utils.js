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

/**
 * New uploads / remote cache: WebP, max edge 128px.
 * @returns {Promise<{ buffer: Buffer, ext: string }|null>}
 */
export async function optimizeIconToWebp(buffer, { maxSize = MAX_ICON_EDGE } = {}) {
  const sharp = await getSharp();
  if (!sharp) return null;
  const out = await sharp(buffer)
    .rotate()
    .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
  return { buffer: out, ext: '.webp' };
}

/**
 * Re-encode keeping extension (for in-place migration script).
 */
export async function optimizeIconInPlace(buffer, ext, { maxSize = MAX_ICON_EDGE } = {}) {
  const sharp = await getSharp();
  if (!sharp) return null;
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
}

/** @deprecated use optimizeIconToWebp */
export async function resizeUploadBuffer(buffer, { maxSize = MAX_ICON_EDGE } = {}) {
  const result = await optimizeIconToWebp(buffer, { maxSize });
  return result?.buffer ?? null;
}