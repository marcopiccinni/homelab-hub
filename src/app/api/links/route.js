import { getDb } from '../../../lib/db';
import { NextResponse } from 'next/server';
import { validateLinkUrl, validateIcon, validateColor } from '../../../lib/validation';
import { jsonError } from '../../../lib/api-error';
import { cacheRemoteIcon } from '../../../lib/icon-cache';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const all = searchParams.get('all') === 'true';

        const query = all
            ? 'SELECT * FROM links ORDER BY sort_order ASC, created_at DESC'
            : 'SELECT * FROM links WHERE visible = 1 ORDER BY sort_order ASC, created_at DESC';

        const links = getDb().prepare(query).all();
        return NextResponse.json(links);
    } catch (error) {
        return jsonError(500, 'Errore interno del server', 'links GET', error);
    }
}

export async function POST(request) {
    try {
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

        let iconValue = iconCheck.value;
        if (iconValue && /^https?:\/\//i.test(iconValue)) {
            const cached = await cacheRemoteIcon(iconValue);
            if (cached) iconValue = cached;
        }

        const info = getDb().prepare(
            'INSERT INTO links (title, url, icon, color, sort_order, visible, is_folder, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            title.trim(),
            urlValue,
            iconValue,
            colorCheck.value,
            sort_order || 0,
            visible ?? 1,
            isFolder,
            folder_id || null
        );

        return NextResponse.json({ id: info.lastInsertRowid });
    } catch (error) {
        return jsonError(500, 'Errore interno del server', 'links POST', error);
    }
}

export async function PATCH(request) {
    try {
        const { updates } = await request.json();

        if (!Array.isArray(updates)) {
            return jsonError(400, 'Richiesta non valida');
        }

        const transaction = getDb().transaction((items) => {
            const stmtFull = getDb().prepare(
                'UPDATE links SET sort_order = ?, folder_id = ? WHERE id = ?'
            );
            const stmtOrder = getDb().prepare(
                'UPDATE links SET sort_order = ? WHERE id = ?'
            );
            for (const item of items) {
                if (Object.prototype.hasOwnProperty.call(item, 'folder_id')) {
                    stmtFull.run(
                        item.sort_order,
                        item.folder_id ?? null,
                        item.id
                    );
                } else {
                    stmtOrder.run(item.sort_order, item.id);
                }
            }
        });

        transaction(updates);
        return NextResponse.json({ success: true });
    } catch (error) {
        return jsonError(500, 'Errore interno del server', 'links PATCH', error);
    }
}