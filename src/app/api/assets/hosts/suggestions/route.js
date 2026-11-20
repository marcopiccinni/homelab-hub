import { suggestHostAssociations } from '../../../../../lib/assets/host-view';

export const dynamic = 'force-dynamic';

export async function GET() {
  const suggestions = await suggestHostAssociations();
  return Response.json({ suggestions });
}