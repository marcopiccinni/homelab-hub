import { getDb } from '../../../../lib/db';
import { NextResponse } from 'next/server';
import { validateIcon, validateColor } from '../../../../lib/validation';
import { jsonError } from '../../../../lib/api-error';
import { cacheRemoteIcon } from '../../../../lib/icon-cache';
import { parseLinkUrlFields } from '../../../../lib/link-payload';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
    try {
        const { id } = (await params);
        const body = await request.json();
        const { title, sort_order, visible, is_folder, folder_id } = body;
        const isFolder = is_folder ? 1 : 0;

        if (!title || typeof title !== 'string' || !title.trim()) {
            return jsonError(400, 'Titolo obbligatorio');
        }

        const urlFields = parseLinkUrlFields(body, { isFolder: isFolder === 1 });
        if (!urlFields.ok) return jsonError(400, urlFields.error);

        const iconCheck = validateIcon(isFolder ? null : body.icon);
        if (!iconCheck.ok) return jsonError(400, iconCheck.error);

        const colorCheck = validateColor(body.color);
        if (!colorCheck.ok) return jsonError(400, colorCheck.error);

        let iconValue = iconCheck.value;
        if (iconValue && /^https?:\/\//i.test(iconValue)) {
            const cached = await cacheRemoteIcon(iconValue);
            if (cached) iconValue = cached;
        }

        getDb().prepare(
            `UPDATE links SET
              title = ?, url = ?, url_external = ?, url_local_fqdn = ?, url_ip = ?, access_type = ?,
              icon = ?, color = ?, sort_order = ?, visible = ?, is_folder = ?, folder_id = ?
             WHERE id = ?`
        ).run(
            title.trim(),
            urlFields.url,
            urlFields.url_external,
            urlFields.url_local_fqdn,
            urlFields.url_ip,
            urlFields.access_type,
            iconValue,
            colorCheck.value,
            sort_order,
            visible ?? 1,
            isFolder,
            folder_id || null,
            id
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        return jsonError(500, 'Errore interno del server', 'links PUT', error);
    }
}

export async function DELETE(request, { params }) {
    try {
        const { id } = (await params);
        getDb().prepare('DELETE FROM links WHERE id = ?').run(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        return jsonError(500, 'Errore interno del server', 'links DELETE', error);
    }
}