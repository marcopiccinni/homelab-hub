import {
  importMercusysClientsToQueue,
  mercusysMockEnabled,
} from '../../../../../lib/assets/mercusys';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (mercusysMockEnabled()) {
    return Response.json(
      {
        ok: false,
        step: 'mock',
        error: 'MERCUSYS_MOCK attivo: import in coda disabilitato (solo test automatici).',
        imported: 0,
      },
      { status: 400 }
    );
  }
  const result = await importMercusysClientsToQueue();
  const status = result.ok ? 200 : 502;
  return Response.json(result, { status });
}