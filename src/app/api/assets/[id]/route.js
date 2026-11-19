import { getAssetDetail } from '../../../../lib/assets/repository';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { id: idRaw } = await params;
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) {
    return Response.json({ error: 'ID non valido' }, { status: 400 });
  }
  const detail = getAssetDetail(id);
  if (!detail) {
    return Response.json({ error: 'Asset non trovato' }, { status: 404 });
  }
  return Response.json(detail);
}