export const PRESENCE_ONLINE_DAYS = 7;

/**
 * @returns {'online'|'stale'|'never'}
 */
export function presenceStatus(lastSeenAt, now = new Date()) {
  if (!lastSeenAt) return 'never';
  const seen = parseSqliteDatetime(lastSeenAt);
  if (!seen) return 'never';
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - PRESENCE_ONLINE_DAYS);
  return seen >= cutoff ? 'online' : 'stale';
}

function parseSqliteDatetime(raw) {
  const s = String(raw).trim();
  if (!s) return null;
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatPresenceDate(lastSeenAt) {
  const d = parseSqliteDatetime(lastSeenAt);
  if (!d) return null;
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function daysAgo(lastSeenAt, now = new Date()) {
  const d = parseSqliteDatetime(lastSeenAt);
  if (!d) return null;
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'oggi';
  if (days === 1) return '1 giorno';
  return `${days} giorni`;
}

export function sourceLabel(lastSeenSource) {
  if (lastSeenSource === 'mercusys') return 'Router Mercusys';
  if (lastSeenSource === 'scan') return 'Scansione di rete (nmap/ARP)';
  if (lastSeenSource) return lastSeenSource;
  return 'non annotata';
}

export function presenceLabel(status, lastSeenAt) {
  if (status === 'online') return 'Online';
  if (status === 'never') return 'Mai rilevato';
  const ago = daysAgo(lastSeenAt);
  const when = formatPresenceDate(lastSeenAt);
  if (ago && when) return `Non visto da ${ago} (${when})`;
  if (when) return `Non visto (${when})`;
  return 'Non visto di recente';
}

export function presenceTooltip(lastSeenAt, lastSeenSource) {
  if (!lastSeenAt) {
    return (
      'Nessuna rilevazione in rete. L’import Excel non aggiorna la presenza: ' +
      'solo scansione o sincronizzazione con il router.'
    );
  }
  const when = formatPresenceDate(lastSeenAt) || lastSeenAt;
  const src = sourceLabel(lastSeenSource);
  return `Ultima rilevazione: ${when} · Fonte: ${src}. «Online» = visto negli ultimi ${PRESENCE_ONLINE_DAYS} giorni.`;
}

export function enrichAssetPresence(row) {
  const status = presenceStatus(row.last_seen_at);
  return {
    ...row,
    presence_status: status,
    presence_label: presenceLabel(status, row.last_seen_at),
    presence_tooltip: presenceTooltip(row.last_seen_at, row.last_seen_source),
    is_online: status === 'online' ? 1 : 0,
  };
}