#!/usr/bin/env node
import assert from 'node:assert/strict';
import { encryptMercusysPassword } from '../src/lib/assets/mercusys.js';
import { rsaEncryptPkcs1Hex } from '../src/lib/assets/mercusys-crypto.js';

const enc1 = encryptMercusysPassword('test', '0123456789abcdef');
assert.ok(enc1.length > 8);
const enc2 = encryptMercusysPassword('test', '0123456789abcdef');
assert.equal(enc1, enc2);
assert.ok(rsaEncryptPkcs1Hex.length > 0);
console.log('test-mercusys: OK');