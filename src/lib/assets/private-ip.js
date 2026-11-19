/**
 * Verifica RFC1918 + CGNAT tailscale-style locale (100.64/10 opzionale via env).
 */
function ipv4ToInt(ip) {
  const p = ip.split('.').map((x) => parseInt(x, 10));
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

export function isPrivateIPv4(host) {
  const n = ipv4ToInt(host);
  if (n === null) return false;
  return (
    (n >= ipv4ToInt('10.0.0.0') && n <= ipv4ToInt('10.255.255.255')) ||
    (n >= ipv4ToInt('172.16.0.0') && n <= ipv4ToInt('172.31.255.255')) ||
    (n >= ipv4ToInt('192.168.0.0') && n <= ipv4ToInt('192.168.255.255')) ||
    (n >= ipv4ToInt('100.64.0.0') && n <= ipv4ToInt('100.127.255.255'))
  );
}

export function isLoopback(host) {
  return host === '127.0.0.1' || host === 'localhost';
}

export function assertScanTargetAllowed(target) {
  const t = String(target).trim();
  if (t.includes('/')) {
    const first = t.split('/')[0];
    if (!isPrivateIPv4(first)) {
      throw new Error('Scan consentiti solo su subnet/IP privati RFC1918');
    }
    return t;
  }
  if (/^[a-zA-Z0-9.-]+$/.test(t) && !/^\d+\.\d+\.\d+\.\d+$/.test(t)) {
    return t;
  }
  if (!isPrivateIPv4(t) || isLoopback(t)) {
    throw new Error('Target di scan non consentito (solo IP privati)');
  }
  return t;
}

export function cidrBase24(cidr) {
  const m = String(cidr).trim().match(/^(\d+\.\d+\.\d+)\.\d+\/\d+$/);
  return m ? `${m[1]}.0/24` : cidr;
}

export function hostOctet(ip) {
  const p = ip.split('.');
  return parseInt(p[3], 10);
}

export function ipInCidr(ip, cidr) {
  const [net, bitsStr] = cidr.split('/');
  const bits = bitsStr ? parseInt(bitsStr, 10) : 32;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(net);
  if (a === null || b === null) return false;
  return (a & mask) === (b & mask);
}