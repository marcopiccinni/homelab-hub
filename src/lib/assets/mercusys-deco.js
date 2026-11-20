import { createHash } from 'node:crypto';
import {
  aesCbcDecrypt,
  aesCbcEncrypt,
  generateAesKeyIv,
  rsaEncryptPkcs1Hex,
} from './mercusys-crypto.js';
import { mercusysLog } from './mercusys-log.js';

const DEFAULT_USERNAME = 'admin';
const TIMEOUT_MS = 12000;
const LUCI_LOGIN_PREFIX = '/cgi-bin/luci/;stok=/login';

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractCookie(res) {
  const setCookie = res.headers.getSetCookie?.() || [];
  const fromSet =
    setCookie
      .map((c) => c.split(';')[0])
      .find((c) => c.startsWith('sysauth=')) || null;
  const fromHeader = res.headers.get('set-cookie')?.match(/sysauth=[^;]+/)?.[0];
  return fromSet || fromHeader || null;
}

function compactJson(obj) {
  return JSON.stringify(obj);
}

function encodeSign({ signN, signE, aesKey, aesIv, seq, username, password, dataLen }) {
  const authHash = createHash('md5').update(`${username}${password}`, 'utf8').digest('hex');
  const signText = `k=${aesKey}&i=${aesIv}&h=${authHash}&s=${seq + dataLen}`;
  return rsaEncryptPkcs1Hex(signN, signE, signText);
}

function encodeEncryptedPayload({ signN, signE, seq, aesKey, aesIv, username, password, payload }) {
  const json = compactJson(payload);
  const encrypted = aesCbcEncrypt(aesKey, aesIv, json);
  const data = encrypted.toString('base64');
  const sign = encodeSign({
    signN,
    signE,
    aesKey,
    aesIv,
    seq,
    username,
    password,
    dataLen: data.length,
  });
  return { sign, data, body: `sign=${sign}&data=${encodeURIComponent(data)}`, nextSeq: seq + data.length };
}

function decryptResponseData(aesKey, aesIv, dataB64) {
  if (!dataB64) throw new Error('empty data');
  const raw = aesCbcDecrypt(aesKey, aesIv, Buffer.from(dataB64, 'base64'));
  return JSON.parse(raw.toString('utf8'));
}

async function postFormUrl(baseUrl, path, body, cookie) {
  const url = `${baseUrl}${path}`;
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    text,
    json: parseJsonSafe(text),
    cookie: extractCookie(res) || cookie,
  };
}

/** Halo H1500X: keys/auth richiedono POST `operation=read` (GET risponde error_code 1). */
async function fetchLuciKeysAndAuth(baseUrl, cookie) {
  const keysRes = await postFormUrl(
    baseUrl,
    `${LUCI_LOGIN_PREFIX}?form=keys`,
    'operation=read',
    cookie
  );
  const keysJson = keysRes.json;
  if (!keysJson || keysJson.error_code !== 0) {
    return {
      ok: false,
      step: 'deco_keys',
      httpStatus: keysRes.status,
      error:
        keysJson?.msg || keysJson?.error
          ? `Chiavi RSA: ${keysJson.msg || keysJson.error}`
          : `Chiavi RSA non disponibili (HTTP ${keysRes.status})`,
    };
  }
  const pwdKeys = keysJson.result?.password;
  if (!pwdKeys?.[0]) {
    return {
      ok: false,
      step: 'deco_keys_parse',
      httpStatus: keysRes.status,
      error: 'Risposta form=keys non valida (firmware non riconosciuto)',
    };
  }
  cookie = keysRes.cookie || cookie;

  const authRes = await postFormUrl(
    baseUrl,
    `${LUCI_LOGIN_PREFIX}?form=auth`,
    'operation=read',
    cookie
  );
  const authJson = authRes.json;
  if (!authJson || authJson.error_code !== 0) {
    return {
      ok: false,
      step: 'deco_auth',
      httpStatus: authRes.status,
      error: authJson?.msg || 'Risposta form=auth non valida',
    };
  }
  const signKeys = authJson.result?.key;
  const seq = authJson.result?.seq;
  if (!signKeys?.[0] || seq == null) {
    return {
      ok: false,
      step: 'deco_auth_parse',
      error: 'form=auth senza key/seq (firmware non riconosciuto)',
    };
  }
  cookie = authRes.cookie || cookie;
  return {
    ok: true,
    cookie,
    pwdN: pwdKeys[0],
    pwdE: pwdKeys[1] || '010001',
    signN: signKeys[0],
    signE: signKeys[1] || '010001',
    seq,
  };
}

export async function probeDecoFirmware(baseUrl) {
  mercusysLog('info', `probe deco firmware ${baseUrl}`);
  const keys = await postFormUrl(baseUrl, `${LUCI_LOGIN_PREFIX}?form=keys`, 'operation=read');
  if (keys.status === 401) {
    return { kind: 'outer_or_unknown', keysStatus: 401 };
  }
  if (keys.json?.error_code === 0 && keys.json?.result?.password?.[0]) {
    mercusysLog('info', 'firmware deco/halo luci (POST form=keys OK)');
    return { kind: 'deco_luci', keysStatus: keys.status };
  }
  if (keys.json?.error_code === 1) {
    mercusysLog('warn', 'GET-style keys rejected; use POST operation=read');
  }
  return { kind: 'unknown', keysStatus: keys.status, preview: keys.text?.slice(0, 120) };
}

