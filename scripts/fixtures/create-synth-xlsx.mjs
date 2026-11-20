/**
 * Fixture che riproduce la forma del file Excel reale (header con spazi, griglia IP, ID stringa, ecc.)
 */
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, 'synth-assets.xlsx');

const general = [
  ['Ordine', 'Famiglia / Uso', 'Subnet /24', 'Contenuto / Esempi', 'Note', '', ''],
  [0, 'Default modem', '192.168.1.0/24', 'Modem', '', '', ''],
  [1, 'Network', '10.0.1.0/24', 'Switch', '', '', ''],
  [4, 'Domotica', '10.0.4.0/24', 'IoT', '', '', ''],
  [40, 'Zigbee', '-', 'IEEE', '', '', ''],
  ['-', '-', '-', '', '', '', ''],
  ['MAC', '(più elementi)', '', '', '', '', ''],
  ['ID', 'Name', 'Posizione', 'Notes', '', '', ''],
  [9999, 'Pivot solo General', 'Studio', '', '', '', 'spurio'],
];

const allHeader = ['Area', 'ID', 'IP', 'MAC', 'Name', 'Fqdn', 'Posizione', 'Notes', ''];
const all = [allHeader];
const areaDom = '4 Domotica';
for (let h = 0; h <= 5; h++) {
  all.push([areaDom, 1000 + h, `10.0.4.${h}`, '', '', '', '', '', '']);
}
all.push([
  areaDom,
  '0001',
  '10.0.4.10',
  'DC-A6-32-FD-CF-5D',
  '*Router synth',
  'router.test.lan',
  'Studio*',
  'nota',
  '',
]);
all.push([
  areaDom,
  1002,
  '10.0.4.11',
  'C4:04:15:B2:E3:14',
  'wlan0',
  'wlan0.test.lan',
  'Laboratorio',
  '',
  '',
]);
all.push([areaDom, 1003, '10.0.4.12', '-', 'wlan0', '', 'Cucina', '', '']);
all.push(['40 Zigbee', '40000', '', 'Zigbee: E4:56:AC:FF:FE:6C:54:14 ', 'SONOFF-TEMP', 'TH01', '', '', '']);
all.push(['', '40001', '', 'Zigbee: 00124b0012345678', 'Alexa', 'Echo dot', '', '', '']);
all.push(['0 Default', '0000', '192.168.1.250', 'AA-BB-CC-DD-EE-FF', 'Modem synth', '', '*', '', '']);

const services = [
  ['Name', 'URL', 'url dns', 'fqdn', 'IP', 'port', 'Description', 'Notes', 'in Intranet'],
  ['Nginx Proxy Manager', 'http://10.0.4.10:81', '', 'npm.test.lan', '10.0.4.10', 81, 'Admin', '', 'Y'],
  ['Nginx Proxy Manager', '', '', 'npm.test.lan', '10.0.4.10', 443, 'HTTPS', '', 'y'],
  ['Nginx Proxy Manager', '', '', '', '10.0.4.10', 80, 'HTTP', '', ''],
  ['Servizio esterno', '', '', 'ext.example', ' 93.41.254.189 ', 443, 'Pubblico', '', ''],
  ['Synth intranet', 'http://10.0.4.11:8080', '', 'wlan0.test.lan', '10.0.4.11', 8080, 'Test', '', 'Y'],
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(general), 'General');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(all), 'All');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(services), 'Services');
XLSX.writeFile(wb, out);
console.log('Wrote', out);