import { documentObservedPort } from '../../../../../lib/assets/crud';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const observedId = parseInt(body.observedId, 10);
    if (Number.isNaN(observedId)) {
      return Response.json({ error: 'observedId richiesto' }, { status: 400 });
    }
    const declaredId = documentObservedPort(observedId, {
      name: body.name,
      link_id: body.link_id || null,
    });
    return Response.json({ declaredId });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}