export async function loginDecoLuci(baseUrl, password, username = DEFAULT_USERNAME) {
  const session = generateAesKeyIv();
  const aesKey = session.key;
  const aesIv = session.iv;

  const keysAuth = await fetchLuciKeysAndAuth(baseUrl);
  if (!keysAuth.ok) return { ...keysAuth, clients: [] };

  let cookie = keysAuth.cookie;
  const passwordEnc = rsaEncryptPkcs1Hex(keysAuth.pwdN, keysAuth.pwdE, password);
  const loginPayload = { params: { password: passwordEnc }, operation: 'login' };
  const enc = encodeEncryptedPayload({
    signN: keysAuth.signN,
    signE: keysAuth.signE,
    seq: keysAuth.seq,
    aesKey,
    aesIv,
    username,
    password,
    payload: loginPayload,
  });

  const loginRes = await postFormUrl(
    baseUrl,
    `${LUCI_LOGIN_PREFIX}?form=login`,
    enc.body,
    cookie
  );
  cookie = loginRes.cookie || cookie;
  const loginJson = loginRes.json;
  if (!loginJson || loginJson.data == null || loginJson.data === '') {
    return {
      ok: false,
      step: 'deco_login_response',
      httpStatus: loginRes.status,
      error:
        loginJson?.data === ''
          ? 'Login: risposta data vuota (password errata o payload non accettato)'
          : `Login: risposta senza campo data (HTTP ${loginRes.status})`,
    };
  }
  let decrypted;
  try {
    decrypted = decryptResponseData(aesKey, aesIv, loginJson.data);
  } catch (err) {
    mercusysLog('error', 'deco login decrypt failed', err instanceof Error ? err.message : String(err));
    return { ok: false, step: 'deco_login_decrypt', error: 'Login: impossibile decifrare la risposta', clients: [] };
  }
  const errorCode = decrypted.error_code ?? decrypted.errorcode;
  if (errorCode === -5002 || errorCode === '-5002') {
    return {
      ok: false,
      step: 'password_invalid',
      httpStatus: loginRes.status,
      error: 'Password errata (credenziali rifiutate dal router)',
      clients: [],
    };
  }
  if (errorCode !== 0 && errorCode !== '' && errorCode != null) {
    return {
      ok: false,
      step: 'deco_login_rejected',
      httpStatus: loginRes.status,
      error: `Login rifiutato (codice ${errorCode})`,
      clients: [],
    };
  }
  const stok = decrypted.result?.stok;
  if (!stok) {
    return { ok: false, step: 'deco_login_stok', error: 'Login riuscito ma token stok assente', clients: [] };
  }
  mercusysLog('info', 'deco login OK', `stok=${String(stok).slice(0, 6)}…`);
  return {
    ok: true,
    firmware: 'deco_luci',
    stok,
    cookie,
    aesKey,
    aesIv,
    signN: keysAuth.signN,
    signE: keysAuth.signE,
    seq: enc.nextSeq,
    username,
    password,
  };
}

async function postEncryptedLuci(baseUrl, session, path, payload) {
  const enc = encodeEncryptedPayload({
    signN: session.signN,
    signE: session.signE,
    seq: session.seq,
    aesKey: session.aesKey,
    aesIv: session.aesIv,
    username: session.username,
    password: session.password,
    payload,
  });
  session.seq = enc.nextSeq;
  const res = await postFormUrl(baseUrl, path, enc.body, session.cookie);
  if (res.cookie) session.cookie = res.cookie;
  return res;
}

export async function fetchDecoClientList(baseUrl, session) {
  const path = `/cgi-bin/luci/;stok=${session.stok}/admin/client?form=client_list`;
  const res = await postEncryptedLuci(baseUrl, session, path, {
    operation: 'read',
    params: { device_mac: 'default' },
  });
  if (!res.json?.data) {
    return { ok: false, step: 'client_list', httpStatus: res.status, error: 'Lista client: risposta senza data' };
  }
  let decrypted;
  try {
    decrypted = decryptResponseData(session.aesKey, session.aesIv, res.json.data);
  } catch {
    return { ok: false, step: 'client_list_decrypt', error: 'Lista client: decifratura fallita' };
  }
  const list = decrypted.result?.client_list || [];
  return { ok: true, clients: list, step: 'client_list' };
}

export async function fetchDecoDeviceList(baseUrl, session) {
  const path = `/cgi-bin/luci/;stok=${session.stok}/admin/device?form=device_list`;
  const res = await postEncryptedLuci(baseUrl, session, path, { operation: 'read' });
  if (!res.json?.data) return { ok: false, devices: [] };
  try {
    const decrypted = decryptResponseData(session.aesKey, session.aesIv, res.json.data);
    return { ok: true, devices: decrypted.result?.device_list || [] };
  } catch {
    return { ok: false, devices: [] };
  }
}

export async function fetchDecoClientsWithMesh(baseUrl, session) {
  const list = await fetchDecoClientList(baseUrl, session);
  if (!list.ok) return list;
  const devices = await fetchDecoDeviceList(baseUrl, session);
  if (devices.ok && devices.devices.length) {
    mercusysLog('info', 'mesh device_list', `${devices.devices.length} nodi`);
  }
  return { ...list, meshNodes: devices.devices?.length || 0 };
}