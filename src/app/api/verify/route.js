import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        let { url } = await request.json();

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        try {
            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                cache: 'no-store'
            });

            clearTimeout(timeoutId);

            const reachable = response.ok || response.status < 400;
            const html = await response.text();
            const origin = new URL(url).origin;

            let iconUrl = null;

            // Extract icon from HTML
            const iconRegex = /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i;
            const appleIconRegex = /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i;

            let match = html.match(appleIconRegex) || html.match(iconRegex);

            if (match && match[1]) {
                iconUrl = match[1];
                if (iconUrl.startsWith('//')) iconUrl = 'http:' + iconUrl;
                else if (iconUrl.startsWith('/')) iconUrl = origin + iconUrl;
                else if (!iconUrl.startsWith('http')) iconUrl = origin + '/' + iconUrl;
            }

            // If no icon found in HTML, try the standard location
            if (!iconUrl) {
                iconUrl = `${origin}/favicon.ico`;
            }

            return NextResponse.json({
                reachable,
                status: response.status,
                iconUrl,
                finalUrl: url
            });
        } catch (e) {
            clearTimeout(timeoutId);
            const origin = new URL(url).origin;
            return NextResponse.json({
                reachable: false,
                error: "URL non raggiungibile",
                iconUrl: `${origin}/favicon.ico`, // Still try standard location
                finalUrl: url
            });
        }
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
