import { classifyLegacyUrl } from './url-heuristics.js';

function canonicalUrl(raw) {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim();
  try {
    const href = s.includes('://') ? s : `http://${s}`;
    const u = new URL(href);
    u.hash = '';
    let out = u.href;
    if (out.endsWith('/') && u.pathname !== '/') {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    return s.replace(/\/$/, '');
  }
}

/**
 * Badge della card: quale campo URL è stato risolto (non l'ambiente del viewer).
 * @returns {'ip'|'local'|'web'|null}
 */
export function badgeForResolvedHref(link, href) {
  if (!href) return null;

  const target = canonicalUrl(href);
  const pairs = [
    ['ip', link.url_ip],
    ['local', link.url_local_fqdn],
    ['web', link.url_external],
  ];

  for (const [kind, val] of pairs) {
    if (val && canonicalUrl(val) === target) return kind;
  }

  if (link.url && canonicalUrl(link.url) === target) {
    const legacy = classifyLegacyUrl(link.url);
    if (legacy.url_ip) return 'ip';
    if (legacy.url_local_fqdn) return 'local';
    return 'web';
  }

  return 'web';
}

export function badgeDisplayLabel(badge) {
  const labels = {
    ip: 'IP',
    local: 'Locale',
    web: 'Web',
  };
  return labels[badge] ?? badge;
}