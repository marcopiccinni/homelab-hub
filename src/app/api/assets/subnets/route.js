import { upsertSubnet, deleteSubnet } from '../../../../lib/assets/crud';
import { listSubnets } from '../../../../lib/assets/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ subnets: listSubnets() });
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body?.cidr || !body?.family_label) {
      return Response.json({ error: 'cidr e family_label obbligatori' }, { status: 400 });
    }
    const id = upsertSubnet(body);
    return Response.json({ id });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

export async function DELETE(request) {
  const id = parseInt(new URL(request.url).searchParams.get('id') || '', 10);
  if (Number.isNaN(id)) {
    return Response.json({ error: 'id richiesto' }, { status: 400 });
  }
  deleteSubnet(id);
  return Response.json({ ok: true });
}