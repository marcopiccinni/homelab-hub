/**
 * Client Mercusys / TP-Link (web UI moderna). Password solo da env; URL da DB o env.
 */

import crypto from 'node:crypto';
import { getDb } from '../db.js';
import { normalizeMac } from './mac.js';
import {
  getMercusysRouterUrl,
  getMercusysLastError,
  setMercusysLastError,
} from './settings.js';

const MOCK_CLIENTS = [
  { hostname: 'synth-phone', ip: '10.0.4.88', mac: '02:00:00:00:00:01' },
  { hostname: 'synth-iot', ip: '10.0.4.89', mac: '02:00:00:00:00:02' },
];

export function mercusysPasswordConfigured() {
  return Boolean(process.env.MERCUSYS_PASSWORD?.trim());
}

export function mercusysMockEnabled() {
  return process.env.MERCUSYS_MOCK === '1';
}

export function mercusysConfigured() {
  if (mercusysMockEnabled()) return true;
  return Boolean(getMercusysRouterUrl() && mercusysPasswordConfigured());
}

export function mercusysStatus() {
  return {
    passwordConfigured: mercusysPasswordConfigured(),
    mockMode: mercusysMockEnabled(),
    routerUrl: getMercusysRouterUrl() || null,
    configured: mercusysConfigured(),
    lastError: getMercusysLastError(),
  };
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
  const loginPage = await fetchLoginPage(baseUrl);
  if (!loginPage.ok) {
    return {
      ok: false,
      step: 'login_page',
      httpStatus: loginPage.status,
      error: `Pagina login HTTP ${loginPage.status}`,
      clients: [],
    };
  }
  const { nn, ee } = loginPage;
  if (!nn) {
    return {
      ok: false,
      step: 'login_token',
      httpStatus: loginPage.status,
      error: 'Token nn assente nella pagina login (modello/firmware non riconosciuto).',
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
      step: 'login_response',
      httpStatus: res.status,
      error: `Risposta login non JSON (HTTP ${res.status}). Anteprima: ${text.slice(0, 120)}`,
      clients: [],
    };
  }
  if (json.error || json.result === false) {
    return {
      ok: false,
      step: 'login_rejected',
      httpStatus: res.status,
      error: `Login rifiutato: ${json.error || json.data?.error || 'credenziali o modello errati'}`,
      clients: [],
    };
  }
  const stok = json.stok || json.data?.stok;
  if (!stok) {
    return {
      ok: false,
      step: 'login_stok',
      httpStatus: res.status,
      error: 'Login riuscito ma stok mancante nella risposta JSON.',
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
    return { ok: true, clients, stok, step: 'done' };
  } catch {
    return {
      ok: false,
      step: 'dhcp_list',
      httpStatus: listRes.status,
      error: `Lista DHCP non JSON (HTTP ${listRes.status}). Anteprima: ${listText.slice(0, 120)}`,
      clients: [],
    };
  }
}

export async function fetchMercusysClients() {
  if (mercusysMockEnabled()) {
    return {
      ok: true,
      mock: true,
      step: 'mock',
      message: 'Modalità mock (MERCUSYS_MOCK=1). Nessun router contattato.',
      clients: MOCK_CLIENTS,
    };
  }
  const url = getMercusysRouterUrl();
  if (!url) {
    return {
      ok: false,
      step: 'config',
      error: 'URL router non configurato (Admin Asset o MERCUSYS_URL)',
      clients: [],
    };
  }
  const password = process.env.MERCUSYS_PASSWORD;
  if (!password) {
    return {
      ok: false,
      step: 'config',
      error: 'MERCUSYS_PASSWORD non impostata nel file .env del container',
      clients: [],
    };
  }
  try {
    const result = await postLogin(url, password);
    if (!result.ok) {
      setMercusysLastError(`${result.step}: ${result.error}`);
    } else {
      setMercusysLastError(null);
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setMercusysLastError(`network: ${message}`);
    return {
      ok: false,
      step: 'network',
      error: message,
      clients: [],
    };
  }
}

export function importMercusysClientsToQueue() {
  return fetchMercusysClients().then((result) => {
    if (!result.ok) return { ...result, imported: 0 };
    const db = getDb();
    const note = result.mock ? 'Import Mercusys (mock)' : 'Import Mercusys';
    const ins = db.prepare(`
      INSERT INTO discovery_queue (ip_address, mac_address, hostname, first_seen_at, last_seen_at, status, notes)
      VALUES (?, ?, ?, datetime('now'), datetime('now'), 'pending', ?)
    `);
    let imported = 0;
    for (const c of result.clients) {
      if (!c.ip) continue;
      const known = db
        .prepare(
          'SELECT 1 FROM asset_ip_assignments aia JOIN ip_addresses i ON i.id=aia.ip_id WHERE i.address=?'
        )
        .get(c.ip);
      if (known) continue;
      const dup = db
        .prepare(`SELECT 1 FROM discovery_queue WHERE ip_address=? AND status='pending'`)
        .get(c.ip);
      if (dup) continue;
      ins.run(c.ip, c.mac, c.hostname || null, note);
      imported += 1;
    }
    return { ...result, imported };
  });
}