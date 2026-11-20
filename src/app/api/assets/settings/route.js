import { getMercusysRouterUrl, setSetting } from '../../../../lib/assets/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    mercusys_url: getMercusysRouterUrl() || '',
  });
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const url = String(body.mercusys_url ?? '').trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return Response.json(
        { error: 'URL router: usa http:// o https://' },
        { status: 400 }
      );
    }
    if (url) setSetting('mercusys_url', url.replace(/\/$/, ''));
    else setSetting('mercusys_url', '');
    return Response.json({ mercusys_url: getMercusysRouterUrl() || '' });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}