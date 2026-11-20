/**
 * Client Mercusys / TP-Link (LuCI Deco-Halo + legacy AES-nn).
 * Password solo da env; URL da DB o env.
 */

import { getDb } from '../db.js';
import { normalizeMac } from './mac.js';
import {
  getMercusysRouterUrl,
  getMercusysLastError,
  setMercusysLastError,
} from './settings.js';
import { encryptMercusysPasswordLegacy } from './mercusys-crypto.js';
import {
  probeDecoFirmware,
  loginDecoLuci,
  fetchDecoClientsWithMesh,
} from './mercusys-deco.js';
import { mercusysLog } from './mercusys-log.js';
import { getMercusysTimeoutMs, isMercusysTimeoutError } from './mercusys-fetch.js';

const MOCK_CLIENTS = [
  { hostname: 'synth-phone', ip: '10.0.4.88', mac: '02:00:00:00:00:01' },
  { hostname: 'synth-iot', ip: '10.0.4.89', mac: '02:00:00:00:00:02' },
];

export { encryptMercusysPasswordLegacy as encryptMercusysPassword };

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

function decoClientNotes(meta) {
  const parts = [];
  if (meta.online != null && meta.online !== '') parts.push(`online=${meta.online}`);
  if (meta.connection_type) parts.push(`conn=${meta.connection_type}`);
  if (meta.wire_type) parts.push(`wire=${meta.wire_type}`);
  if (meta.interface) parts.push(`if=${meta.interface}`);
  if (meta.access_host) parts.push(`mesh_host=${meta.access_host}`);
  if (meta.client_type) parts.push(`type=${meta.client_type}`);
  return parts.length ? parts.join(', ') : '';
}

function mapDecoClientRow(r) {
  const hostname = decodeClientName(r.hostname || r.name || '');
  const accessHost = normalizeMac(r.access_host) || (r.access_host ? String(r.access_host) : null);
  const meta = {
    online: r.online,
    connection_type: r.connection_type,
    wire_type: r.wire_type,
    interface: r.interface,
    access_host: accessHost,
    client_type: r.client_type,
  };
  return {
    hostname,
    ip: r.ip || r.ipaddr || r.ip_address || '',
    mac: normalizeMac(r.mac || r.hwaddr || r.macaddr || '') || null,
    meta,
    notes: decoClientNotes(meta),
  };
}

function mapClients(rows) {
  return rows.map((r) => {
    const isDeco =
      r.client_type != null ||
      r.access_host != null ||
      r.connection_type != null ||
      r.wire_type != null;
    if (isDeco) return mapDecoClientRow(r);
    return {
      hostname: decodeClientName(r.hostname || r.name || ''),
      ip: r.ip || r.ipaddr || r.ip_address || '',
      mac: normalizeMac(r.mac || r.hwaddr || r.macaddr || '') || null,
    };
  });
}

function decodeClientName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  try {
    const d = Buffer.from(raw, 'base64');
    if (d.length && /^[\x20-\x7e\u00a0-\ufffd]+$/.test(d.toString('utf8'))) {
      return d.toString('utf8');
    }
  } catch {
    /* ignore */
  }
  return raw;
}

