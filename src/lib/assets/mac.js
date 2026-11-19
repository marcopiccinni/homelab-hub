/**
 * Normalizza MAC in formato AA:BB:CC:DD:EE:FF (uppercase).
 */
export function normalizeMac(input) {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (/^zigbee:/i.test(raw)) return null;
  const hex = raw.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length !== 12) return null;
  const pairs = hex.match(/.{2}/g);
  return pairs.map((p) => p.toUpperCase()).join(':');
}

export function parseMacOrZigbee(cell) {
  if (!cell || typeof cell !== 'string') return { mac: null, ieee: null, zigbeeModel: null };
  const t = cell.trim();
  const z = t.match(/^zigbee:\s*(.+)$/i);
  if (z) {
    const ieee = z[1].trim().replace(/\s+/g, '');
    return { mac: null, ieee, zigbeeModel: null };
  }
  return { mac: normalizeMac(t), ieee: null, zigbeeModel: null };
}