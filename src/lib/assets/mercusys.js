/**
 * Integrazione best-effort Mercusys: richiede MERCUSYS_URL e MERCUSYS_PASSWORD.
 * Modulo isolato — in assenza di credenziali non fa nulla.
 */

export function mercusysConfigured() {
  return Boolean(process.env.MERCUSYS_URL && process.env.MERCUSYS_PASSWORD);
}

export async function fetchMercusysClients() {
  if (!mercusysConfigured()) {
    return {
      ok: false,
      error: 'Mercusys non configurato (MERCUSYS_URL / MERCUSYS_PASSWORD mancanti)',
      clients: [],
    };
  }
  const url = process.env.MERCUSYS_URL.replace(/\/$/, '');
  try {
    const res = await fetch(`${url}/`, {
      method: 'GET',
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Router HTTP ${res.status}: API client list non disponibile senza reverse engineering. Usa import CSV manuale.`,
        clients: [],
      };
    }
    return {
      ok: false,
      error:
        'Login Mercusys non implementato (API non documentata). Configura import manuale DHCP.',
      clients: [],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      clients: [],
    };
  }
}