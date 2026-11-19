import { importMercusysClientsToQueue } from '../../../../../lib/assets/mercusys';

export const dynamic = 'force-dynamic';

export async function POST() {
  const result = await importMercusysClientsToQueue();
  const status = result.ok ? 200 : 502;
  return Response.json(result, { status });
}