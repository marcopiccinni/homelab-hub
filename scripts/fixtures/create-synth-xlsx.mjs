import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, 'synth-assets.xlsx');

const wb = XLSX.utils.book_new();
const all = [
  ['Area', 'ID', 'IP', 'MAC', 'Name', 'Fqdn', 'Posizione', 'Notes'],
  ['4 Domotica', 4010, '10.0.4.10', 'AA-BB-CC-11-22-33', 'Sensore sintetico', 'sensor.test.lan', 'Laboratorio', ''],
  ['4 Domotica', 4020, '10.0.4.20', 'AA:BB:CC:44:55:66', 'Lampada test', 'lamp.test.lan', 'Cucina', ''],
  ['9 Zigbee', 9030, '', 'Zigbee: 00124b0012345678', 'Interruttore zigbee', 'SONOFF-TEST', 'Ingresso', ''],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(all), 'All');
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ['Name', 'URL', 'fqdn', 'IP', 'port', 'Description', 'in Intranet'],
    ['Synth svc', 'http://10.0.4.10:8080', 'sensor.test.lan', '10.0.4.10', 8080, 'Test', 'Y'],
  ]),
  'Services'
);
XLSX.writeFile(wb, out);
console.log('Wrote', out);