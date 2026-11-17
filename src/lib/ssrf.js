import dns from 'dns';
import { promisify } from 'util';
import net from 'net';

const dnsLookup = promisify(dns.lookup);

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
]);

function parseIpv4Octets(host) {
  const parts = host.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return null;
  }
  return parts;
}

function isBlockedIpv4(host) {
  const o = parseIpv4Octets(host);
  if (!o) return false;

  const [a, b] = o;

  if (a === 127) return true;
  if (a === 0 && b === 0 && o[2] === 0 && o[3] === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a >= 224 && a <= 239) return true;

  const n = ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
  if (n === 0) return true;

  return false;
}

function isBlockedIpv6(host) {
  const lower = host.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('ff')) return true;

  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice('::ffff:'.length);
    if (net.isIPv4(v4)) return isBlockedIpv4(v4);
  }

  return false;
}

function isBlockedIpAddress(host) {
  const kind = net.isIP(host);
  if (kind === 4) return isBlockedIpv4(host);
  if (kind === 6) return isBlockedIpv6(host);
  return false;
}

/**
 * Validate URL for server-side fetch (LAN allowed; block loopback, link-local, metadata, multicast).
 * @returns {Promise<{ ok: true, url: URL } | { ok: false, error: string }>}
 */
export async function assertSafeFetchUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: 'URL non valido' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Sono consentiti solo http e https' };
  }

  if (url.username || url.password) {
    return { ok: false, error: 'Credenziali nell\'URL non consentite' };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    return { ok: false, error: 'Host non consentito' };
  }

  if (isBlockedIpAddress(hostname)) {
    return { ok: false, error: 'Indirizzo IP non consentito' };
  }

  let addresses;
  try {
    const results = await dnsLookup(hostname, { all: true, verbatim: true });
    addresses = Array.isArray(results) ? results : [results];
  } catch {
    if (net.isIP(hostname)) {
      addresses = [{ address: hostname }];
    } else {
      return { ok: false, error: 'Impossibile risolvere l\'host' };
    }
  }

  for (const { address } of addresses) {
    if (isBlockedIpAddress(address)) {
      return { ok: false, error: 'L\'host risolve verso un indirizzo non consentito' };
    }
  }

  return { ok: true, url };
}

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 512 * 1024;

/**
 * Fetch with SSRF re-check on redirects, timeout, and body size cap.
 */
export async function safeFetch(initialUrl, init = {}) {
  let currentUrl = initialUrl;
  let redirectCount = 0;

  while (true) {
    const check = await assertSafeFetchUrl(currentUrl);
    if (!check.ok) {
      throw new Error(check.error);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(check.url.href, {
        ...init,
        signal: controller.signal,
        redirect: 'manual',
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return { response, finalUrl: check.url.href };
      }
      if (redirectCount >= MAX_REDIRECTS) {
        throw new Error('Troppi redirect');
      }
      redirectCount += 1;
      currentUrl = new URL(location, check.url).href;
      continue;
    }

    return { response, finalUrl: check.url.href };
  }
}

/**
 * Read response text up to MAX_BODY_BYTES.
 */
export async function readTextLimited(response) {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';

  while (total < MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      const allowed = value.byteLength - (total - MAX_BODY_BYTES);
      text += decoder.decode(value.subarray(0, allowed), { stream: true });
      break;
    }
    text += decoder.decode(value, { stream: true });
  }

  try {
    await reader.cancel();
  } catch {
    /* ignore */
  }

  return text;
}