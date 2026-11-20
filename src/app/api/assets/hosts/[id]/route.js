import { getHostView } from '../../../../../lib/assets/host-view';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { id: idRaw } = await params;
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) {
    return Response.json({ error: 'ID non valido' }, { status: 400 });
  }
  const view = getHostView(id);
  if (!view) return Response.json({ error: 'Asset non trovato' }, { status: 404 });
  return Response.json(view);
}