import { fetchMercusysClients, mercusysConfigured } from '../../../../lib/assets/mercusys';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await fetchMercusysClients();
  return Response.json({ configured: mercusysConfigured(), ...result });
}