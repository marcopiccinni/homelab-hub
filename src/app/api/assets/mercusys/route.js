import { fetchMercusysClients, mercusysStatus } from '../../../../lib/assets/mercusys';

export const dynamic = 'force-dynamic';

/** Stato config; `?probe=1` testa login lato server (mai espone password). */
export async function GET(request) {
  const status = mercusysStatus();
  if (new URL(request.url).searchParams.get('probe') === '1') {
    const probe = await fetchMercusysClients();
    return Response.json({ ...status, ...probe });
  }
  return Response.json(status);
}