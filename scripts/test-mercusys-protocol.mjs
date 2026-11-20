#!/usr/bin/env node
/**
 * Verifica formato tpEncrypt (login con params.password, sign login vs non-login, seq fisso).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'url';
import {
  aesCbcDecrypt,
  aesCbcEncrypt,
  rsaEncryptPkcs1Hex,
  rsaEncryptSignPkcs1Hex,
} from '../src/lib/assets/mercusys-crypto.js';
import {
  buildSignText,
  encodeEncryptedPayload,
  md5AdminPassword,
} from '../src/lib/assets/mercusys-deco.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEQ = 103450989;
const aesKey = '1700123456789012';
const aesIv = '1700987654321098';
const password = 'synth-test';
const hash = md5AdminPassword('admin', password);

const loginSign = buildSignText({
  isLogin: true,
  aesKey,
  aesIv,
  authHash: hash,
  seq: SEQ,
  dataBase64Len: 100,
});
assert.match(loginSign, /^k=/);
assert.match(loginSign, /&i=/);
assert.match(loginSign, /&h=/);
assert.ok(loginSign.endsWith(`&s=${SEQ + 100}`));

const readSign = buildSignText({
  isLogin: false,
  aesKey,
  aesIv,
  authHash: hash,
  seq: SEQ,
  dataBase64Len: 50,
});
assert.equal(readSign, `h=${hash}&s=${SEQ + 50}`);
assert.ok(!readSign.includes('k='));

const paramsLoginJson = JSON.stringify({
  operation: 'login',
  params: { password: 'deadbeef' },
});
assert.ok(paramsLoginJson.includes('params'));

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
    s.on('error', rej);
  });
}

const port = await freePort();
const mock = spawn(process.execPath, ['scripts/fixtures/mercusys-halo-mock.mjs', String(port)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});

await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('mock timeout')), 5000);
  mock.stdout.on('data', (d) => {
    if (String(d).includes('listening')) {
      clearTimeout(t);
      resolve();
    }
  });
  mock.on('error', reject);
});

const base = `http://127.0.0.1:${port}`;
const loginRoot = '/cgi-bin/luci/;stok=/login';

async function postJson(path, body, cookie) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const json = await res.json();
  const setCookie = res.headers.getSetCookie?.() || [];
  const c =
    setCookie
      .map((x) => x.split(';')[0])
      .find((x) => x.startsWith('sysauth=')) || null;
  return { json, cookie: c };
}

const keys = await postJson(`${loginRoot}?form=keys`, { operation: 'read' });
const auth = await postJson(`${loginRoot}?form=auth`, { operation: 'read' }, keys.cookie);
const pwdN = keys.json.result.password[0];
const pwdE = keys.json.result.password[1] || '010001';
const signN = auth.json.result.key[0];
const signE = auth.json.result.key[1] || '010001';
const seq = auth.json.result.seq;

const flatLogin = encodeEncryptedPayload({
  signN,
  signE,
  seq,
  aesKey,
  aesIv,
  username: 'admin',
  password,
  payload: {
    password: rsaEncryptPkcs1Hex(pwdN, pwdE, password),
    operation: 'login',
  },
  isLogin: true,
});

const flatRes = await fetch(`${base}${loginRoot}?form=login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: auth.cookie || keys.cookie || '' },
  body: flatLogin.body,
});
const flatJson = await flatRes.json();
assert.ok(flatJson.data, 'flat login returns encrypted data');
const flatDec = JSON.parse(aesCbcDecrypt(aesKey, aesIv, Buffer.from(flatJson.data, 'base64')).toString('utf8'));
assert.equal(flatDec.error_code, 1);

const goodLogin = encodeEncryptedPayload({
  signN,
  signE,
  seq,
  aesKey,
  aesIv,
  username: 'admin',
  password,
  payload: {
    operation: 'login',
    params: { password: rsaEncryptPkcs1Hex(pwdN, pwdE, password) },
  },
  isLogin: true,
});

const goodRes = await fetch(`${base}${loginRoot}?form=login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: auth.cookie || keys.cookie || '' },
  body: goodLogin.body,
});
const goodJson = await goodRes.json();
assert.ok(goodJson.data, 'login OK data');
const goodDec = JSON.parse(aesCbcDecrypt(aesKey, aesIv, Buffer.from(goodJson.data, 'base64')).toString('utf8'));
assert.equal(goodDec.error_code, 0);
assert.ok(goodDec.result?.stok);

const badSignBody = (() => {
  const json = JSON.stringify({
    operation: 'login',
    params: { password: rsaEncryptPkcs1Hex(pwdN, pwdE, password) },
  });
  const data = aesCbcEncrypt(aesKey, aesIv, json).toString('base64');
  const signText = `h=${hash}&s=${seq + data.length}`;
  const sign = rsaEncryptSignPkcs1Hex(signN, signE, signText);
  return `sign=${sign}&data=${encodeURIComponent(data)}`;
})();

const badSignRes = await fetch(`${base}${loginRoot}?form=login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: badSignBody,
});
const badSignJson = await badSignRes.json();
assert.equal(badSignJson.error_code, 1);

const readEnc = encodeEncryptedPayload({
  signN,
  signE,
  seq,
  aesKey,
  aesIv,
  username: 'admin',
  password,
  payload: { operation: 'read', params: { device_mac: 'default' } },
  isLogin: false,
});
const readSignExpected = buildSignText({
  isLogin: false,
  aesKey,
  aesIv,
  authHash: hash,
  seq,
  dataBase64Len: readEnc.data.length,
});
assert.equal(readSignExpected.indexOf('k='), -1);

mock.kill('SIGTERM');
console.log('test-mercusys-protocol: OK');