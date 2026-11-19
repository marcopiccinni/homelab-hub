import { getAssetDetail } from '../../../../lib/assets/repository';
import { updateAsset, deleteAsset } from '../../../../lib/assets/crud';

export const dynamic = 'force-dynamic';

function parseId(params) {
  const id = parseInt(params.id, 10);
  return Number.isNaN(id) ? null : id;
}

export async function GET(_request, { params }) {
  const { id: idRaw } = await params;
  const id = parseId({ id: idRaw });
  if (id == null) {
    return Response.json({ error: 'ID non valido' }, { status: 400 });
  }
  const detail = getAssetDetail(id);
  if (!detail) {
    return Response.json({ error: 'Asset non trovato' }, { status: 404 });
  }
  return Response.json(detail);
}

export async function PUT(request, { params }) {
  const { id: idRaw } = await params;
  const id = parseId({ id: idRaw });
  if (id == null) {
    return Response.json({ error: 'ID non valido' }, { status: 400 });
  }
  try {
    const body = await request.json();
    updateAsset(id, body);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

export async function DELETE(_request, { params }) {
  const { id: idRaw } = await params;
  const id = parseId({ id: idRaw });
  if (id == null) {
    return Response.json({ error: 'ID non valido' }, { status: 400 });
  }
  deleteAsset(id);
  return Response.json({ ok: true });
}