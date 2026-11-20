import { createHash } from 'node:crypto';
import {
  aesCbcDecrypt,
  aesCbcEncrypt,
  generateAesKeyIv,
  rsaEncryptPkcs1Hex,
  rsaEncryptSignPkcs1Hex,
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

function md5AdminPassword(username, password) {
  return createHash('md5').update(`${username}${password}`, 'utf8').digest('hex');
}

function extractCookie(res) {
  if (!res?.headers) return null;
  const setCookie = res.headers.getSetCookie?.() || [];
  const fromSet =
    setCookie
      .map((c) => c.split(';')[0])
      .find((c) => c.startsWith('sysauth=')) || null;
  const fromHeader = res.headers.get('set-cookie')?.match(/sysauth=[^;]+/)?.[0];
  return fromSet || fromHeader || null;
}

/** Header Cookie per fetch Node (nessun jar automatico). */
function cookieHeader(cookie) {
  if (!cookie) return undefined;
  if (cookie.startsWith('sysauth=')) return cookie;
  return `sysauth=${cookie}`;
}

function mergeSysauthCookie(current, resOrPost) {
  if (resOrPost?.cookie) return resOrPost.cookie;
  const fromHeaders = extractCookie(resOrPost);
  if (fromHeaders) return fromHeaders;
  return current;
}

function emptyEncryptedData(json) {
  return json == null || json.data === '' || json.data == null;
}

const SESSION_INVALID_MSG = 'Sessione non valida (cookie sysauth mancante?)';

function buildSignText({ isLogin, aesKey, aesIv, authHash, seq, dataBase64Len }) {
  const s = seq + dataBase64Len;
  if (isLogin) {
    return `k=${aesKey}&i=${aesIv}&h=${authHash}&s=${s}`;
  }
  return `h=${authHash}&s=${s}`;
}

function encodeEncryptedPayload({
  signN,
  signE,
  seq,
  aesKey,
  aesIv,
  username,
  password,
  payload,
  isLogin,
}) {
  const json = JSON.stringify(payload);
  const encrypted = aesCbcEncrypt(aesKey, aesIv, json);
  const data = encrypted.toString('base64');
  const authHash = md5AdminPassword(username, password);
  const signText = buildSignText({
    isLogin,
    aesKey,
    aesIv,
    authHash,
    seq,
    dataBase64Len: data.length,
  });
  const sign = rsaEncryptSignPkcs1Hex(signN, signE, signText);
  return { sign, data, body: `sign=${sign}&data=${encodeURIComponent(data)}` };
}

function decryptResponseData(aesKey, aesIv, dataB64) {
  if (!dataB64) throw new Error('empty data');
  const raw = aesCbcDecrypt(aesKey, aesIv, Buffer.from(dataB64, 'base64'));
  return JSON.parse(raw.toString('utf8'));
}

function mapLoginError(decrypted, httpStatus) {
  const errorCode = decrypted.error_code ?? decrypted.errorcode;
  if (errorCode === -5002 || errorCode === '-5002') {
    const attempts = decrypted.result?.attemptsAllowed ?? decrypted.result?.failureCount;
    const extra = attempts != null ? ` (tentativi rimasti: ${attempts})` : '';
    return {
      ok: false,
      step: 'password_invalid',
      httpStatus,
      error: `Password errata${extra}`,
      clients: [],
    };
  }
  if (errorCode === -5003 || errorCode === '-5003') {
    return {
      ok: false,
      step: 'login_locked',
      httpStatus,
      error: 'Troppi tentativi falliti: accesso temporaneamente bloccato sul router',
      clients: [],
    };
  }
  if (errorCode === 1 || errorCode === '1') {
    return {
      ok: false,
      step: 'deco_login_rejected',
      httpStatus,
      error: 'Login rifiutato (formato o credenziali non accettate, codice 1)',
      clients: [],
    };
  }
  if (errorCode !== 0 && errorCode !== '' && errorCode != null) {
    return {
      ok: false,
      step: 'deco_login_rejected',
      httpStatus,
      error: `Login rifiutato (codice ${errorCode})`,
      clients: [],
    };
  }
  return null;
}

async function postRaw(baseUrl, path, body, cookie, contentType) {
  const url = `${baseUrl}${path}`;
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': contentType,
  };
  const cookieHdr = cookieHeader(cookie);
  if (cookieHdr) headers.Cookie = cookieHdr;
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

async function postFormUrl(baseUrl, path, body, cookie) {
  return postRaw(baseUrl, path, body, cookie, 'application/x-www-form-urlencoded; charset=UTF-8');
}

/** jQuery ajax: Content-Type application/json con body urlencoded sign&data. */
async function postTpEncrypt(baseUrl, path, body, cookie) {
  let res = await postRaw(baseUrl, path, body, cookie, 'application/json');
  if (!res.json && res.status >= 400) {
    mercusysLog('warn', 'POST con Content-Type json fallito, fallback form-urlencoded');
    res = await postFormUrl(baseUrl, path, body, cookie);
  }
  return res;
}

async function postLuciJson(baseUrl, path, jsonBody, cookie) {
  const res = await postRaw(
    baseUrl,
    path,
    typeof jsonBody === 'string' ? jsonBody : JSON.stringify(jsonBody),
    cookie,
    'application/json;charset=UTF-8'
  );
  if (!res.json) {
    const fallback = await postFormUrl(baseUrl, path, 'operation=read', cookie);
    return fallback;
  }
  return res;
}

async function fetchLuciKeysAndAuth(baseUrl, cookie) {
  const keysRes = await postLuciJson(baseUrl, `${LUCI_LOGIN_PREFIX}?form=keys`, { operation: 'read' }, cookie);
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

  const authRes = await postLuciJson(baseUrl, `${LUCI_LOGIN_PREFIX}?form=auth`, { operation: 'read' }, cookie);
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
  const loginPayload = { operation: 'login', params: { password: passwordEnc } };
  const enc = encodeEncryptedPayload({
    signN: keysAuth.signN,
    signE: keysAuth.signE,
    seq: keysAuth.seq,
    aesKey,
    aesIv,
    username,
    password,
    payload: loginPayload,
    isLogin: true,
  });

  const loginRes = await postTpEncrypt(baseUrl, `${LUCI_LOGIN_PREFIX}?form=login`, enc.body, cookie);
  cookie = mergeSysauthCookie(cookie, loginRes);
  if (cookie?.startsWith('sysauth=')) {
    mercusysLog('info', 'deco login: cookie sysauth ricevuto');
  }
  const loginJson = loginRes.json;
  if (!loginJson || loginJson.data == null || loginJson.data === '') {
    return {
      ok: false,
      step: 'deco_login_response',
      httpStatus: loginRes.status,
      error:
        loginJson?.data === ''
          ? 'Login: risposta data vuota'
          : `Login: risposta senza campo data (HTTP ${loginRes.status})`,
      clients: [],
    };
  }
  let decrypted;
  try {
    decrypted = decryptResponseData(aesKey, aesIv, loginJson.data);
  } catch (err) {
    mercusysLog('error', 'deco login decrypt failed', err instanceof Error ? err.message : String(err));
    return { ok: false, step: 'deco_login_decrypt', error: 'Login: impossibile decifrare la risposta', clients: [] };
  }
  const loginErr = mapLoginError(decrypted, loginRes.status);
  if (loginErr) return loginErr;

  const stok = decrypted.result?.stok ?? decrypted.data?.stok;
  if (!stok) {
    return { ok: false, step: 'deco_login_stok', error: 'Login riuscito ma token stok assente', clients: [] };
  }
  if (!cookie?.startsWith('sysauth=')) {
    mercusysLog('warn', 'deco login: sysauth assente — le richieste post-login falliranno');
    return {
      ok: false,
      step: 'deco_login_cookie',
      error:
        'Login riuscito ma il router non ha restituito il cookie sysauth (necessario per client_list)',
      clients: [],
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
    signN: keysAuth.signN,
    signE: keysAuth.signE,
    seq: keysAuth.seq,
    username,
    password,
  };
}

async function postEncryptedLuci(baseUrl, session, path, payload) {
  if (!session.cookie?.startsWith('sysauth=')) {
    return {
      ok: false,
      status: 0,
      json: { data: '' },
      text: '',
      cookie: session.cookie,
      sessionError: SESSION_INVALID_MSG,
    };
  }
  const enc = encodeEncryptedPayload({
    signN: session.signN,
    signE: session.signE,
    seq: session.seq,
    aesKey: session.aesKey,
    aesIv: session.aesIv,
    username: session.username,
    password: session.password,
    payload,
    isLogin: false,
  });
  return postTpEncrypt(baseUrl, path, enc.body, session.cookie);
}

export async function fetchDecoClientList(baseUrl, session) {
  const path = `/cgi-bin/luci/;stok=${session.stok}/admin/client?form=client_list`;
  const res = await postEncryptedLuci(baseUrl, session, path, {
    operation: 'read',
    params: { device_mac: 'default' },
  });
  if (res.sessionError) {
    return { ok: false, step: 'client_list_session', error: res.sessionError };
  }
  session.cookie = mergeSysauthCookie(session.cookie, res);
  if (emptyEncryptedData(res.json)) {
    return {
      ok: false,
      step: 'client_list_session',
      httpStatus: res.status,
      error: SESSION_INVALID_MSG,
    };
  }
  let decrypted;
  try {
    decrypted = decryptResponseData(session.aesKey, session.aesIv, res.json.data);
  } catch {
    return { ok: false, step: 'client_list_decrypt', error: 'Lista client: decifratura fallita' };
  }
  const ec = decrypted.error_code ?? decrypted.errorcode;
  if (ec != null && ec !== 0 && ec !== '') {
    mercusysLog('warn', 'client_list error_code', String(ec));
  } else {
    mercusysLog('info', 'client_list error_code', '0');
  }
  if (ec !== 0 && ec !== '' && ec != null) {
    return {
      ok: false,
      step: 'client_list',
      httpStatus: res.status,
      error: `Lista client rifiutata (error_code ${ec})`,
    };
  }
  const list = decrypted.result?.client_list || [];
  return { ok: true, clients: list, step: 'client_list' };
}

export async function fetchDecoDeviceList(baseUrl, session) {
  const path = `/cgi-bin/luci/;stok=${session.stok}/admin/device?form=device_list`;
  const res = await postEncryptedLuci(baseUrl, session, path, { operation: 'read' });
  if (res.sessionError) {
    mercusysLog('info', 'device_list saltato', res.sessionError);
    return { ok: true, devices: [], optional: true };
  }
  session.cookie = mergeSysauthCookie(session.cookie, res);
  if (emptyEncryptedData(res.json)) {
    mercusysLog('info', 'device_list: data vuota (opzionale, nessun mesh nel mock)');
    return { ok: true, devices: [], optional: true };
  }
  try {
    const decrypted = decryptResponseData(session.aesKey, session.aesIv, res.json.data);
    const ec = decrypted.error_code ?? decrypted.errorcode;
    const success = decrypted.success;
    if (decrypted.result?.device_list) {
      mercusysLog('info', 'device_list error_code', ec != null ? String(ec) : '0');
      return { ok: true, devices: decrypted.result.device_list };
    }
    mercusysLog(
      'info',
      'device_list opzionale senza result',
      `success=${success} errorcode=${ec ?? 'n/a'}`
    );
    return { ok: true, devices: [], optional: true };
  } catch (err) {
    mercusysLog('info', 'device_list: decifratura fallita (opzionale)', err instanceof Error ? err.message : '');
    return { ok: true, devices: [], optional: true };
  }
}

export async function fetchDecoClientsWithMesh(baseUrl, session) {
  const list = await fetchDecoClientList(baseUrl, session);
  if (!list.ok) return list;
  const devices = await fetchDecoDeviceList(baseUrl, session);
  if (devices.devices?.length) {
    mercusysLog('info', 'mesh device_list', `${devices.devices.length} nodi`);
  }
  return { ...list, meshNodes: devices.devices?.length || 0 };
}

export { encodeEncryptedPayload, buildSignText, md5AdminPassword };