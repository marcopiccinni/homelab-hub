'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

const TABS = [
  ['summary', 'Riepilogo'],
  ['subnet', 'Subnet'],
  ['assets', 'Asset'],
  ['fqdn', 'FQDN'],
  ['import', 'Import'],
  ['scan', 'Scan'],
];

export default function AssetsAdminClient({ initialSubnets = [] }) {
  const [tab, setTab] = useState('summary');
  const [summary, setSummary] = useState(null);
  const [subnets] = useState(initialSubnets);
  const [subnetId, setSubnetId] = useState(
    () =>
      initialSubnets.find((s) => s.cidr && !s.is_non_ip)?.id ??
      initialSubnets[0]?.id ??
      null
  );
  const [grid, setGrid] = useState(null);
  const [assets, setAssets] = useState([]);
  const [q, setQ] = useState('');
  const [fqdns, setFqdns] = useState([]);
  const [detail, setDetail] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [scanTarget, setScanTarget] = useState('10.0.4.0/24');
  const [jobs, setJobs] = useState([]);
  const [mercusys, setMercusys] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const loadSummary = useCallback(async () => {
    const r = await fetch('/api/assets/summary');
    setSummary(await r.json());
  }, []);

  const loadGrid = useCallback(async (id) => {
    if (!id) return;
    const r = await fetch(`/api/assets/subnets/${id}/grid`);
    setGrid(await r.json());
  }, []);

  const loadAssets = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (subnetId && tab === 'assets') params.set('subnetId', String(subnetId));
    const r = await fetch(`/api/assets?${params}`);
    const data = await r.json();
    setAssets(data.assets || []);
  }, [q, subnetId, tab]);

  const loadFqdns = useCallback(async () => {
    const r = await fetch('/api/assets/fqdns');
    const data = await r.json();
    setFqdns(data.fqdns || []);
  }, []);

  const loadJobs = useCallback(async () => {
    const r = await fetch('/api/assets/scans');
    const data = await r.json();
    setJobs(data.jobs || []);
  }, []);

  const loadMercusys = useCallback(async () => {
    const r = await fetch('/api/assets/mercusys');
    setMercusys(await r.json());
  }, []);

  useEffect(() => {
    loadSummary();
    loadJobs();
    loadMercusys();
  }, [loadSummary, loadJobs, loadMercusys]);

  useEffect(() => {
    if (tab === 'subnet' && subnetId) loadGrid(subnetId);
    if (tab === 'assets') loadAssets();
    if (tab === 'fqdn') loadFqdns();
  }, [tab, subnetId, loadGrid, loadAssets, loadFqdns]);

  async function openDetail(id) {
    const r = await fetch(`/api/assets/${id}`);
    if (r.ok) setDetail(await r.json());
  }

  async function startScan(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/assets/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: scanTarget, jobType: 'subnet', profile: 'quick' }),
    });
    const data = await r.json();
    setMsg(data.error || `Scan #${data.id} accodata`);
    await loadJobs();
    setBusy(false);
  }

  async function onImportFile(file, previewOnly) {
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    const url = previewOnly ? '/api/assets/import/preview' : '/api/assets/import';
    const r = await fetch(url, { method: 'POST', body: fd });
    const data = await r.json();
    if (previewOnly) setImportPreview(data);
    else {
      setMsg(`Importati ${data.stats?.assets || 0} asset`);
      await loadAssets();
      await loadSummary();
    }
    setBusy(false);
  }

  return (
    <div className="assets-admin" data-assets-tab={tab}>
      <nav className="assets-tabs" aria-label="Sezioni asset">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'assets-tab assets-tab-active' : 'assets-tab'}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {msg ? (
        <p className="assets-msg" role="status">
          {msg}
        </p>
      ) : null}

      {tab === 'summary' && summary ? (
        <div className="assets-summary-grid">
          <div className="assets-stat-card">
            <span className="assets-stat-value">{summary.assetsActive}</span>
            <span className="assets-stat-label">Asset attivi</span>
          </div>
          <div className="assets-stat-card">
            <span className="assets-stat-value">{summary.pendingDiscovery}</span>
            <span className="assets-stat-label">In coda nuovi device</span>
          </div>
          <div className="assets-stat-card">
            <span className="assets-stat-value">{summary.portDrift?.undeclared ?? 0}</span>
            <span className="assets-stat-label">Porte aperte non documentate</span>
          </div>
          <div className="assets-stat-card">
            <span className="assets-stat-value">{summary.portDrift?.missingExpected ?? 0}</span>
            <span className="assets-stat-label">Porte attese non osservate</span>
          </div>
          {summary.lastScan ? (
            <p className="assets-meta">
              Ultimo scan: #{summary.lastScan.id} {summary.lastScan.status} —{' '}
              {summary.lastScan.target}
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'subnet' ? (
        <div className="assets-subnet-panel">
          <label className="assets-field">
            Subnet
            <select
              value={subnetId || ''}
              onChange={(e) => setSubnetId(parseInt(e.target.value, 10))}
            >
              {subnets
                .filter((s) => !s.is_non_ip)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.family_label} ({s.cidr})
                  </option>
                ))}
            </select>
          </label>
          {grid?.cells?.length ? (
            <div className="ip-grid" data-subnet-id={subnetId}>
              {grid.cells.map((cell) => (
                <IpGridCell key={cell.host} cell={cell} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'assets' ? (
        <div className="assets-list-panel">
          <input
            type="search"
            className="assets-search"
            placeholder="Cerca asset…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadAssets()}
          />
          <button type="button" className="btn-primary assets-btn" onClick={loadAssets}>
            Cerca
          </button>
          <ul className="assets-list">
            {assets.map((a) => (
              <li key={a.id}>
                <button type="button" className="assets-row" onClick={() => openDetail(a.id)}>
                  <strong>{a.asset_code != null ? `${a.asset_code} — ` : ''}{a.name}</strong>
                  <span>{a.ip_list || '—'}</span>
                  <span>{a.location || a.subnet_label || ''}</span>
                </button>
              </li>
            ))}
          </ul>
          {detail ? (
            <div className="assets-detail" role="region" aria-label="Dettaglio asset">
              <button type="button" onClick={() => setDetail(null)}>Chiudi</button>
              <h3>{detail.asset.name}</h3>
              <p>
                IP: {detail.ips.map((i) => i.address).join(', ') || '—'}
              </p>
              <p>FQDN: {detail.fqdns.map((f) => f.fqdn).join(', ') || '—'}</p>
              <h4>Porte dichiarate</h4>
              <ul>
                {detail.declared.map((d) => (
                  <li key={d.id}>
                    {d.port}/{d.protocol} {d.name || ''}
                  </li>
                ))}
              </ul>
              <h4>Porte osservate (ultime)</h4>
              <ul>
                {detail.observed.slice(0, 12).map((o) => (
                  <li key={o.id}>
                    {o.port} {o.state} {o.service_name || ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'fqdn' ? (
        <ul className="assets-fqdn-list">
          {fqdns.map((f) => (
            <li key={f.id}>
              <strong>{f.fqdn}</strong> → {f.ips || 'nessun IP'}
            </li>
          ))}
        </ul>
      ) : null}

      {tab === 'import' ? (
        <div className="assets-import">
          <p>Carica il foglio Excel (General / All / Services). Usa solo dati sintetici nel repo pubblico.</p>
          <input
            type="file"
            accept=".xlsx,.xls"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f, true);
            }}
          />
          {importPreview ? (
            <pre className="assets-preview">{JSON.stringify(importPreview, null, 2)}</pre>
          ) : null}
          <input
            type="file"
            accept=".xlsx,.xls"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f, false);
            }}
          />
          {mercusys ? (
            <p className="assets-muted">
              Mercusys: {mercusys.configured ? mercusys.error || 'OK' : 'non configurato'}
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'scan' ? (
        <form className="assets-scan-form" onSubmit={startScan}>
          <label>
            Target (subnet CIDR o IP privato)
            <input value={scanTarget} onChange={(e) => setScanTarget(e.target.value)} />
          </label>
          <button type="submit" className="btn-primary" disabled={busy}>
            Avvia scan rapido
          </button>
          <ul className="assets-jobs">
            {jobs.map((j) => (
              <li key={j.id}>
                #{j.id} {j.status} {j.target} {j.error ? `— ${j.error}` : ''}
              </li>
            ))}
          </ul>
        </form>
      ) : null}

      <p className="assets-legacy">
        <Link href="/admin/network">Vista legacy host da link</Link>
      </p>
    </div>
  );
}

function IpGridCell({ cell }) {
  return (
    <div
      className={`ip-cell ip-cell-${cell.state}`}
      title={cell.assetName ? `${cell.address} — ${cell.assetName}` : cell.address}
      data-host={cell.host}
    >
      {cell.host}
    </div>
  );
}