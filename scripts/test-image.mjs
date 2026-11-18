#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectImageType } from '../src/lib/upload-utils.js';
import { prepareIconUploadOutput } from '../src/lib/image-utils.js';

// 1×1 PNG rosso
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const detected = detectImageType(PNG_1X1);
assert.ok(detected);

const out = await prepareIconUploadOutput(PNG_1X1, detected);
assert.ok(out?.buffer?.length > 0, 'output non vuoto');
assert.ok(detectImageType(out.buffer), 'output decodificabile');

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hl-upload-')), 'x.webp');
fs.writeFileSync(tmp, out.buffer);
assert.ok(fs.statSync(tmp).size > 0);

console.log('test-image: tutti i test superati');