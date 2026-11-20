#!/usr/bin/env node
/**
 * Mock Mercusys Halo H1500X — protocollo LuCI Deco (chiavi sintetiche, solo test).
 * Usage: node mercusys-halo-mock.mjs [port]
 */
import http from 'node:http';
import { generateKeyPairSync, privateDecrypt, constants, createCipheriv, createDecipheriv } from 'node:crypto';

const PORT = parseInt(process.argv[2] || '19081', 10);
const SYNTH_PASSWORD = process.env.MERCUSYS_SYNTH_PASSWORD || 'synth-test';

const pwdKeys = generateKeyPairSync('rsa', { modulusLength: 1024 });
const signKeys = generateKeyPairSync('rsa', { modulusLength: 512 });

function keyHex(pubKey) {
  const jwk = pubKey.export({ format: 'jwk' });
  const n = Buffer.from(jwk.n, 'base64').toString('hex');
  const e = Buffer.from(jwk.e, 'base64').toString('hex');
  return [n, e];
}

const [pwdN, pwdE] = keyHex(pwdKeys.publicKey);
const [signN, signE] = keyHex(signKeys.publicKey);
const SEQ = 103450989;

function rsaDecryptHex(privKey, hex) {
  const buf = Buffer.from(hex, 'hex');
  const nBytes = Math.ceil((privKey.asymmetricKeyDetails?.modulusLength || 512) / 8);
  const out = [];
  for (let i = 0; i < buf.length; i += nBytes) {
    const block = buf.subarray(i, i + nBytes);
    out.push(privateDecrypt({ key: privKey, padding: constants.RSA_PKCS1_PADDING }, block));
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

const server = http.createServer(async (req, res) => {
  const rawUrl = req.url || '/';
  if (req.method === 'GET' && (rawUrl === '/' || rawUrl.startsWith('/?'))) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<meta http-equiv="refresh" content="0; URL=/webpages/index.html" />');
    return;
  }
  if (req.method === 'GET' && rawUrl.startsWith('/webpages/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      '<html><head><script src="/js/libs/encrypt.js"></script><script src="/js/libs/tpEncrypt.js"></script></head><body>synth</body></html>'
    );
    return;
  }
  if (req.method === 'GET' && rawUrl.includes('form=keys')) {
    sendJson(res, { error_code: 1, msg: 'no such callback' });
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
      sendJson(
        res,
        { result: { username: '', password: [pwdN, pwdE] }, error_code: 0 },
        'synthsysauth'
      );
      return;
    }
    if (form === 'auth' && op === 'read') {
      sendJson(res, { result: { key: [signN, signE], seq: SEQ }, error_code: 0 }, 'synthsysauth');
      return;
    }
    if (form === 'login') {
      const params = new URLSearchParams(body);
      const sign = params.get('sign');
      const data = params.get('data');
      if (!sign || !data) {
        res.writeHead(400);
        res.end('bad login');
        return;
      }
      const signPlain = rsaDecryptHex(signKeys.privateKey, sign);
      const aesKey = signPlain.match(/k=(\d+)/)?.[1];
      const aesIv = signPlain.match(/i=(\d+)/)?.[1];
      let payload;
      try {
        payload = JSON.parse(aesDecrypt(aesKey, aesIv, data));
      } catch {
        res.writeHead(400);
        res.end('bad decrypt');
        return;
      }
      const encPwd = payload?.params?.password;
      let pwdPlain = '';
      try {
        pwdPlain = rsaDecryptHex(pwdKeys.privateKey, encPwd);
      } catch {
        pwdPlain = '';
      }
      if (pwdPlain !== SYNTH_PASSWORD) {
        const errPayload = aesEncrypt(
          aesKey,
          aesIv,
          JSON.stringify({ error_code: -5002, result: {} })
        ).toString('base64');
        sendJson(res, { data: errPayload });
        return;
      }
      const okPayload = aesEncrypt(
        aesKey,
        aesIv,
        JSON.stringify({ error_code: 0, result: { stok: 'synthstokfixture01' } })
      ).toString('base64');
      sendJson(res, { data: okPayload }, 'synthsysauth');
      return;
    }
    if (form === 'client_list') {
      const params = new URLSearchParams(body);
      const sign = params.get('sign');
      const signPlain = rsaDecryptHex(signKeys.privateKey, sign);
      const aesKey = signPlain.match(/k=(\d+)/)?.[1];
      const aesIv = signPlain.match(/i=(\d+)/)?.[1];
      const clients = [
        { name: 'c3ludGgtbGFuLWE=', hostname: 'synth-lan-a', ip: '10.0.5.10', mac: '02:11:22:33:44:55' },
        { name: 'c3ludGgtbGFuLWI=', hostname: 'synth-lan-b', ip: '10.0.5.11', mac: '02:11:22:33:44:56' },
      ];
      const payload = aesEncrypt(
        aesKey,
        aesIv,
        JSON.stringify({ error_code: 0, result: { client_list: clients } })
      ).toString('base64');
      sendJson(res, { data: payload });
      return;
    }
    if (form === 'device_list') {
      const params = new URLSearchParams(body);
      const sign = params.get('sign');
      const signPlain = rsaDecryptHex(signKeys.privateKey, sign);
      const aesKey = signPlain.match(/k=(\d+)/)?.[1];
      const aesIv = signPlain.match(/i=(\d+)/)?.[1];
      const devices = [
        { device_model: 'SYNTH-XR', mac: '02:AA:BB:CC:DD:01', nickname: 'SYNRo1' },
        { device_model: 'SYNTH-XS', mac: '02:AA:BB:CC:DD:02', nickname: 'SYNRo2' },
      ];
      const payload = aesEncrypt(
        aesKey,
        aesIv,
        JSON.stringify({ error_code: 0, result: { device_list: devices } })
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