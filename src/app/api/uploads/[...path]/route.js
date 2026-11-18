import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads');

const MIME_BY_EXT = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function resolveUploadPath(segments) {
  if (!segments?.length) return null;
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..' || !SAFE_SEGMENT.test(seg)) {
      return null;
    }
  }
  const resolved = path.resolve(UPLOAD_ROOT, ...segments);
  const root = path.resolve(UPLOAD_ROOT);
  if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
    return null;
  }
  return resolved;
}

export async function GET(_request, { params }) {
  const resolvedParams = await params;
  const filePath = resolveUploadPath(resolvedParams.path);
  if (!filePath) {
    return new NextResponse('Not found', { status: 404 });
  }

  let stat;
  try {
    stat = await fs.stat(/* turbopackIgnore: true */ filePath);
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  if (!stat.isFile() || stat.size === 0) {
    return new NextResponse('Not found', { status: 404 });
  }

  const data = await fs.readFile(/* turbopackIgnore: true */ filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream';

  return new NextResponse(data, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(data.length),
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Content-Security-Policy':
        "sandbox; default-src 'none'; img-src 'self' data:;",
    },
  });
}