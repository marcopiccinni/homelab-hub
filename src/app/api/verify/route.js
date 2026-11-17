import { NextResponse } from 'next/server';
import { assertSafeFetchUrl, safeFetch, readTextLimited } from '../../../lib/ssrf';
import { jsonError } from '../../../lib/api-error';
import { cacheRemoteIcon } from '../../../lib/icon-cache';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    try {
        let { url } = await request.json();

        if (!url || typeof url !== 'string') {
            return jsonError(400, 'URL obbligatorio');
        }

        url = url.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url;
        }

        const safe = await assertSafeFetchUrl(url);
        if (!safe.ok) {
            return NextResponse.json({
                reachable: false,
                error: 'URL non consentito',
                iconUrl: null,
                finalUrl: url,
            });
        }

        try {
            const { response, finalUrl } = await safeFetch(safe.url.href, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; HomelabHub/1.0; +https://github.com/marcopiccinni/homelab-hub)',
                },
                cache: 'no-store',
            });

            const reachable = response.ok || (response.status > 0 && response.status < 400);
            const html = await readTextLimited(response);
            const origin = new URL(finalUrl).origin;

            let iconUrl = null;

            const iconRegex = /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i;
            const appleIconRegex = /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i;

            const match = html.match(appleIconRegex) || html.match(iconRegex);

            if (match && match[1]) {
                iconUrl = match[1];
                if (iconUrl.startsWith('//')) iconUrl = 'http:' + iconUrl;
                else if (iconUrl.startsWith('/')) iconUrl = origin + iconUrl;
                else if (!iconUrl.startsWith('http')) iconUrl = origin + '/' + iconUrl;
            }

            if (!iconUrl) {
                iconUrl = `${origin}/favicon.ico`;
            }

            const cachedIcon = await cacheRemoteIcon(iconUrl);

            return NextResponse.json({
                reachable,
                status: response.status,
                iconUrl: cachedIcon || iconUrl,
                finalUrl,
            });
        } catch (e) {
            console.error('Verify fetch error:', e);
            const origin = safe.url.origin;
            return NextResponse.json({
                reachable: false,
                error: 'URL non raggiungibile',
                iconUrl: `${origin}/favicon.ico`,
                finalUrl: url,
            });
        }
    } catch (error) {
        return jsonError(500, 'Errore interno del server', 'verify POST', error);
    }
}