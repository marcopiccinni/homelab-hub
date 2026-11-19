/**
 * Client Mercusys / TP-Link (web UI moderna). Isolato: senza router reale usa mock o errore esplicito.
 * Pattern login ispirato a progetti open source (tplink-router-api / Home Assistant tplink).
 */

import crypto from 'node:crypto';
import { getDb } from '../db.js';
import { normalizeMac } from './mac.js';

export function mercusysConfigured() {
  if (process.env.MERCUSYS_MOCK === '1') return true;
  return Boolean(process.env.MERCUSYS_URL && process.env.MERCUSYS_PASSWORD);
}

function isMockUrl(url) {
  return !url || url.startsWith('mock://') || process.env.MERCUSYS_MOCK === '1';
}

/** AES-128-ECB come varianti TP-Link/Mercusys firmware recente (best-effort). */
export function encryptMercusysPassword(password, nn) {
  const key = nn.padEnd(16, '\0').slice(0, 16);
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(key, 'utf8'), null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]).toString('base64');
}

async function fetchLoginPage(baseUrl) {
  const res = await fetch(`${baseUrl}/`, {
    method: 'GET',
    headers: { Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(10000),
  });
  const html = await res.text();
  const nn = html.match(/var\s+nn\s*=\s*'([^']+)'/)?.[1] || html.match(/"nn"\s*:\s*"([^"]+)"/)?.[1];
  const ee = html.match(/var\s+ee\s*=\s*'([^']+)'/)?.[1];
  return { ok: res.ok, html, nn, ee, status: res.status };
}

async function postLogin(baseUrl, password) {
  const { nn, ee, ok, status } = await fetchLoginPage(baseUrl);
  if (!ok) {
    return { ok: false, error: `Pagina login HTTP ${status}`, clients: [] };
  }
  if (!nn) {
    return {
      ok: false,
      error:
        'Token nn non trovato: firmware non supportato senza router reale. Usa MERCUSYS_MOCK=1 per test.',
      clients: [],
    };
  }
  const enc = encryptMercusysPassword(password, nn);
  const body = new URLSearchParams({
    action: '1',
    username: 'admin',
    password: enc,
    ...(ee ? { ee } : {}),
  });
  const res = await fetch(`${baseUrl}/cgi-bin/luci/;stok=/login?form=login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(12000),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: 'Risposta login non JSON — verifica URL/modello Mercusys Halo.',
      clients: [],
    };
  }
  if (json.error || json.result === false) {
    return {
      ok: false,
      error: json.error || 'Login rifiutato (password o modello errato).',
      clients: [],
    };
  }
  const stok = json.stok || json.data?.stok;
  if (!stok) {
    return {
      ok: false,
      error: 'Login senza stok: API client DHCP non disponibile su questo firmware.',
      clients: [],
    };
  }
  const listRes = await fetch(
    `${baseUrl}/cgi-bin/luci/;stok=${stok}/admin/dhcpserver?form=dhcpclient`,
    { signal: AbortSignal.timeout(10000) }
  );
  const listText = await listRes.text();
  try {
    const list = JSON.parse(listText);
    const rows = list.data?.client_list || list.client_list || [];
    const clients = rows.map((r) => ({
      hostname: r.hostname || r.name || '',
      ip: r.ip || r.ipaddr || '',
      mac: normalizeMac(r.mac || r.hwaddr || '') || null,
    }));
    return { ok: true, clients, stok };
  } catch {
    return {
      ok: false,
      error: 'Lista client DHCP non leggibile — endpoint da adattare al modello.',
      clients: [],
    };
  }
}

export async function fetchMercusysClients() {
  const url = (process.env.MERCUSYS_URL || 'mock://local').replace(/\/$/, '');
  if (isMockUrl(url)) {
    return {
      ok: true,
      mock: true,
      message: 'Modalità mock (MERCUSYS_MOCK=1). Nessun router contattato.',
      clients: [
        { hostname: 'synth-phone', ip: '10.0.4.88', mac: '02:00:00:00:00:01' },
        { hostname: 'synth-iot', ip: '10.0.4.89', mac: '02:00:00:00:00:02' },
      ],
    };
  }
  const password = process.env.MERCUSYS_PASSWORD;
  if (!password) {
    return {
      ok: false,
      error: 'Mercusys non configurato (MERCUSYS_URL / MERCUSYS_PASSWORD mancanti)',
      clients: [],
    };
  }
  try {
    return await postLogin(url, password);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      clients: [],
    };
  }
}

export function importMercusysClientsToQueue() {
  return fetchMercusysClients().then((result) => {
    if (!result.ok) return { ...result, imported: 0 };
    const db = getDb();
    const ins = db.prepare(`
      INSERT INTO discovery_queue (ip_address, mac_address, hostname, first_seen_at, last_seen_at, status, notes)
      VALUES (?, ?, ?, datetime('now'), datetime('now'), 'pending', 'Import Mercusys')
    `);
    let imported = 0;
    for (const c of result.clients) {
      if (!c.ip) continue;
      const known = db
        .prepare('SELECT 1 FROM asset_ip_assignments aia JOIN ip_addresses i ON i.id=aia.ip_id WHERE i.address=?')
        .get(c.ip);
      if (known) continue;
      const dup = db
        .prepare(`SELECT 1 FROM discovery_queue WHERE ip_address=? AND status='pending'`)
        .get(c.ip);
      if (dup) continue;
      ins.run(c.ip, c.mac, c.hostname || null);
      imported += 1;
    }
    return { ...result, imported };
  });
}