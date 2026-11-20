import * as XLSX from 'xlsx';
import { parseMacOrZigbee } from './mac.js';
import { getDb } from '../db.js';
import { addDeclaredService } from './crud.js';
import { linkFqdnToIp } from './crud.js';
import { upsertAssetFromImport, resolveSubnetIdForIp } from './repository.js';
import { upsertSubnet } from './crud.js';

function normalizeHeader(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function rowEmpty(row) {
  return !row || row.every((c) => !String(c ?? '').trim());
}

function isDashOrEmpty(v) {
  const t = String(v ?? '').trim();
  return !t || t === '-' || t === '—';
}

function cellStr(row, idx) {
  if (idx < 0 || idx >= row.length) return '';
  const v = row[idx];
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** ID numerico da cella Excel (numero, '0001', '40000'). */
export function parseAssetCode(cell) {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number' && Number.isFinite(cell)) return Math.trunc(cell);
  const s = String(cell).trim();
  if (isDashOrEmpty(s)) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return null;
}

function normalizeCidr(raw) {
  const t = String(raw ?? '').trim();
  if (isDashOrEmpty(t)) return null;
  if (t.includes('/')) return t;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(t)) return `${t}/24`;
  return t;
}

function findHeaderRow(data, required) {
  for (let i = 0; i < data.length; i++) {
    const norms = data[i].map(normalizeHeader);
    const hit = required.every((name) => norms.includes(name));
    if (hit) return i;
  }
  return -1;
}

function buildColMap(headers) {
  const norms = headers.map(normalizeHeader);
  const col = (name) => norms.indexOf(normalizeHeader(name));
  return { col, norms };
}

function parseAreaSubnet(area, subnets) {
  const a = String(area ?? '').trim();
  if (!a) return null;
  const digit = a.match(/^(\d+)/)?.[1];
  if (digit !== undefined) {
    const order = parseInt(digit, 10);
    const hit = subnets.find((s) => s.sort_order === order);
    if (hit) return hit.id;
  }
  const low = a.toLowerCase();
  if (low.includes('zigbee')) {
    return subnets.find((s) => s.is_non_ip)?.id ?? null;
  }
  return null;
}

/** Righe inventario IP (.0-.255) con solo Area/ID/IP valorizzati. */
function isAllSheetGridRow(row, col) {
  const name = cellStr(row, col('name'));
  const mac = cellStr(row, col('mac'));
  const fqdn = cellStr(row, col('fqdn'));
  const pos = cellStr(row, col('posizione'));
  const notes = cellStr(row, col('notes'));
  const ip = cellStr(row, col('ip'));
  const hasIp = /^\d+\.\d+\.\d+\.\d+$/.test(ip);
  if (!hasIp) return false;
  const detailEmpty =
    isDashOrEmpty(name) &&
    isDashOrEmpty(mac) &&
    isDashOrEmpty(fqdn) &&
    isDashOrEmpty(pos) &&
    isDashOrEmpty(notes);
  return detailEmpty;
}

function parseAllAssetRow(row, col, subnets) {
  if (isAllSheetGridRow(row, col)) {
    return { kind: 'grid' };
  }
  const code = parseAssetCode(row[col('id')]);
  const area = row[col('area')];
  let name = cellStr(row, col('name'));
  const ipRaw = cellStr(row, col('ip'));
  const ip = isDashOrEmpty(ipRaw) ? '' : ipRaw;
  const fqdnRaw = cellStr(row, col('fqdn'));
  const fqdn = isDashOrEmpty(fqdnRaw) ? '' : fqdnRaw;
  const pos = cellStr(row, col('posizione'));
  const notes = cellStr(row, col('notes'));
  const macCell = row[col('mac')];
  const { mac, ieee } = parseMacOrZigbee(String(macCell ?? ''));

  if (code === null && !mac && !ieee) {
    return { kind: 'skip', reason: 'no_id_or_mac' };
  }
  if (ip && !/^\d+\.\d+\.\d+\.\d+$/.test(ip) && !ieee) {
    return { kind: 'skip', reason: 'bad_ip' };
  }
  if (!ip && !ieee) {
    return { kind: 'skip', reason: 'no_ip_or_zigbee' };
  }
  if (isDashOrEmpty(name)) {
    name = fqdn || (code !== null ? `Asset ${code}` : ieee ? `Zigbee ${ieee.slice(-8)}` : 'Senza nome');
  }
  const subnetId =
    (ip && resolveSubnetIdForIp(ip)) ||
    parseAreaSubnet(area, subnets) ||
    (ieee ? subnets.find((s) => s.is_non_ip)?.id : null);
  const category =
    String(area ?? '')
      .replace(/^\d+\s*/, '')
      .trim() || null;

  return {
    kind: 'asset',
    payload: {
      asset_code: code,
      name,
      ip: ip || null,
      fqdn: fqdn || null,
      mac,
      ieee,
      location: isDashOrEmpty(pos) ? null : pos,
      notes: isDashOrEmpty(notes) ? null : notes,
      category,
      subnet_id: subnetId,
      zigbee_model: fqdn && ieee ? fqdn : null,
    },
  };
}

function importGeneralSheet(wb, subnets, stats, dryRun) {
  if (!wb.SheetNames.includes('General')) return;
  const data = XLSX.utils.sheet_to_json(wb.Sheets.General, { header: 1, defval: '' });
  for (const r of data) {
    const label0 = normalizeHeader(r[0]);
    if (label0 === 'ordine' || label0 === 'id' || label0 === 'mac') continue;
    if (label0 === 'name' || (label0 === '' && normalizeHeader(r[1]) === 'name')) break;

    const order = parseAssetCode(r[0]);
    const family = cellStr(r, 1);
    const cidrRaw = cellStr(r, 2);
    if (order === null && isDashOrEmpty(family)) continue;
    if (isDashOrEmpty(family)) continue;

    if (isDashOrEmpty(cidrRaw)) {
      if (family.toLowerCase().includes('zigbee')) {
        const existing = subnets.find((s) => s.is_non_ip);
        if (dryRun) {
          stats.subnets_updated += existing ? 1 : 0;
          stats.subnets_new += existing ? 0 : 1;
        } else if (existing) {
          upsertSubnet({
            id: existing.id,
            sort_order: order ?? existing.sort_order,
            family_label: family,
            cidr: null,
            is_non_ip: true,
          });
          stats.subnets_updated += 1;
        } else {
          upsertSubnet({
            sort_order: order ?? 40,
            family_label: family,
            cidr: null,
            is_non_ip: true,
            content_examples: cellStr(r, 3) || null,
            notes: cellStr(r, 4) || null,
          });
          stats.subnets_new += 1;
        }
      }
      continue;
    }

    const cidr = normalizeCidr(cidrRaw);
    if (!cidr || !cidr.includes('/')) continue;

    let existing = null;
    if (cidr) {
      existing = subnets.find((s) => s.cidr?.toLowerCase() === cidr.toLowerCase()) || null;
    }
    if (!existing && order !== null) {
      const byOrder = subnets.find((s) => s.sort_order === order);
      if (byOrder) {
        if (!cidr || !byOrder.cidr || byOrder.cidr.toLowerCase() === cidr.toLowerCase()) {
          existing = byOrder;
        }
      }
    }
    if (dryRun) {
      stats.subnets_updated += existing ? 1 : 0;
      stats.subnets_new += existing ? 0 : 1;
      continue;
    }
    if (existing) {
      upsertSubnet({
        id: existing.id,
        sort_order: order ?? existing.sort_order,
        family_label: family,
        cidr,
        content_examples: cellStr(r, 3) || null,
        notes: cellStr(r, 4) || null,
      });
      stats.subnets_updated += 1;
    } else {
      upsertSubnet({
        sort_order: order ?? 0,
        family_label: family,
        cidr,
        content_examples: cellStr(r, 3) || null,
        notes: cellStr(r, 4) || null,
      });
      stats.subnets_new += 1;
    }
    if (!dryRun) {
      subnets = getDb().prepare('SELECT * FROM subnets ORDER BY sort_order').all();
    }
  }
}

function importAllSheet(wb, subnets, stats, dryRun) {
  if (!wb.SheetNames.includes('All')) return;
  const data = XLSX.utils.sheet_to_json(wb.Sheets.All, { header: 1, defval: '' });
  const headerIdx = findHeaderRow(data, ['id', 'ip']);
  if (headerIdx < 0) {
    stats.errors = stats.errors || [];
    stats.errors.push('Foglio All: intestazioni ID/IP non trovate');
    return;
  }
  const { col } = buildColMap(data[headerIdx]);

  for (let i = headerIdx + 1; i < data.length; i++) {
    const r = data[i];
    if (rowEmpty(r)) continue;
    const parsed = parseAllAssetRow(r, col, subnets);
    if (parsed.kind === 'grid') {
      stats.grid_rows += 1;
      continue;
    }
    if (parsed.kind === 'skip') {
      stats.skipped += 1;
      continue;
    }
    if (dryRun) {
      const exists =
        parsed.payload.asset_code !== null
          ? getDb().prepare('SELECT id FROM assets WHERE asset_code=?').get(parsed.payload.asset_code)
          : null;
      if (exists) stats.assets_updated += 1;
      else stats.assets_new += 1;
      continue;
    }
    const result = upsertAssetFromImport(parsed.payload, null);
    if (result.created) stats.assets_new += 1;
    else stats.assets_updated += 1;
  }
}

function importServicesSheet(wb, stats, dryRun) {
  if (!wb.SheetNames.includes('Services')) return;
  const db = getDb();
  const data = XLSX.utils.sheet_to_json(wb.Sheets.Services, { header: 1, defval: '' });
  const headerIdx = findHeaderRow(data, ['name', 'port']);
  if (headerIdx < 0) return;
  const { col } = buildColMap(data[headerIdx]);

  for (let i = headerIdx + 1; i < data.length; i++) {
    const r = data[i];
    if (rowEmpty(r)) continue;
    const name = cellStr(r, col('name'));
    if (!name) continue;
    const portCell = r[col('port')];
    const port = typeof portCell === 'number' ? Math.trunc(portCell) : parseInt(String(portCell).trim(), 10);
    if (Number.isNaN(port)) {
      stats.skipped += 1;
      continue;
    }
    const ip = cellStr(r, col('ip'));
    const fqdn = cellStr(r, col('fqdn')) || cellStr(r, col('url dns'));
    const url = cellStr(r, col('url'));
    const inRaw = cellStr(r, col('in intranet'));
    const inIntranet = /^y/i.test(inRaw);
    let linkId = null;
    if (inIntranet) {
      const link = db.prepare('SELECT id FROM links WHERE title=?').get(name);
      linkId = link?.id || null;
    }
    if (dryRun) {
      stats.services += 1;
      continue;
    }
    let ipId = null;
    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip) && resolveSubnetIdForIp(ip)) {
      const linked = linkFqdnToIp(fqdn || ip, ip);
      ipId = linked.ipId;
    }
    addDeclaredService({
      name,
      port,
      url: url || null,
      description: cellStr(r, col('description')) || null,
      notes: cellStr(r, col('notes')) || null,
      in_intranet: inIntranet,
      link_id: linkId,
      ip_id: ipId,
      fqdn_id: null,
    });
    stats.services += 1;
  }
}

