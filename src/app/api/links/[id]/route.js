import db from '../../../../lib/db';
import { NextResponse } from 'next/server';
import { validateLinkUrl, validateIcon, validateColor } from '../../../../lib/validation';
import { jsonError } from '../../../../lib/api-error';

export async function PUT(request, { params }) {
    try {
        const { id } = params;
        const body = await request.json();
        const { title, sort_order, visible, is_folder, folder_id } = body;
        const isFolder = is_folder ? 1 : 0;

        if (!title || typeof title !== 'string' || !title.trim()) {
            return jsonError(400, 'Titolo obbligatorio');
        }

        let urlValue = '';
        if (!isFolder) {
            const urlCheck = validateLinkUrl(body.url, { allowEmpty: false });
            if (!urlCheck.ok) return jsonError(400, urlCheck.error);
            urlValue = urlCheck.value;
        }

        const iconCheck = validateIcon(isFolder ? null : body.icon);
        if (!iconCheck.ok) return jsonError(400, iconCheck.error);

        const colorCheck = validateColor(body.color);
        if (!colorCheck.ok) return jsonError(400, colorCheck.error);

        db.prepare(
            'UPDATE links SET title = ?, url = ?, icon = ?, color = ?, sort_order = ?, visible = ?, is_folder = ?, folder_id = ? WHERE id = ?'
        ).run(
            title.trim(),
            urlValue,
            iconCheck.value,
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
        const { id } = params;
        db.prepare('DELETE FROM links WHERE id = ?').run(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        return jsonError(500, 'Errore interno del server', 'links DELETE', error);
    }
}