import * as XLSX from 'xlsx';
import { normalizeMac, parseMacOrZigbee } from './mac.js';
import { upsertAssetFromImport, resolveSubnetIdForIp } from './repository.js';

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function rowEmpty(row) {
  return !row || row.every((c) => !String(c ?? '').trim());
}

function subnetMap(subnets) {
  const m = new Map();
  for (const s of subnets) {
    if (s.cidr) m.set(s.cidr.replace(/\.0\/24$/, '.0.0/24'), s.id);
    m.set(s.family_label?.toLowerCase(), s.id);
    if (s.cidr) m.set(s.cidr.toLowerCase(), s.id);
  }
  return m;
}

function parseAreaSubnet(area, subnets) {
  const a = String(area || '').trim();
  const digit = a.match(/^(\d+)/)?.[1];
  if (digit) {
    const hit = subnets.find((s) => s.sort_order === parseInt(digit, 10));
    if (hit) return hit.id;
  }
  return null;
}

export function parseWorkbookPreview(buffer, subnets) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const preview = { sheets: wb.SheetNames, assets: 0, services: 0, rows: [] };

  if (wb.SheetNames.includes('All')) {
    const sheet = wb.Sheets.All;
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const headerIdx = data.findIndex((r) =>
      r.some((c) => normalizeHeader(c) === 'id')
    );
    if (headerIdx >= 0) {
      const headers = data[headerIdx].map(normalizeHeader);
      const col = (name) => headers.indexOf(name);
      for (let i = headerIdx + 1; i < data.length; i++) {
        const r = data[i];
        if (rowEmpty(r)) continue;
        const id = parseInt(r[col('id')], 10);
        const name = String(r[col('name')] || '').trim();
        if (!name && !id) continue;
        const ip = String(r[col('ip')] || '').trim();
        if (ip && !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) continue;
        if (!name) continue;
        preview.assets += 1;
        if (preview.rows.length < 8) {
          preview.rows.push({ id, name, ip: ip || null });
        }
      }
    }
  }
  if (wb.SheetNames.includes('Services')) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets.Services, { header: 1, defval: '' });
    preview.services = data.filter((r) => r.some((c) => String(c).trim())).length - 1;
  }
  return preview;
}

export function importWorkbook(buffer, subnets) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const stats = { assets: 0, services: 0, skipped: 0 };
  const smap = subnetMap(subnets);

  if (wb.SheetNames.includes('All')) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets.All, { header: 1, defval: '' });
    const headerIdx = data.findIndex((r) =>
      r.some((c) => normalizeHeader(c) === 'id')
    );
    if (headerIdx >= 0) {
      const headers = data[headerIdx].map(normalizeHeader);
      const col = (name) => headers.indexOf(name);
      for (let i = headerIdx + 1; i < data.length; i++) {
        const r = data[i];
        if (rowEmpty(r)) continue;
        const code = parseInt(r[col('id')], 10);
        const name = String(r[col('name')] || '').trim();
        const ip = String(r[col('ip')] || '').trim();
        const fqdn = String(r[col('fqdn')] || '').trim();
        const pos =
          String(
            r[col('posizione')] ||
              r[col('position')] ||
              r[col('location')] ||
              ''
          ).trim();
        const notes = String(r[col('notes')] || '').trim();
        const area = r[col('area')];
        const macCell = r[col('mac')];
        const { mac, ieee } = parseMacOrZigbee(String(macCell || ''));

        if (!name || Number.isNaN(code)) {
          stats.skipped += 1;
          continue;
        }
        if (ip && !/^\d+\.\d+\.\d+\.\d+$/.test(ip) && !ieee) {
          stats.skipped += 1;
          continue;
        }
        if (!ip && !ieee) {
          stats.skipped += 1;
          continue;
        }

        const subnetId =
          (ip && resolveSubnetIdForIp(ip)) ||
          parseAreaSubnet(area, subnets) ||
          (ieee ? subnets.find((s) => s.is_non_ip)?.id : null);
        const category =
          String(area || '')
            .replace(/^\d+\s*/, '')
            .trim() || null;

        upsertAssetFromImport(
          {
            asset_code: code,
            name,
            ip: ip || null,
            fqdn: fqdn || null,
            mac,
            ieee,
            location: pos,
            notes,
            category,
            subnet_id: subnetId,
            zigbee_model: fqdn && ieee ? fqdn : null,
          },
          smap
        );
        stats.assets += 1;
      }
    }
  }

  return stats;
}