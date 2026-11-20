import { enqueueHostScan } from '../../../../../../lib/assets/host-view';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { id: idRaw } = await params;
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) {
    return Response.json({ error: 'ID non valido' }, { status: 400 });
  }
  let profile = 'quick';
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.profile) profile = body.profile;
  } catch {
    /* empty */
  }
  try {
    const result = enqueueHostScan(id, profile);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}