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

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractKeysPayload(json) {
  const password =
    json?.result?.password ||
    json?.data?.password ||
    json?.data?.result?.password;
  const auth = json?.result || json?.data?.result || json?.data;
  return { password, auth };
}

function encodeSign({ signN, signE, aesKey, aesIv, seq, username, password, dataLen }) {
  const authHash = createHash('md5').update(`${username}${password}`, 'utf8').digest('hex');
  const signText = `k=${aesKey}&i=${aesIv}&h=${authHash}&s=${seq + dataLen}`;
  return rsaEncryptPkcs1Hex(signN, signE, signText);
}

function encodeEncryptedPayload({ signN, signE, seq, aesKey, aesIv, username, password, payload }) {
  const json = JSON.stringify(payload);
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
  return { sign, data, body: `sign=${sign}&data=${encodeURIComponent(data)}` };
}

function decryptResponseData(aesKey, aesIv, dataB64) {
  const raw = aesCbcDecrypt(aesKey, aesIv, Buffer.from(dataB64, 'base64'));
  return JSON.parse(raw.toString('utf8'));
}

async function postJson(baseUrl, query, body, cookie) {
  const url = `${baseUrl}/cgi-bin/luci/;stok=/login${query ? `?${query}` : ''}`;
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json;charset=UTF-8',
  };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookieHeader =
    setCookie
      .map((c) => c.split(';')[0])
      .find((c) => c.startsWith('sysauth=')) ||
    res.headers.get('set-cookie')?.match(/sysauth=[^;]+/)?.[0];
  return { ok: res.ok, status: res.status, text, json: parseJsonSafe(text), cookie: cookieHeader };
}

async function postForm(baseUrl, path, body, cookie) {
  const url = `${baseUrl}${path}`;
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, {
    method: 'POST',
    body,
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookieHeader =
    setCookie
      .map((c) => c.split(';')[0])
      .find((c) => c.startsWith('sysauth=')) ||
    res.headers.get('set-cookie')?.match(/sysauth=[^;]+/)?.[0];
  return { ok: res.ok, status: res.status, text, json: parseJsonSafe(text), cookie: cookieHeader || cookie };
}

export async function probeDecoFirmware(baseUrl) {
  mercusysLog('info', `probe deco firmware ${baseUrl}`);
  const keys = await postJson(baseUrl, 'form=keys', { operation: 'read' });
  if (keys.status === 401) {
    mercusysLog('warn', 'form=keys HTTP 401 (outer session firmware?)');
    return { kind: 'outer_or_unknown', keysStatus: 401 };
  }
  const { password } = extractKeysPayload(keys.json || {});
  if (password?.length >= 2) {
    mercusysLog('info', 'firmware deco/luci (form=keys OK)');
    return { kind: 'deco_luci', keysStatus: keys.status };
  }
  return { kind: 'unknown', keysStatus: keys.status, preview: keys.text.slice(0, 80) };
}

export async function loginDecoLuci(baseUrl, password, username = DEFAULT_USERNAME) {
  const session = generateAesKeyIv();
  const aesKey = session.key;
  const aesIv = session.iv;

  let cookie = null;

  const keysRes = await postJson(baseUrl, 'form=keys', { operation: 'read' }, cookie);
  if (!keysRes.json) {
    return {
      ok: false,
      step: 'deco_keys',
      httpStatus: keysRes.status,
      error: `Chiavi RSA non disponibili (HTTP ${keysRes.status})`,
    };
  }
  const { password: pwdKeys } = extractKeysPayload(keysRes.json);
  if (!pwdKeys?.[0]) {
    return {
      ok: false,
      step: 'deco_keys_parse',
      httpStatus: keysRes.status,
      error: 'Risposta form=keys non valida (firmware non riconosciuto)',
    };
  }
  cookie = keysRes.cookie || cookie;

  const authRes = await postJson(baseUrl, 'form=auth', { operation: 'read' }, cookie);
  const authBlock = extractKeysPayload(authRes.json || {}).auth;
  const signKeys = authBlock?.key;
  const seq = authBlock?.seq;
  if (!signKeys?.[0] || seq == null) {
    return {
      ok: false,
      step: 'deco_auth',
      httpStatus: authRes.status,
      error: 'Risposta form=auth non valida (firmware non riconosciuto)',
    };
  }
  cookie = authRes.cookie || cookie;

  const passwordEnc = rsaEncryptPkcs1Hex(pwdKeys[0], pwdKeys[1], password);
  const loginPayload = { operation: 'login', params: { password: passwordEnc } };
  const enc = encodeEncryptedPayload({
    signN: signKeys[0],
    signE: signKeys[1],
    seq,
    aesKey,
    aesIv,
    username,
    password,
    payload: loginPayload,
  });

  const loginRes = await postForm(baseUrl, '/cgi-bin/luci/;stok=/login?form=login', enc.body, cookie);
  cookie = loginRes.cookie || cookie;
  const loginJson = loginRes.json;
  if (!loginJson?.data) {
    return {
      ok: false,
      step: 'deco_login_response',
      httpStatus: loginRes.status,
      error: `Login deco: risposta senza campo data (HTTP ${loginRes.status})`,
    };
  }
  let decrypted;
  try {
    decrypted = decryptResponseData(aesKey, aesIv, loginJson.data);
  } catch (err) {
    mercusysLog('error', 'deco login decrypt failed', err instanceof Error ? err.message : String(err));
    return {
      ok: false,
      step: 'deco_login_decrypt',
      error: 'Login deco: impossibile decifrare la risposta',
    };
  }
  const errorCode = decrypted.error_code ?? decrypted.errorcode;
  if (errorCode === -5002 || errorCode === '-5002') {
    return {
      ok: false,
      step: 'password_invalid',
      httpStatus: loginRes.status,
      error: 'Password errata (credenziali rifiutate dal router)',
    };
  }
  if (errorCode !== 0 && errorCode !== '' && errorCode != null) {
    return {
      ok: false,
      step: 'deco_login_rejected',
      httpStatus: loginRes.status,
      error: `Login rifiutato (codice ${errorCode})`,
    };
  }
  const stok = decrypted.result?.stok;
  if (!stok) {
    return {
      ok: false,
      step: 'deco_login_stok',
      error: 'Login riuscito ma token stok assente',
    };
  }
  mercusysLog('info', 'deco login OK', `stok=${String(stok).slice(0, 6)}…`);
  return {
    ok: true,
    firmware: 'deco_luci',
    stok,
    cookie,
    aesKey,
    aesIv,
    signN: signKeys[0],
    signE: signKeys[1],
    seq,
    username,
    password,
  };
}

export async function fetchDecoClientList(baseUrl, session) {
  const payload = { operation: 'read', params: { device_mac: 'default' } };
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
  const path = `/cgi-bin/luci/;stok=${session.stok}/admin/client?form=client_list`;
  const res = await postForm(baseUrl, path, enc.body, session.cookie);
  if (!res.json?.data) {
    mercusysLog('warn', 'client_list senza data, provo DHCP legacy path');
    return { ok: false, step: 'client_list', httpStatus: res.status, error: 'Lista client: risposta non cifrata' };
  }
  let decrypted;
  try {
    decrypted = decryptResponseData(session.aesKey, session.aesIv, res.json.data);
  } catch {
    return { ok: false, step: 'client_list_decrypt', error: 'Lista client: decifratura fallita' };
  }
  const list = decrypted.result?.client_list || [];
  return { ok: true, clients: list, step: 'done' };
}