import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { detectImageType, MAX_UPLOAD_BYTES } from '../../../lib/upload-utils';
import { jsonError } from '../../../lib/api-error';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file || typeof file === 'string') {
            return jsonError(400, 'Nessun file caricato');
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        if (buffer.length > MAX_UPLOAD_BYTES) {
            return jsonError(400, 'Il file supera la dimensione massima di 2 MB');
        }

        if (buffer.length === 0) {
            return jsonError(400, 'File vuoto');
        }

        const detected = detectImageType(buffer);
        if (!detected) {
            return jsonError(400, 'Tipo di immagine non consentito (consentiti: PNG, JPEG, WebP, GIF, ICO)');
        }

        const fileName = `${randomUUID()}${detected.ext}`;
        const uploadDir = path.join(process.cwd(), 'public', 'uploads');

        try {
            await fs.access(uploadDir);
        } catch {
            await fs.mkdir(uploadDir, { recursive: true });
        }

        const filePath = path.join(uploadDir, fileName);
        await fs.writeFile(filePath, buffer);

        return NextResponse.json({ url: `/uploads/${fileName}` });
    } catch (error) {
        return jsonError(500, 'Errore durante il caricamento', 'upload POST', error);
    }
}