async function followMetaRefresh(baseUrl) {
  mercusysLog('info', `GET ${baseUrl}/`);
  let res;
  try {
    res = await fetch(`${baseUrl}/`, {
      method: 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, step: 'router_unreachable', error: `Router irraggiungibile: ${msg}` };
  }
  const html = await res.text();
  const refresh = html.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*URL=([^"']+)/i);
  if (refresh) {
    const nextPath = refresh[1].trim();
    const nextUrl = new URL(nextPath, `${baseUrl}/`).href;
    mercusysLog('info', 'redirect meta refresh', nextUrl);
    try {
      await fetch(nextUrl, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
    } catch (err) {
      mercusysLog('warn', 'pagina login non raggiunta dopo refresh', err instanceof Error ? err.message : '');
    }
  }
  return { ok: true, status: res.status, hint: refresh ? 'halo_web' : 'legacy_html' };
}

async function fetchLoginPageLegacy(baseUrl) {
  const entry = await followMetaRefresh(baseUrl);
  if (!entry.ok) return entry;
  const res = await fetch(`${baseUrl}/webpages/index.html`, {
    headers: { Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  const html = (res ? await res.text() : '') || '';
  const probeHtml = html.length > 100 ? html : '';
  const fallback = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(8000) })
    .then((r) => r.text())
    .catch(() => '');
  const merged = probeHtml || fallback;
  const nn =
    merged.match(/var\s+nn\s*=\s*'([^']+)'/)?.[1] || merged.match(/"nn"\s*:\s*"([^"]+)"/)?.[1];
  const ee = merged.match(/var\s+ee\s*=\s*'([^']+)'/)?.[1];
  return { ok: true, nn, ee, status: res?.status || entry.status, firmware: entry.hint };
}

async function postLegacyLogin(baseUrl, password) {
  const loginPage = await fetchLoginPageLegacy(baseUrl);
  if (!loginPage.ok) return { ...loginPage, clients: [] };
  const { nn, ee } = loginPage;
  if (!nn) {
    return {
      ok: false,
      step: 'firmware_unrecognized',
      httpStatus: loginPage.status,
      error:
        'Firmware non riconosciuto: né API Deco (form=keys) né token nn nella pagina HTML.',
      firmware: loginPage.firmware,
      clients: [],
    };
  }
  mercusysLog('info', 'login legacy AES-nn');
  const enc = encryptMercusysPasswordLegacy(password, nn);
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
      step: 'legacy_login_response',
      httpStatus: res.status,
      error: `Login legacy: risposta non JSON (HTTP ${res.status})`,
      clients: [],
    };
  }
  if (json.error || json.result === false) {
    return {
      ok: false,
      step: 'password_invalid',
      httpStatus: res.status,
      error: `Password errata o login rifiutato: ${json.error || 'credenziali errate'}`,
      clients: [],
    };
  }
  const stok = json.stok || json.data?.stok;
  if (!stok) {
    return {
      ok: false,
      step: 'legacy_login_stok',
      error: 'Login legacy senza stok',
      clients: [],
    };
  }
  return await fetchDhcpClientList(baseUrl, stok, 'legacy_luci');
}

async function fetchDhcpClientList(baseUrl, stok, firmware) {
  const listRes = await fetch(
    `${baseUrl}/cgi-bin/luci/;stok=${stok}/admin/dhcpserver?form=dhcpclient`,
    { signal: AbortSignal.timeout(10000) }
  );
  const listText = await listRes.text();
  try {
    const list = JSON.parse(listText);
    const rows = list.data?.client_list || list.client_list || list.result?.client_list || [];
    const clients = mapClients(rows);
    if (!clients.length) {
      mercusysLog('warn', 'lista client vuota dopo login OK');
    }
    return { ok: true, clients, stok, step: 'done', firmware };
  } catch {
    return {
      ok: false,
      step: 'client_list_failed',
      httpStatus: listRes.status,
      error: `Login OK ma lista client non leggibile (HTTP ${listRes.status})`,
      clients: [],
      firmware,
    };
  }
}

async function loginAndFetchClients(baseUrl, password) {
  const entry = await followMetaRefresh(baseUrl);
  if (!entry.ok) return { ...entry, clients: [] };
  const probe = await probeDecoFirmware(baseUrl);
  if (probe.kind === 'deco_luci') {
    const session = await loginDecoLuci(baseUrl, password);
    if (!session.ok) return session;
    const list = await fetchDecoClientsWithMesh(baseUrl, session);
    if (list.ok) {
      const clients = mapClients(list.clients);
      if (!clients.length) {
        return {
          ok: true,
          clients: [],
          step: 'done',
          firmware: 'deco_luci',
          warning: 'Login OK ma nessun client DHCP connesso',
        };
      }
      return {
        ok: true,
        clients,
        step: 'done',
        firmware: 'deco_luci',
        meshNodes: list.meshNodes ?? 0,
      };
    }
    mercusysLog('warn', 'client_list deco fallita, provo DHCP', list.error);
    if (session.stok) {
      const dhcp = await fetchDhcpClientList(baseUrl, session.stok, 'deco_luci');
      if (dhcp.ok) return dhcp;
    }
    return { ...list, clients: [] };
  }

  mercusysLog('info', `deco keys non disponibile (kind=${probe.kind}), fallback legacy`);
  return postLegacyLogin(baseUrl, password);
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
    mercusysLog('info', `fetch clients ${url}`, `timeout ${getMercusysTimeoutMs()}ms`);
    const result = await loginAndFetchClients(url.replace(/\/$/, ''), password);
    if (!result.ok) {
      setMercusysLastError(`${result.step}: ${result.error}`);
      mercusysLog('error', result.step, result.error);
    } else {
      setMercusysLastError(null);
      mercusysLog(
        'info',
        'import ready',
        `${result.clients.length} client (${result.firmware || 'unknown'})`
      );
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err?.code === 'MERCUSYS_TIMEOUT' || err?.step?.endsWith('_timeout') || isMercusysTimeoutError(err)) {
      const step = err.step || 'mercusys_timeout';
      setMercusysLastError(`${step}: ${message}`);
      mercusysLog('error', step, message);
      return { ok: false, step, error: message, clients: [] };
    }
    setMercusysLastError(`router_unreachable: ${message}`);
    mercusysLog('error', 'router_unreachable', message);
    return {
      ok: false,
      step: 'router_unreachable',
      error: `Router irraggiungibile: ${message}`,
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
      const rowNote = [note, c.notes].filter(Boolean).join(' · ');
      ins.run(c.ip, c.mac, c.hostname || null, rowNote || note);
      imported += 1;
    }
    return { ...result, imported };
  });
}