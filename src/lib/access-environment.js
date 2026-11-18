import {
  DEFAULT_LOCAL_SUFFIXES,
  DEFAULT_VPN_CIDRS,
  isPrivateIpv4,
  isVpnIpv4,
  matchesLocalSuffix,
  ipv4ToInt,
} from './url-heuristics.js';
import { badgeForResolvedHref } from './resolved-url-badge.js';

export const ACCESS_TYPES = [
  'local_only',
  'local_exposed',
  'external',
  'vpn_only',
];

export const VIEWER_ENVIRONMENTS = [
  'ip',
  'local_fqdn',
  'vpn',
  'external',
];

const COOKIE_NAME = 'homelab_env_override';

function parseListEnv(value, fallback) {
  if (!value || !String(value).trim()) return fallback;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getLocalSuffixes() {
  return parseListEnv(process.env.LOCAL_SUFFIXES, DEFAULT_LOCAL_SUFFIXES);
}

export function getVpnCidrs() {
  return parseListEnv(process.env.VPN_RANGES, DEFAULT_VPN_CIDRS);
}

export function stripHostPort(hostHeader) {
  if (!hostHeader) return '';
  const h = hostHeader.split(',')[0].trim();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end >= 0 ? h.slice(1, end).toLowerCase() : h.toLowerCase();
  }
  const idx = h.lastIndexOf(':');
  if (idx > 0 && h.includes('.') && ipv4ToInt(h.slice(0, idx)) !== null) {
    return h.slice(0, idx).toLowerCase();
  }
  if (idx > 0 && !h.includes('.')) {
    return h.slice(0, idx).toLowerCase();
  }
  return h.toLowerCase();
}

/**
 * @param {string} hostHeader - Host o X-Forwarded-Host
 * @param {string|undefined|null} cookieOverride - valore cookie homelab_env_override
 * @returns {'ip'|'local_fqdn'|'vpn'|'external'}
 */
export function detectAccessEnvironment(hostHeader, cookieOverride) {
  const override = cookieOverride?.trim();
  if (override && override !== 'auto') {
    if (VIEWER_ENVIRONMENTS.includes(override)) return override;
  }

  const host = stripHostPort(hostHeader);
  if (!host) return 'external';

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isVpnIpv4(host, getVpnCidrs())) return 'vpn';
    if (isPrivateIpv4(host)) return 'ip';
    return 'external';
  }

  if (matchesLocalSuffix(host, getLocalSuffixes())) return 'local_fqdn';

  return 'external';
}

export function environmentLabel(env) {
  const labels = {
    ip: 'Rete IP',
    local_fqdn: 'Rete locale',
    vpn: 'VPN',
    external: 'Esterno',
    auto: 'Automatico',
  };
  return labels[env] ?? env;
}

function firstUrl(...values) {
  for (const v of values) {
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

/**
 * Risolve href e stato lock per un link nella dashboard.
 */
export function resolveLinkForViewer(link, viewerEnv) {
  const access = link.access_type || 'external';
  const isFolder = link.is_folder === 1;

  if (isFolder) {
    return {
      href: null,
      locked: false,
      lockReason: null,
      badge: null,
    };
  }

  const fallback = firstUrl(
    link.url_external,
    link.url_local_fqdn,
    link.url_ip,
    link.url
  );

  let href = null;
  let locked = false;
  let lockReason = null;

  if (viewerEnv === 'external') {
    if (access === 'local_only' || access === 'vpn_only') {
      return {
        href: null,
        locked: true,
        lockReason: 'Disponibile solo in rete locale',
        badge: null,
      };
    }
    href = firstUrl(link.url_external, link.url);
    locked = !href;
    lockReason = href ? null : 'URL non configurato';
  } else if (viewerEnv === 'ip') {
    href = firstUrl(
      link.url_ip,
      link.url_local_fqdn,
      link.url_external,
      link.url
    );
    locked = !href;
    lockReason = href ? null : 'URL non configurato';
  } else if (viewerEnv === 'local_fqdn' || viewerEnv === 'vpn') {
    href = firstUrl(
      link.url_local_fqdn,
      link.url_ip,
      link.url_external,
      link.url
    );
    locked = !href;
    lockReason = href ? null : 'URL non configurato';
  } else {
    href = fallback;
    locked = !href;
    lockReason = href ? null : 'URL non configurato';
  }

  const badge =
    locked || !href ? null : badgeForResolvedHref(link, href);

  return { href, locked, lockReason, badge };
}

export function enrichLinksForViewer(links, viewerEnv) {
  return links.map((link) => {
    const resolved = resolveLinkForViewer(link, viewerEnv);
    return {
      ...link,
      resolvedHref: resolved.href,
      locked: resolved.locked,
      lockReason: resolved.lockReason,
      envBadge: resolved.badge,
    };
  });
}

export { COOKIE_NAME };