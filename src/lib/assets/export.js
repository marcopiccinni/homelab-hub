import * as XLSX from 'xlsx';
import { getDb } from '../db.js';
import { listSubnets } from './repository.js';

export function buildExportRows() {
  const db = getDb();
  const subnets = listSubnets();
  const generalSubnet = subnets.map((s) => ({
    Ordine: s.sort_order,
    'Famiglia/Uso': s.family_label,
    'Subnet /24': s.cidr,
    'Contenuto/Esempi': s.content_examples,
    Note: s.notes,
  }));
  const assets = db
    .prepare(
      `SELECT a.asset_code AS ID, a.name AS Name, a.location AS Posizione, a.notes AS Notes,
              s.family_label AS Area, i.address AS IP, ai2.mac_address AS MAC
       FROM assets a
       LEFT JOIN subnets s ON s.id = a.primary_subnet_id
       LEFT JOIN asset_ip_assignments aia ON aia.asset_id = a.id
       LEFT JOIN ip_addresses i ON i.id = aia.ip_id
       LEFT JOIN asset_interfaces ai2 ON ai2.asset_id = a.id
       WHERE a.status='active'
       ORDER BY a.asset_code`
    )
    .all();
  const services = db
    .prepare(
      `SELECT d.name AS Name, d.url AS URL, f.fqdn, i.address AS IP, d.port, d.description AS Description, d.notes AS Notes,
              CASE WHEN d.in_intranet=1 THEN 'Y' ELSE 'N' END AS 'in Intranet'
       FROM declared_services d
       LEFT JOIN fqdns f ON f.id = d.fqdn_id
       LEFT JOIN ip_addresses i ON i.id = d.ip_id`
    )
    .all();
  return { generalSubnet, assets, services };
}

export function exportWorkbookBuffer() {
  const { generalSubnet, assets, services } = buildExportRows();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(generalSubnet),
    'General'
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assets), 'All');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(services), 'Services');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function exportCsvInventory() {
  const { assets } = buildExportRows();
  const ws = XLSX.utils.json_to_sheet(assets);
  return XLSX.utils.sheet_to_csv(ws);
}