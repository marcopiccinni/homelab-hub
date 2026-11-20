import { mercusysStatus } from '../../../../lib/assets/mercusys';

export const dynamic = 'force-dynamic';

/** Solo stato configurazione — nessuna chiamata al router dal browser. */
export async function GET() {
  return Response.json(mercusysStatus());
}