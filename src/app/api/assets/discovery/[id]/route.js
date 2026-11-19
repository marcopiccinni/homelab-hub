import {
  createAssetFromDiscovery,
  dismissDiscovery,
  mergeDiscoveryToAsset,
} from '../../../../../lib/assets/discovery';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) {
    return Response.json({ error: 'ID non valido' }, { status: 400 });
  }
  try {
    const body = await request.json();
    const action = body.action;
    if (action === 'dismiss') {
      dismissDiscovery(id);
      return Response.json({ ok: true });
    }
    if (action === 'create') {
      const assetId = createAssetFromDiscovery(id, body);
      return Response.json({ assetId });
    }
    if (action === 'merge') {
      const assetId = parseInt(body.assetId, 10);
      if (Number.isNaN(assetId)) {
        return Response.json({ error: 'assetId richiesto' }, { status: 400 });
      }
      mergeDiscoveryToAsset(id, assetId);
      return Response.json({ assetId });
    }
    return Response.json({ error: 'azione non valida' }, { status: 400 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}