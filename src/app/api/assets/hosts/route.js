import { listHostsSummary } from '../../../../lib/assets/host-view';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const subnetId = parseInt(searchParams.get('subnetId') || '', 10);
  const q = searchParams.get('q') || '';
  const hosts = listHostsSummary({
    subnetId: Number.isNaN(subnetId) ? null : subnetId,
    q,
  });
  return Response.json({ hosts });
}