import { assignIp, linkFqdnToIp } from '../../../../../lib/assets/crud';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { id: idRaw } = await params;
  const assetId = parseInt(idRaw, 10);
  if (Number.isNaN(assetId)) {
    return Response.json({ error: 'ID non valido' }, { status: 400 });
  }
  try {
    const body = await request.json();
    const address = String(body.address || '').trim();
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
      return Response.json({ error: 'IP non valido' }, { status: 400 });
    }
    const ipId = assignIp(assetId, address);
    if (body.fqdn) {
      linkFqdnToIp(String(body.fqdn).trim(), address);
    }
    return Response.json({ ipId });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}