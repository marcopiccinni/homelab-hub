import { validateLinkUrl } from './validation.js';
import { ACCESS_TYPES } from './access-environment.js';

function validateOptionalUrl(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, value: null };
  }
  return validateLinkUrl(raw, { allowEmpty: false });
}

/**
 * Valida e normalizza i campi URL / access_type per API admin.
 */
export function parseLinkUrlFields(body, { isFolder = false } = {}) {
  if (isFolder) {
    return {
      ok: true,
      url: '',
      url_external: null,
      url_local_fqdn: null,
      url_ip: null,
      access_type: 'external',
    };
  }

  const access_type = body.access_type || 'external';
  if (!ACCESS_TYPES.includes(access_type)) {
    return { ok: false, error: 'Tipo di risorsa non valido' };
  }

  const ext = validateOptionalUrl(body.url_external);
  if (!ext.ok) return ext;
  const fqdn = validateOptionalUrl(body.url_local_fqdn);
  if (!fqdn.ok) return fqdn;
  const ip = validateOptionalUrl(body.url_ip);
  if (!ip.ok) return ip;

  let legacy = { ok: true, value: null };
  if (body.url) {
    legacy = validateLinkUrl(body.url, { allowEmpty: true });
    if (!legacy.ok) return legacy;
  }

  const hasAny =
    ext.value || fqdn.value || ip.value || legacy.value;

  if (!hasAny) {
    return { ok: false, error: 'Inserisci almeno un URL' };
  }

  if (
    (access_type === 'external' || access_type === 'local_exposed') &&
    !ext.value
  ) {
    return {
      ok: false,
      error: 'URL esterno obbligatorio per risorse esterne o locali esposte',
    };
  }

  const url =
    legacy.value ||
    ext.value ||
    fqdn.value ||
    ip.value ||
    '';

  return {
    ok: true,
    url,
    url_external: ext.value,
    url_local_fqdn: fqdn.value,
    url_ip: ip.value,
    access_type,
  };
}