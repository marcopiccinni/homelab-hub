import { addInterface, deleteInterface } from '../../../../../lib/assets/crud';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const assetId = parseInt((await params).id, 10);
  if (Number.isNaN(assetId)) {
    return Response.json({ error: 'ID non valido' }, { status: 400 });
  }
  try {
    const body = await request.json();
    const id = addInterface(assetId, body);
    return Response.json({ id });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

export async function DELETE(request, { params }) {
  await params;
  const { searchParams } = new URL(request.url);
  const ifaceId = parseInt(searchParams.get('ifaceId') || '', 10);
  if (Number.isNaN(ifaceId)) {
    return Response.json({ error: 'ifaceId richiesto' }, { status: 400 });
  }
  deleteInterface(ifaceId);
  return Response.json({ ok: true });
}