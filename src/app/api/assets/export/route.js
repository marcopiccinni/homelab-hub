import { exportCsvInventory, exportWorkbookBuffer } from '../../../../lib/assets/export';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const format = new URL(request.url).searchParams.get('format') || 'xlsx';
  if (format === 'csv') {
    const csv = exportCsvInventory();
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="inventario.csv"',
      },
    });
  }
  const buf = exportWorkbookBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="inventario.xlsx"',
    },
  });
}