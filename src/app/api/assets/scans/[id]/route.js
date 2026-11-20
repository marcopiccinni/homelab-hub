import { cancelScanJob, retryScanJob, getScanJob } from '../../../../../lib/assets/nmap-runner';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) {
    return Response.json({ error: 'ID non valido' }, { status: 400 });
  }
  const job = getScanJob(id);
  if (!job) return Response.json({ error: 'Job non trovato' }, { status: 404 });
  return Response.json({ job });
}

export async function POST(request, { params }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) {
    return Response.json({ error: 'ID non valido' }, { status: 400 });
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const action = body.action;
  try {
    if (action === 'cancel') {
      const result = cancelScanJob(id);
      return Response.json(result);
    }
    if (action === 'retry') {
      const result = retryScanJob(id);
      return Response.json(result);
    }
    return Response.json({ error: 'Azione non supportata' }, { status: 400 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}