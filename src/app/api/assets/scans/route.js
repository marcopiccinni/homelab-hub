import { enqueueScan, listScanJobs, getScanWorkerStatus } from '../../../../lib/assets/nmap-runner';
import { assertScanTargetAllowed } from '../../../../lib/assets/private-ip';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ jobs: listScanJobs(), worker: getScanWorkerStatus() });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const target = assertScanTargetAllowed(body.target);
    const profile = body.profile === 'full' ? 'full' : 'quick';
    const jobType = body.jobType === 'subnet' ? 'subnet' : 'host';
    const id = enqueueScan({ jobType, target, profile });
    return Response.json({ id, status: 'queued' });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}