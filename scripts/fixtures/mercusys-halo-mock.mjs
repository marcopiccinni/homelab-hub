#!/usr/bin/env node
/**
 * Mock Mercusys Halo H1500X — protocollo tpEncrypt (chiavi sintetiche).
 * Login richiede params.password; payload piatto -> error_code 1 cifrato.
 */
import http from 'node:http';
import { generateKeyPairSync, privateDecrypt, constants, createCipheriv, createDecipheriv } from 'node:crypto';
import { createHash } from 'node:crypto';

const PORT = parseInt(process.argv[2] || '19081', 10);
const SYNTH_PASSWORD = process.env.MERCUSYS_SYNTH_PASSWORD || 'synth-test';

const pwdKeys = generateKeyPairSync('rsa', { modulusLength: 1024 });
const signKeys = generateKeyPairSync('rsa', { modulusLength: 512 });

function keyHex(pubKey) {
  const jwk = pubKey.export({ format: 'jwk' });
  return [Buffer.from(jwk.n, 'base64').toString('hex'), '010001'];
}

const [pwdN, pwdE] = keyHex(pwdKeys.publicKey);
const [signN, signE] = keyHex(signKeys.publicKey);
const SEQ = 103450989;

/** cookie sysauth=… → { aesKey, aesIv, hash } dopo login OK */
const sessions = new Map();

function rsaDecryptHex(privKey, hex) {
  const buf = Buffer.from(hex, 'hex');
  const modBits = privKey.asymmetricKeyDetails?.modulusLength || 512;
  const nBytes = Math.ceil(modBits / 8);
  const out = [];
  for (let i = 0; i < buf.length; i += nBytes) {
    const chunk = buf.subarray(i, i + nBytes);
    out.push(privateDecrypt({ key: privKey, padding: constants.RSA_PKCS1_PADDING }, chunk));
  }
  return Buffer.concat(out).toString('utf8');
}

function aesEncrypt(keyStr, ivStr, plain) {
  const c = createCipheriv('aes-128-cbc', Buffer.from(keyStr, 'utf8'), Buffer.from(ivStr, 'utf8'));
  return Buffer.concat([c.update(plain, 'utf8'), c.final()]);
}

function aesDecrypt(keyStr, ivStr, b64) {
  const d = createDecipheriv('aes-128-cbc', Buffer.from(keyStr, 'utf8'), Buffer.from(ivStr, 'utf8'));
  const raw = Buffer.from(b64, 'base64');
  return Buffer.concat([d.update(raw), d.final()]).toString('utf8');
}

function parseBody(req) {
  return new Promise((res, rej) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => res(body));
    req.on('error', rej);
  });
}

function cookieValue(req) {
  const raw = req.headers.cookie || '';
  const m = raw.match(/sysauth=([^;]+)/);
  return m?.[1] || null;
}

