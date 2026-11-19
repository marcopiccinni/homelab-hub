import { listDiscoveryQueue } from '../../../../lib/assets/discovery';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const status = new URL(request.url).searchParams.get('status') || 'pending';
  return Response.json({ items: listDiscoveryQueue(status) });
}