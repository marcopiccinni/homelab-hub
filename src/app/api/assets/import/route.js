import { listSubnets } from '../../../../lib/assets/repository';
import { importWorkbook } from '../../../../lib/assets/excel-import';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'File mancante' }, { status: 400 });
  }
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const stats = importWorkbook(buf, listSubnets());
  if (!stats.assets && !stats.services && stats.subnets_new === 0 && stats.subnets_updated === 0) {
    return Response.json(
      {
        ok: false,
        error:
          'Nessun record importato. Controlla i fogli General/All/Services e le intestazioni.',
        stats,
      },
      { status: 422 }
    );
  }
    return Response.json({ ok: true, stats });
  } catch (err) {
    console.error('import assets:', err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}