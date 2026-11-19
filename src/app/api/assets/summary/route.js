import { getAssetSummary } from '../../../../lib/assets/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(getAssetSummary());
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Errore lettura riepilogo' }, { status: 500 });
  }
}