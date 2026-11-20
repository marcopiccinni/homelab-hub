import { listSubnets } from '../../../../../lib/assets/repository';
import { parseWorkbookPreview } from '../../../../../lib/assets/excel-import';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'File mancante' }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const preview = parseWorkbookPreview(buf, listSubnets());
    return Response.json(preview);
  } catch (err) {
    console.error('[assets/import/preview]', err);
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Anteprima fallita: ${message}` }, { status: 400 });
  }
}