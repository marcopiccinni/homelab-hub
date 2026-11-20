'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

const STATUS_BADGE = {
  ok: 'assets-badge-ok',
  undeclared: 'assets-badge-warn',
  missing: 'assets-badge-muted',
};

export default function HostViewClient({ assetId, initialSubnets = [] }) {
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await fetch(`/api/assets/hosts/${assetId}`);
    if (r.ok) setView(await r.json());
    else setMsg('Host non trovato');
  }, [assetId]);

  useEffect(() => {
    load();
  }, [load]);

  async function scanHost() {
    setBusy(true);
    const r = await fetch(`/api/assets/hosts/${assetId}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'quick' }),
    });
    const data = await r.json();
    setMsg(data.error || `Scan accodati: ${(data.jobIds || []).join(', ')}`);
    setBusy(false);
  }

  async function documentPort(observedId) {
    setBusy(true);
    const r = await fetch('/api/assets/ports/document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observedId }),
    });
    const data = await r.json();
    setMsg(data.error || 'Porta documentata');
    await load();
    setBusy(false);
  }

  if (!view) {
    return (
      <p className="assets-muted" role="status">
        {msg || 'Caricamento vista host…'}
      </p>
    );
  }

  const { asset, endpoints, rows, counts } = view;

  return (
    <div className="assets-host-view" data-testid="host-view-detail">
      <header className="assets-host-head">
        <div>
          <h2 className="assets-host-title">
            {asset.asset_code != null ? `${asset.asset_code} — ` : ''}
            {asset.name}
          </h2>
          <p className="assets-muted-sm">
            {endpoints.ips?.map((i) => i.address).join(', ') || 'Nessun IP'}
            {endpoints.fqdns?.length
              ? ` · ${endpoints.fqdns.map((f) => f.fqdn).join(', ')}`
              : ''}
          </p>
        </div>
        <div className="assets-host-actions">
          <button type="button" className="btn-secondary" disabled={busy} onClick={scanHost}>
            Scan host
          </button>
          <Link href="/admin/assets" className="btn-secondary assets-host-back">
            ← Asset admin
          </Link>
        </div>
      </header>

      {msg ? (
        <p className="assets-msg" role="status">
          {msg}
        </p>
      ) : null}

      <p className="assets-muted">
        Porte aperte (nmap): <strong>{counts.open}</strong> · non documentate:{' '}
        <strong>{counts.undocumented}</strong> · righe totali: {counts.total}
      </p>

      <div className="assets-table-scroll">
        <table className="assets-table assets-host-ports-table">
          <thead>
            <tr>
              <th>Porta</th>
              <th>IP / FQDN</th>
              <th>Servizio</th>
              <th>Fonte</th>
              <th>Stato</th>
              <th>Link</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={`${row.protocol}-${row.port}`}>
                  <td>
                    {row.port}/{row.protocol}
                  </td>
                  <td className="assets-host-endpoints">
                    {[...row.ips, ...row.fqdns].join(', ') || '—'}
                  </td>
                  <td>
                    {row.observed?.service_name ||
                      row.declared?.name ||
                      row.declared?.service_name ||
                      '—'}
                    {row.observed?.service_version ? ` (${row.observed.service_version})` : ''}
                  </td>
                  <td>{row.sourceLabel}</td>
                  <td>
                    <span className={`assets-badge ${STATUS_BADGE[row.status] || ''}`}>
                      {row.statusLabel}
                    </span>
                  </td>
                  <td>
                    {row.links?.length
                      ? row.links.map((l) => (
                          <Link key={`${l.id}-${l.urlField}`} href="/" className="assets-host-link">
                            {l.title}
                          </Link>
                        ))
                      : '—'}
                  </td>
                  <td>
                    {row.status === 'undeclared' && row.observedId ? (
                      <button
                        type="button"
                        className="btn-secondary assets-btn-sm"
                        disabled={busy}
                        onClick={() => documentPort(row.observedId)}
                      >
                        Documenta
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="assets-empty">
                  Nessuna porta — import Services, link dashboard o scan nmap
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}