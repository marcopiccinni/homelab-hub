const IMAGE_MAGIC = [
  { type: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], ext: '.png' },
  { type: 'jpeg', bytes: [0xff, 0xd8, 0xff], ext: '.jpg' },
  { type: 'gif', bytes: [0x47, 0x49, 0x46, 0x38], ext: '.gif' },
  { type: 'webp', bytes: [0x52, 0x49, 0x46, 0x46], ext: '.webp', extraCheck: (buf) => buf.length >= 12 && buf.slice(8, 12).toString('ascii') === 'WEBP' },
  { type: 'ico', bytes: [0x00, 0x00, 0x01, 0x00], ext: '.ico' },
];

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  for (const sig of IMAGE_MAGIC) {
    const matches = sig.bytes.every((b, i) => buffer[i] === b);
    if (!matches) continue;
    if (sig.extraCheck && !sig.extraCheck(buffer)) continue;
    return { type: sig.type, ext: sig.ext };
  }

  return null;
}