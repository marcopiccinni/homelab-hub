#!/usr/bin/env node
import assert from 'node:assert/strict';
import { encryptMercusysPassword } from '../src/lib/assets/mercusys.js';
import { rsaEncryptPkcs1Hex } from '../src/lib/assets/mercusys-crypto.js';
import {
  DEFAULT_MERCUSYS_TIMEOUT_MS,
  getMercusysTimeoutMs,
  getMercusysDispatcher,
  mercusysTimeoutError,
  isMercusysTimeoutError,
} from '../src/lib/assets/mercusys-fetch.js';

const enc1 = encryptMercusysPassword('test', '0123456789abcdef');
assert.ok(enc1.length > 8);
const enc2 = encryptMercusysPassword('test', '0123456789abcdef');
assert.equal(enc1, enc2);
assert.ok(rsaEncryptPkcs1Hex.length > 0);

assert.equal(getMercusysTimeoutMs(), DEFAULT_MERCUSYS_TIMEOUT_MS);
process.env.MERCUSYS_TIMEOUT_MS = '45000';
assert.equal(getMercusysTimeoutMs(), 45000);
delete process.env.MERCUSYS_TIMEOUT_MS;
assert.equal(getMercusysTimeoutMs(), 30000);

assert.ok(getMercusysDispatcher());
const te = mercusysTimeoutError('client_list', 12001);
assert.equal(te.step, 'client_list_timeout');
assert.equal(te.code, 'MERCUSYS_TIMEOUT');
assert.ok(isMercusysTimeoutError(te));
assert.ok(isMercusysTimeoutError({ name: 'TimeoutError' }));

console.log('test-mercusys: OK');