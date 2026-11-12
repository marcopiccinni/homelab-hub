import db from '../../../lib/db';
import { NextResponse } from 'next/server';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const all = searchParams.get('all') === 'true';

        const query = all
            ? 'SELECT * FROM links ORDER BY sort_order ASC, created_at DESC'
            : 'SELECT * FROM links WHERE visible = 1 ORDER BY sort_order ASC, created_at DESC';

        const links = db.prepare(query).all();
        return NextResponse.json(links);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { title, url, icon, color, sort_order, visible, is_folder, folder_id } = await request.json();
        const info = db.prepare(
            'INSERT INTO links (title, url, icon, color, sort_order, visible, is_folder, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(title, url || '', icon || null, color || null, sort_order || 0, visible ?? 1, is_folder ? 1 : 0, folder_id || null);

        return NextResponse.json({ id: info.lastInsertRowid });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
export async function PATCH(request) {
    try {
        const { updates } = await request.json(); // Array of { id, sort_order, folder_id }
        
        const transaction = db.transaction((items) => {
            const stmt = db.prepare('UPDATE links SET sort_order = ?, folder_id = ? WHERE id = ?');
            for (const item of items) {
                stmt.run(item.sort_order, item.folder_id === undefined ? null : item.folder_id, item.id);
            }
        });

        transaction(updates);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
