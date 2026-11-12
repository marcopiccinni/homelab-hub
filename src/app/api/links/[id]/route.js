import db from '../../../../lib/db';
import { NextResponse } from 'next/server';

export async function PUT(request, { params }) {
    try {
        const { id } = params;
        const { title, url, icon, color, sort_order, visible, is_folder, folder_id } = await request.json();

        db.prepare(
            'UPDATE links SET title = ?, url = ?, icon = ?, color = ?, sort_order = ?, visible = ?, is_folder = ?, folder_id = ? WHERE id = ?'
        ).run(title, url || '', icon || null, color || null, sort_order, visible ?? 1, is_folder ? 1 : 0, folder_id || null, id);

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const { id } = params;
        db.prepare('DELETE FROM links WHERE id = ?').run(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