function sendJson(res, obj, cookie) {
  if (cookie) res.setHeader('Set-Cookie', `sysauth=${cookie}; Path=/`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function operationFromBody(body) {
  if (!body) return null;
  if (body.trim().startsWith('{')) {
    try {
      return JSON.parse(body).operation;
    } catch {
      return null;
    }
  }
  return new URLSearchParams(body).get('operation');
}

function parseTpBody(body) {
  const params = new URLSearchParams(body);
  const sign = params.get('sign');
  const data = params.get('data');
  if (!sign || !data) return { error: 'missing sign/data' };
  return { sign, data };
}

function decryptLogin(sign, data) {
  const signPlain = rsaDecryptHex(signKeys.privateKey, sign);
  if (!signPlain.startsWith('k=') || !signPlain.includes('&i=') || !signPlain.includes('&h=')) {
    return { error: 'login sign must include k=, i=, h=' };
  }
  const aesKey = signPlain.match(/k=(.{16})/)?.[1];
  const aesIv = signPlain.match(/i=(.{16})/)?.[1];
  if (!aesKey || !aesIv) return { error: 'login sign k/i must be 16 chars' };
  const sMatch = signPlain.match(/&s=(\d+)/);
  const expectedS = SEQ + data.length;
  if (!sMatch || Number(sMatch[1]) !== expectedS) {
    return { error: `sign s must be seq+len (${expectedS})` };
  }
  let json;
  try {
    json = JSON.parse(aesDecrypt(aesKey, aesIv, data));
  } catch {
    return { error: 'decrypt failed' };
  }
  return { signPlain, aesKey, aesIv, json };
}

function decryptSession(sign, data, session) {
  const signPlain = rsaDecryptHex(signKeys.privateKey, sign);
  if (signPlain.includes('k=') || signPlain.includes('&i=')) {
    return { error: 'non-login sign must not include k/i' };
  }
  if (!signPlain.startsWith('h=')) return { error: 'non-login sign must start with h=' };
  const hMatch = signPlain.match(/^h=([a-f0-9]+)/);
  if (!hMatch || hMatch[1] !== session.hash) return { error: 'sign hash mismatch' };
  const sMatch = signPlain.match(/&s=(\d+)/);
  const expectedS = SEQ + data.length;
  if (!sMatch || Number(sMatch[1]) !== expectedS) {
    return { error: `sign s must be seq+len (${expectedS})` };
  }
  let json;
  try {
    json = JSON.parse(aesDecrypt(session.aesKey, session.aesIv, data));
  } catch {
    return { error: 'decrypt failed' };
  }
  return { signPlain, json };
}

const server = http.createServer(async (req, res) => {
  const rawUrl = req.url || '/';
  if (req.method === 'GET' && (rawUrl === '/' || rawUrl.startsWith('/?'))) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<meta http-equiv="refresh" content="0; URL=/webpages/index.html" />');
    return;
  }
  if (req.method === 'GET' && rawUrl.includes('form=login')) {
    sendJson(res, { data: '' });
    return;
  }
  if (req.method === 'POST' && rawUrl.includes('/cgi-bin/luci/')) {
    const form = rawUrl.match(/[?&]form=([^&]+)/)?.[1];
    const body = await parseBody(req);
    const op = operationFromBody(body);

    if (form === 'keys' && op === 'read') {
      sendJson(res, { result: { username: '', password: [pwdN, pwdE] }, error_code: 0 }, 'synthsysauth');
      return;
    }
    if (form === 'auth' && op === 'read') {
      sendJson(res, { result: { key: [signN, signE], seq: SEQ }, error_code: 0 }, 'synthsysauth');
      return;
    }
    if (form === 'login') {
      const tp = parseTpBody(body);
      if (tp.error) {
        sendJson(res, { error_code: 1, msg: tp.error });
        return;
      }
      const dec = decryptLogin(tp.sign, tp.data);
      if (dec.error) {
        sendJson(res, { error_code: 1, msg: dec.error });
        return;
      }
      if (dec.json.operation !== 'login') {
        sendJson(res, { error_code: 1, msg: 'operation must be login' });
        return;
      }
      const pwdField =
        dec.json.params?.password != null ? dec.json.params.password : dec.json.password;
      const flatRejected = dec.json.password != null && dec.json.params == null;
      if (flatRejected) {
        const errPayload = aesEncrypt(
          dec.aesKey,
          dec.aesIv,
          JSON.stringify({ error_code: 1 })
        ).toString('base64');
        sendJson(res, { data: errPayload });
        return;
      }
      if (dec.json.params?.password == null) {
        sendJson(res, { error_code: 1, msg: 'login requires params.password' });
        return;
      }
      const hash = createHash('md5').update(`admin${SYNTH_PASSWORD}`).digest('hex');
      if (!dec.signPlain.includes(`h=${hash}`)) {
        sendJson(res, { error_code: 1, msg: 'sign hash mismatch' });
        return;
      }
      let pwdPlain = '';
      try {
        pwdPlain = rsaDecryptHex(pwdKeys.privateKey, pwdField);
      } catch {
        pwdPlain = '';
      }
      if (pwdPlain !== SYNTH_PASSWORD) {
        const errPayload = aesEncrypt(
          dec.aesKey,
          dec.aesIv,
          JSON.stringify({ error_code: -5002, result: { attemptsAllowed: 2 } })
        ).toString('base64');
        sendJson(res, { data: errPayload });
        return;
      }
      const stok = 'synthstokfixture01';
      const okPayload = aesEncrypt(
        dec.aesKey,
        dec.aesIv,
        JSON.stringify({ error_code: 0, result: { stok } })
      ).toString('base64');
      const cookie = `sess-${stok}`;
      sessions.set(cookie, { aesKey: dec.aesKey, aesIv: dec.aesIv, hash });
      sendJson(res, { data: okPayload }, cookie);
      return;
    }
    if (form === 'client_list' || form === 'device_list') {
      const auth = cookieValue(req);
      const session = auth && sessions.get(auth);
      if (!session) {
        sendJson(res, { data: '' });
        return;
      }
      const tp = parseTpBody(body);
      if (tp.error) {
        sendJson(res, { error_code: 1, msg: tp.error });
        return;
      }
      const dec = decryptSession(tp.sign, tp.data, session);
      if (dec.error) {
        sendJson(res, { error_code: 1, msg: dec.error });
        return;
      }
      if (form === 'client_list') {
        const clients = [
          {
            name: 'c3ludGgtbGFuLWE=',
            ip: '10.0.5.10',
            mac: '02-11-22-33-44-55',
            online: '1',
            connection_type: 'wired',
            wire_type: 'ethernet',
            interface: 'lan',
            access_host: '02-AA-BB-CC-DD-01',
            client_type: 'phone',
            client_mesh: '0',
          },
          {
            name: 'c3ludGgtbGFuLWI=',
            ip: '10.0.5.11',
            mac: '02-11-22-33-44-56',
            online: '1',
            connection_type: 'wireless',
            wire_type: 'wifi',
            interface: 'host',
            access_host: '02-AA-BB-CC-DD-01',
            client_type: 'pc',
            client_mesh: '0',
          },
        ];
        const payload = aesEncrypt(
          session.aesKey,
          session.aesIv,
          JSON.stringify({ error_code: 0, result: { client_list: clients } })
        ).toString('base64');
        sendJson(res, { data: payload });
        return;
      }
      const payload = aesEncrypt(
        session.aesKey,
        session.aesIv,
        JSON.stringify({ success: true, errorcode: 0 })
      ).toString('base64');
      sendJson(res, { data: payload });
      return;
    }
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mercusys-halo-mock listening on http://127.0.0.1:${PORT}`);
});