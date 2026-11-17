import { NextResponse } from 'next/server';
import { jsonError } from '../../../lib/api-error';
import { getNetworkHostsReport } from '../../../lib/links-data';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const report = getNetworkHostsReport();
        return NextResponse.json(report);
    } catch (error) {
        return jsonError(500, 'Errore interno del server', 'network GET', error);
    }
}