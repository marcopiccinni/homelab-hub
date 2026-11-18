/**
 * Euristica URL conmotione (migrazione e test). Sincronizzare i default con access-environment.
 */

export const DEFAULT_LOCAL_SUFFIXES = ['.lan', '.home.arpa', '.local', '.internal'];
export const DEFAULT_VPN_CIDRS = ['100.64.0.0/10'];

export function parseHostnameFromUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const url = raw.startsWith('http://') || raw.startsWith('https://')
      ? raw
      : `http://${raw}`;
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function ipv4ToInt(ip) {
  const p = ip.split('.').map((n) => parseInt(n, 10));
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

export function parseCidr(cidr) {
  const [ip, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const base = ipv4ToInt(ip);
  if (base === null || Number.isNaN(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base, mask };
}

export function ipv4InCidr(ip, cidr) {
  const parsed = parseCidr(cidr);
  const value = ipv4ToInt(ip);
  if (!parsed || value === null) return false;
  return (value & parsed.mask) === (parsed.base & parsed.mask);
}

export function isPrivateIpv4(ip) {
  return (
    ipv4InCidr(ip, '10.0.0.0/8') ||
    ipv4InCidr(ip, '172.16.0.0/12') ||
    ipv4InCidr(ip, '192.168.0.0/16') ||
    ipv4InCidr(ip, '127.0.0.0/8')
  );
}

export function isVpnIpv4(ip, vpnCidrs = DEFAULT_VPN_CIDRS) {
  return vpnCidrs.some((c) => ipv4InCidr(ip, c));
}

export function matchesLocalSuffix(
  host,
  suffixes = DEFAULT_LOCAL_SUFFIXES
) {
  const h = host.toLowerCase();
  return suffixes.some((s) => h.endsWith(s.toLowerCase()));
}

/**
 * Classifica un URL legacy per la migrazione 003.
 */
export function classifyLegacyUrl(url, opts = {}) {
  const suffixes = opts.localSuffixes ?? DEFAULT_LOCAL_SUFFIXES;
  const vpnCidrs = opts.vpnCidrs ?? DEFAULT_VPN_CIDRS;

  const empty = {
    url_external: null,
    url_local_fqdn: null,
    url_ip: null,
    access_type: 'external',
  };

  if (!url || !String(url).trim()) return empty;

  const normalized = String(url).trim();
  const host = parseHostnameFromUrl(normalized);
  if (!host) {
    return { ...empty, url_external: normalized, access_type: 'external' };
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isVpnIpv4(host, vpnCidrs)) {
      return {
        url_external: null,
        url_local_fqdn: null,
        url_ip: normalized,
        access_type: 'vpn_only',
      };
    }
    if (isPrivateIpv4(host)) {
      return {
        url_external: null,
        url_local_fqdn: null,
        url_ip: normalized,
        access_type: 'local_only',
      };
    }
    return {
      url_external: normalized,
      url_local_fqdn: null,
      url_ip: null,
      access_type: 'external',
    };
  }

  if (matchesLocalSuffix(host, suffixes)) {
    return {
      url_external: null,
      url_local_fqdn: normalized,
      url_ip: null,
      access_type: 'local_only',
    };
  }

  return {
    url_external: normalized,
    url_local_fqdn: null,
    url_ip: null,
    access_type: 'external',
  };
}