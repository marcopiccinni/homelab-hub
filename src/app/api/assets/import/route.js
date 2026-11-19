import { listSubnets } from '../../../../lib/assets/repository';
import { importWorkbook } from '../../../../lib/assets/excel-import';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'File mancante' }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const stats = importWorkbook(buf, listSubnets());
  return Response.json({ ok: true, stats });
}