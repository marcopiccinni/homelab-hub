import { listAssets, listSubnets } from '../../../lib/assets/repository';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const subnetId = searchParams.get('subnetId');
  const subnets = listSubnets();
  const assets = listAssets({
    q,
    subnetId: subnetId ? parseInt(subnetId, 10) : null,
  });
  return Response.json({ assets, subnets });
}