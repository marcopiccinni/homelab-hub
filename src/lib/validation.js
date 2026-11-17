/**
 * Shared validation and sanitization for link fields (API + safe client fallbacks).
 */

const UNSAFE_URL_PROTOCOL = /^(javascript|data|vbscript|file):/i;

/**
 * Normalize and validate link URL: only http/https allowed when non-empty.
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateLinkUrl(raw, { allowEmpty = true } = {}) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    if (allowEmpty) return { ok: true, value: '' };
    return { ok: false, error: 'URL obbligatorio' };
  }

  let url = String(raw).trim();
  if (UNSAFE_URL_PROTOCOL.test(url)) {
    return { ok: false, error: 'Protocollo URL non consentito' };
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'Sono consentiti solo URL http o https' };
    }
    return { ok: true, value: parsed.href };
  } catch {
    return { ok: false, error: 'URL non valido' };
  }
}

/** Safe href for rendering (blocks javascript:, data:, etc.). */
export function safeHref(raw) {
  if (!raw || typeof raw !== 'string') return '#';
  const trimmed = raw.trim();
  if (UNSAFE_URL_PROTOCOL.test(trimmed)) return '#';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch {
      return '#';
    }
  }
  return '#';
}

const LOCAL_UPLOAD_PATTERN = /^\/uploads\/[a-zA-Z0-9._-]+$/;
const REMOTE_ICON_PATTERN = /^https?:\/\//i;

/**
 * Icon: local upload path, empty, or https/http URL (no javascript/data).
 */
export function validateIcon(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, value: null };
  }
  const icon = String(raw).trim();
  if (UNSAFE_URL_PROTOCOL.test(icon)) {
    return { ok: false, error: 'Icona: protocollo non consentito' };
  }
  if (LOCAL_UPLOAD_PATTERN.test(icon)) {
    return { ok: true, value: icon };
  }
  if (icon.startsWith('/uploads/')) {
    return { ok: false, error: 'Percorso icona non valido' };
  }
  if (!REMOTE_ICON_PATTERN.test(icon)) {
    return { ok: true, value: icon.startsWith('/') ? icon : `/${icon.replace(/^\//, '')}` };
  }
  try {
    const parsed = new URL(icon);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'Icona: URL non consentito' };
    }
    return { ok: true, value: parsed.href };
  } catch {
    return { ok: false, error: 'Icona: URL non valido' };
  }
}

/** Safe img src — allow http(s), /uploads, /default-icon.svg, relative paths starting with / */
export function safeImgSrc(raw) {
  if (!raw || typeof raw !== 'string') return '/default-icon.svg';
  const trimmed = raw.trim();
  if (UNSAFE_URL_PROTOCOL.test(trimmed)) return '/default-icon.svg';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      new URL(trimmed);
      return trimmed;
    } catch {
      return '/default-icon.svg';
    }
  }
  if (trimmed.startsWith('/')) return trimmed;
  return '/default-icon.svg';
}

/** Hex color #RGB or #RRGGBB */
const HEX_COLOR = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export function validateColor(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, value: null };
  }
  const color = String(raw).trim();
  if (!HEX_COLOR.test(color)) {
    return { ok: false, error: 'Colore non valido (usa formato #RRGGBB)' };
  }
  return { ok: true, value: color };
}

/** Safe CSS color for backgrounds (hex only). */
export function safeColor(raw) {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (HEX_COLOR.test(trimmed)) return trimmed;
  return undefined;
}