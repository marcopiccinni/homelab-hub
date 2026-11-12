import db from '../../../lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const links = db.prepare('SELECT url FROM links').all();

        const hostsMap = {};

        links.forEach(({ url }) => {
            try {
                const parsed = new URL(url);
                const host = parsed.hostname;
                const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');

                if (!hostsMap[host]) {
                    hostsMap[host] = new Set();
                }
                hostsMap[host].add(port);
            } catch (e) {
                // Skip invalid URLs
            }
        });

        const report = Object.keys(hostsMap).map(host => ({
            host,
            ports: Array.from(hostsMap[host]).sort((a, b) => parseInt(a) - parseInt(b))
        })).sort((a, b) => a.host.localeCompare(b.host));

        return NextResponse.json(report);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
