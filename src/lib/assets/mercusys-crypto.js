import { createDecipheriv, createCipheriv, createPublicKey, publicEncrypt, constants } from 'node:crypto';

const PKCS1_V1_5_OVERHEAD = 11;

export function byteLen(n) {
  if (n <= 0n) return 0;
  return Math.ceil((BigInt(n).toString(16).length || 1) / 2);
}

function bigintToB64(buf) {
  return buf.toString('base64');
}

export function rsaPublicKeyFromHex(nHex, eHex) {
  const n = Buffer.from(nHex, 'hex');
  let eBuf;
  const eBig = BigInt(`0x${eHex}`);
  if (eBig === 65537n) {
    eBuf = Buffer.from([0x01, 0x00, 0x01]);
  } else {
    eBuf = Buffer.from(eHex.replace(/^0+/, '') || '0', 'hex');
    if (eBuf.length === 0) eBuf = Buffer.from([0]);
  }
  return createPublicKey({
    key: {
      kty: 'RSA',
      n: bigintToB64(n),
      e: bigintToB64(eBuf),
    },
    format: 'jwk',
  });
}

/** PKCS#1 v1.5 RSA password (chiave 1024 bit), blocchi da (modulus-11) byte. */
export function rsaEncryptPkcs1Hex(nHex, eHex, plaintext) {
  const key = rsaPublicKeyFromHex(nHex, eHex);
  const nBytes = Buffer.from(nHex, 'hex').length;
  const blockSize = nBytes - PKCS1_V1_5_OVERHEAD;
  const input = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  let out = '';
  for (let i = 0; i < input.length; i += blockSize) {
    const chunk = input.subarray(i, i + blockSize);
    const hex = publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, chunk).toString('hex');
    out += hex.length % 2 === 0 ? hex : `0${hex}`;
  }
  return out;
}

/** Firma tpEncrypt: chiave 512 bit, max 2 blocchi da 53 caratteri ciascuno. */
const SIGN_PLAINTEXT_CHUNK = 53;

export function rsaEncryptSignPkcs1Hex(nHex, eHex, signText) {
  const key = rsaPublicKeyFromHex(nHex, eHex);
  const enc = (s) => {
    const hex = publicEncrypt(
      { key, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(s, 'utf8')
    ).toString('hex');
    return hex.length % 2 === 0 ? hex : `0${hex}`;
  };
  const t = String(signText);
  if (t.length <= SIGN_PLAINTEXT_CHUNK) return enc(t);
  return enc(t.slice(0, SIGN_PLAINTEXT_CHUNK)) + enc(t.slice(SIGN_PLAINTEXT_CHUNK));
}

/** Come tpEncrypt.genKey: 16 caratteri da timestamp + random. */
export function generateAesKeyIv() {
  const gen = () => ((Date.now() + '') + String(1e9 * Math.random())).substr(0, 16);
  return { key: gen(), iv: gen() };
}

export function aesCbcEncrypt(keyStr, ivStr, plaintext) {
  const key = Buffer.from(String(keyStr), 'utf8');
  const iv = Buffer.from(String(ivStr), 'utf8');
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
}

export function aesCbcDecrypt(keyStr, ivStr, ciphertext) {
  const key = Buffer.from(String(keyStr), 'utf8');
  const iv = Buffer.from(String(ivStr), 'utf8');
  const decipher = createDecipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptMercusysPasswordLegacy(password, nn) {
  const key = nn.padEnd(16, '\0').slice(0, 16);
  const cipher = createCipheriv('aes-128-ecb', Buffer.from(key, 'utf8'), null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]).toString('base64');
}