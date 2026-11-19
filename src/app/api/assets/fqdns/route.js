import { listFqdns } from '../../../../lib/assets/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ fqdns: listFqdns() });
}