import { listAssets, listSubnets } from '../../../lib/assets/repository';
import { createAsset, suggestCategories, suggestLocations } from '../../../lib/assets/crud';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const subnetId = searchParams.get('subnetId');
  const category = searchParams.get('category');
  const location = searchParams.get('location');
  const online = searchParams.get('online');
  const sort = searchParams.get('sort') || 'code';
  const status = searchParams.get('status') || 'active';
  const subnets = listSubnets();
  const assets = listAssets({
    q,
    subnetId: subnetId ? parseInt(subnetId, 10) : null,
    category: category || null,
    location: location || null,
    online: online || null,
    sort,
    status,
  });
  return Response.json({
    assets,
    subnets,
    suggestions: { categories: suggestCategories(), locations: suggestLocations() },
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body?.name?.trim()) {
      return Response.json({ error: 'Nome obbligatorio' }, { status: 400 });
    }
    const id = createAsset(body);
    return Response.json({ id });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}