function emptyStats() {
  return {
    assets_new: 0,
    assets_updated: 0,
    services: 0,
    skipped: 0,
    grid_rows: 0,
    subnets_updated: 0,
    subnets_new: 0,
    errors: [],
  };
}

export function parseWorkbookPreview(buffer, subnets) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const stats = emptyStats();
  importGeneralSheet(wb, subnets, stats, true);
  importAllSheet(wb, subnets, stats, true);
  importServicesSheet(wb, stats, true);

  const preview = {
    sheets: wb.SheetNames,
    assets_new: stats.assets_new,
    assets_updated: stats.assets_updated,
    assets: stats.assets_new + stats.assets_updated,
    services: stats.services,
    subnets_new: stats.subnets_new,
    subnets_updated: stats.subnets_updated,
    skipped: stats.skipped,
    grid_rows: stats.grid_rows,
    errors: stats.errors,
    rows: [],
  };

  if (wb.SheetNames.includes('All')) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets.All, { header: 1, defval: '' });
    const headerIdx = findHeaderRow(data, ['id', 'ip']);
    if (headerIdx >= 0) {
      const { col } = buildColMap(data[headerIdx]);
      for (let i = headerIdx + 1; i < data.length && preview.rows.length < 10; i++) {
        const parsed = parseAllAssetRow(data[i], col, subnets);
        if (parsed.kind === 'asset') {
          preview.rows.push({
            id: parsed.payload.asset_code,
            name: parsed.payload.name,
            ip: parsed.payload.ip,
          });
        }
      }
    }
  }
  return preview;
}

export function importWorkbook(buffer, subnets) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const stats = emptyStats();
  importGeneralSheet(wb, subnets, stats, false);
  subnets = getDb().prepare('SELECT * FROM subnets ORDER BY sort_order').all();
  importAllSheet(wb, subnets, stats, false);
  importServicesSheet(wb, stats, false);
  stats.assets = stats.assets_new + stats.assets_updated;
  return stats;
}