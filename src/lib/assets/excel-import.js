import * as XLSX from 'xlsx';
import { normalizeMac, parseMacOrZigbee } from './mac.js';
import { getDb } from '../db.js';
import { addDeclaredService } from './crud.js';
import { linkFqdnToIp } from './crud.js';
import { upsertAssetFromImport, resolveSubnetIdForIp } from './repository.js';
import { upsertSubnet } from './crud.js';

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

function isDashOrEmpty(v) {
  const t = String(v ?? '').trim();
  return !t || t === '-' || t === '—';
}

function importGeneralSheet(wb, subnets, stats, dryRun) {
  if (!wb.SheetNames.includes('General')) return;
  const data = XLSX.utils.sheet_to_json(wb.Sheets.General, { header: 1, defval: '' });
  for (const r of data) {
    const order = parseInt(r[0], 10);
    const family = String(r[1] || '').trim();
    const cidr = String(r[2] || '').trim();
    if (!family || !cidr || Number.isNaN(order)) continue;
    const existing = subnets.find(
      (s) => s.cidr?.toLowerCase() === cidr.toLowerCase() || s.sort_order === order
    );
    if (dryRun) {
      stats.subnets_updated += existing ? 1 : 0;
      stats.subnets_new += existing ? 0 : 1;
      continue;
    }
    if (existing) {
      upsertSubnet({
        id: existing.id,
        sort_order: order,
        family_label: family,
        cidr,
        content_examples: String(r[3] || '').trim() || null,
        notes: String(r[4] || '').trim() || null,
      });
      stats.subnets_updated += 1;
    } else {
      upsertSubnet({
        sort_order: order,
        family_label: family,
        cidr,
        content_examples: String(r[3] || '').trim() || null,
        notes: String(r[4] || '').trim() || null,
      });
      stats.subnets_new += 1;
    }
  }
}

function importServicesSheet(wb, stats, dryRun) {
  if (!wb.SheetNames.includes('Services')) return;
  const db = getDb();
  const data = XLSX.utils.sheet_to_json(wb.Sheets.Services, { header: 1, defval: '' });
  const headerIdx = data.findIndex((r) =>
    r.some((c) => normalizeHeader(c) === 'name')
  );
  if (headerIdx < 0) return;
  const headers = data[headerIdx].map(normalizeHeader);
  const col = (n) => headers.indexOf(n);
  for (let i = headerIdx + 1; i < data.length; i++) {
    const r = data[i];
    if (rowEmpty(r)) continue;
    const name = String(r[col('name')] || '').trim();
    if (!name) continue;
    const port = parseInt(r[col('port')], 10);
    if (Number.isNaN(port)) {
      stats.skipped += 1;
      continue;
    }
    const ip = String(r[col('ip')] || '').trim();
    const fqdn = String(r[col('fqdn')] || r[col('url dns')] || '').trim();
    const url = String(r[col('url')] || '').trim();
    const inIntranet = /^y/i.test(String(r[col('in intranet')] || ''));
    let linkId = null;
    if (inIntranet) {
      const link = db.prepare('SELECT id FROM links WHERE title=?').get(name);
      linkId = link?.id || null;
    }
  let ipId = null;
  let fqdnId = null;
  if (!dryRun) {
    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      const linked = linkFqdnToIp(fqdn || `${ip}`, ip);
      ipId = linked.ipId;
      fqdnId = fqdn ? linked.fqdnId : null;
    }
    addDeclaredService({
      name,
      port,
      url: url || null,
      description: String(r[col('description')] || '').trim() || null,
      notes: String(r[col('notes')] || '').trim() || null,
      in_intranet: inIntranet,
      link_id: linkId,
      ip_id: ipId,
      fqdn_id: fqdnId,
    });
  }
    stats.services += 1;
  }
}

export function parseWorkbookPreview(buffer, subnets) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const preview = {
    sheets: wb.SheetNames,
    assets: 0,
    services: 0,
    subnets_new: 0,
    subnets_updated: 0,
    skipped: 0,
    rows: [],
  };

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
        const macCell = String(r[col('mac')] || '');
        if (isDashOrEmpty(ip) && isDashOrEmpty(macCell)) continue;
        if (ip && ip !== '-' && !/^\d+\.\d+\.\d+\.\d+$/.test(ip) && !/^zigbee:/i.test(macCell))
          continue;
        if (!name) continue;
        preview.assets += 1;
        if (preview.rows.length < 8) {
          preview.rows.push({ id, name, ip: ip || null });
        }
      }
    }
  }
  const dry = { assets: 0, services: 0, subnets_updated: 0, subnets_new: 0, skipped: 0 };
  importGeneralSheet(wb, subnets, dry, true);
  preview.subnets_new = dry.subnets_new;
  preview.subnets_updated = dry.subnets_updated;
  importServicesSheet(wb, dry, true);
  preview.services = dry.services;
  return preview;
}

export function importWorkbook(buffer, subnets) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const stats = { assets: 0, services: 0, skipped: 0, subnets_updated: 0, subnets_new: 0 };
  const smap = subnetMap(subnets);
  importGeneralSheet(wb, subnets, stats, false);
  subnets = getDb().prepare('SELECT * FROM subnets ORDER BY sort_order').all();

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
        const ipRaw = String(r[col('ip')] || '').trim();
        const ip = isDashOrEmpty(ipRaw) ? '' : ipRaw;
        const fqdnRaw = String(r[col('fqdn')] || '').trim();
        const fqdn = isDashOrEmpty(fqdnRaw) ? '' : fqdnRaw;
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

  importServicesSheet(wb, stats, false);
  return stats;
}