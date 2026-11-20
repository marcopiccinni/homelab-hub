'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import AssetDetailPanel from './AssetDetailPanel';
import {
  AssetsNavSidebar,
  AssetsNavMobileBar,
  AssetsNavDrawer,
  findNavLabel,
} from './AssetsNav.js';

const VALID_TABS = new Set([
  'summary',
  'assets',
  'hosts',
  'subnet',
  'fqdn',
  'discovery',
  'scan',
  'mercusys',
  'import',
]);

export default function AssetsAdminClient({ initialSubnets = [], initialSummary = null }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState(() => {
    const t = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
    return t && VALID_TABS.has(t) ? t : 'summary';
  });
  const [toast, setToast] = useState(null);
  const [summary, setSummary] = useState(initialSummary);
  const [subnets] = useState(initialSubnets);
  const [gridSubnetId, setGridSubnetId] = useState(
    () =>
      initialSubnets.find((s) => s.cidr && !s.is_non_ip)?.id ??
      initialSubnets[0]?.id ??
      null
  );
  const [assetSubnetFilter, setAssetSubnetFilter] = useState('');
  const [grid, setGrid] = useState(null);
  const [assets, setAssets] = useState([]);
  const [suggestions, setSuggestions] = useState({ categories: [], locations: [] });
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    location: '',
    online: '',
    sort: 'code',
  });
  const [fqdns, setFqdns] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [pendingImportFile, setPendingImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [mercusysUrl, setMercusysUrl] = useState('');
  const [scanTarget, setScanTarget] = useState('10.0.4.0/24');
  const [scanProfile, setScanProfile] = useState('quick');
  const [jobs, setJobs] = useState([]);
  const [scanWorker, setScanWorker] = useState(null);
  const [discovery, setDiscovery] = useState([]);
  const [mercusys, setMercusys] = useState(null);
  const [hosts, setHosts] = useState([]);
  const [hostSubnetFilter, setHostSubnetFilter] = useState('');
  const [hostQ, setHostQ] = useState('');
  const [hostSuggestions, setHostSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newAsset, setNewAsset] = useState({ name: '', category: '', location: '' });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const loadSummary = useCallback(async () => {
    const r = await fetch('/api/assets/summary');
    setSummary(await r.json());
  }, []);

  const loadGrid = useCallback(async (id) => {
    if (!id) return;
    const r = await fetch(`/api/assets/subnets/${id}/grid`);
    setGrid(await r.json());
  }, []);

  const navigateTab = useCallback(
    (id) => {
      if (!VALID_TABS.has(id)) return;
      setTab(id);
      const params = new URLSearchParams(searchParams?.toString() || '');
      params.set('tab', id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  useEffect(() => {
    const t = searchParams?.get('tab');
    if (t && VALID_TABS.has(t) && t !== tab) setTab(t);
  }, [searchParams, tab]);

  const loadAssets = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (filters.category) params.set('category', filters.category);
    if (filters.location) params.set('location', filters.location);
    if (filters.online) params.set('online', filters.online);
    if (filters.sort) params.set('sort', filters.sort);
    if (assetSubnetFilter) params.set('subnetId', String(assetSubnetFilter));
    const r = await fetch(`/api/assets?${params}`);
    const data = await r.json();
    setAssets(data.assets || []);
    if (data.suggestions) setSuggestions(data.suggestions);
  }, [q, assetSubnetFilter, filters]);

  const loadFqdns = useCallback(async () => {
    const r = await fetch('/api/assets/fqdns');
    const data = await r.json();
    setFqdns(data.fqdns || []);
  }, []);

  const loadJobs = useCallback(async () => {
    const r = await fetch('/api/assets/scans');
    const data = await r.json();
    setJobs(data.jobs || []);
    if (data.worker) setScanWorker(data.worker);
    const active = (data.jobs || []).some((j) => j.status === 'running' || j.status === 'queued');
    if (active) loadSummary();
  }, [loadSummary]);

  const loadHosts = useCallback(async () => {
    const params = new URLSearchParams();
    if (hostSubnetFilter) params.set('subnetId', hostSubnetFilter);
    if (hostQ) params.set('q', hostQ);
    const r = await fetch(`/api/assets/hosts?${params}`);
    if (r.ok) {
      const data = await r.json();
      setHosts(data.hosts || []);
    }
  }, [hostSubnetFilter, hostQ]);

  const loadHostSuggestions = useCallback(async () => {
    const r = await fetch('/api/assets/hosts/suggestions');
    if (r.ok) {
      const data = await r.json();
      setHostSuggestions(data.suggestions || []);
    }
  }, []);

  const loadDiscovery = useCallback(async () => {
    const r = await fetch('/api/assets/discovery');
    const data = await r.json();
    setDiscovery(data.items || []);
  }, []);

  const loadMercusys = useCallback(async () => {
    const [st, cfg] = await Promise.all([
      fetch('/api/assets/mercusys'),
      fetch('/api/assets/settings'),
    ]);
    setMercusys(await st.json());
    const settings = await cfg.json();
    if (settings.mercusys_url) setMercusysUrl(settings.mercusys_url);
  }, []);

  const refreshDetail = useCallback(async (id) => {
    const r = await fetch(`/api/assets/${id}`);
    if (r.ok) setDetail(await r.json());
    await loadAssets();
    await loadSummary();
  }, [loadAssets, loadSummary]);

  useEffect(() => {
    loadSummary();
    loadJobs();
    loadMercusys();
    loadDiscovery();
    const t = setInterval(loadJobs, 4000);
    return () => clearInterval(t);
  }, [loadSummary, loadJobs, loadMercusys, loadDiscovery]);

  useEffect(() => {
    if (tab === 'subnet' && gridSubnetId) loadGrid(gridSubnetId);
    if (tab === 'assets') loadAssets();
    if (tab === 'fqdn') loadFqdns();
    if (tab === 'discovery') loadDiscovery();
    if (tab === 'hosts') {
      loadHosts();
      loadHostSuggestions();
    }
    if (tab === 'mercusys') loadMercusys();
  }, [tab, gridSubnetId, loadGrid, loadAssets, loadFqdns, loadDiscovery, loadHosts, loadHostSuggestions, loadMercusys]);

  async function openDetail(id) {
    setDetailId(id);
    const r = await fetch(`/api/assets/${id}`);
    if (r.ok) setDetail(await r.json());
  }

  function closeDetail() {
    setDetail(null);
    setDetailId(null);
  }

  async function startScan(e) {
    e?.preventDefault();
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/assets/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: scanTarget, jobType: 'subnet', profile: scanProfile }),
    });
    const data = await r.json();
    setMsg(data.error || `Scan #${data.id} accodata`);
    await loadJobs();
    setBusy(false);
  }

  async function scanSubnetFromGrid() {
    const subnet = subnets.find((s) => s.id === gridSubnetId);
    if (!subnet?.cidr) return;
    setScanTarget(subnet.cidr);
    navigateTab('scan');
    setMsg(`Target impostato su ${subnet.cidr}`);
  }

  async function createAssetForGridIp(address) {
    if (!address) return;
    setBusy(true);
    setMsg('');
    const name = `Host ${address}`;
    const r = await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category: 'altro' }),
    });
    const data = await r.json();
    if (!r.ok) {
      setMsg(data.error || 'Creazione asset fallita');
      setBusy(false);
      return;
    }
    await fetch(`/api/assets/${data.id}/assign-ip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    await loadGrid(gridSubnetId);
    await loadSummary();
    navigateTab('assets');
    await openDetail(data.id);
    setToast({
      text: `Asset creato per ${address}`,
      href: `/admin/assets/host/${data.id}`,
      linkLabel: 'Vista host',
    });
    setBusy(false);
  }

  function openAssetFromGrid(cell) {
    if (cell.assetId) {
      navigateTab('assets');
      openDetail(cell.assetId);
      return;
    }
    if (cell.state === 'free') {
      createAssetForGridIp(cell.address);
    }
  }

  async function onImportPreview(file) {
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    setImportResult(null);
    setMsg('');
    const r = await fetch('/api/assets/import/preview', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) {
      setMsg(data.error || 'Anteprima fallita');
      setImportPreview(null);
      setPendingImportFile(null);
    } else {
      setImportPreview(data);
      setPendingImportFile(file);
      if (data.errors?.length) setMsg(data.errors.join(' · '));
    }
    setBusy(false);
  }

  async function commitImport() {
    if (!pendingImportFile) {
      setMsg('Seleziona un file e attendi l’anteprima prima di importare.');
      return;
    }
    const fd = new FormData();
    fd.append('file', pendingImportFile);
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/assets/import', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) {
      setMsg(data.error || 'Import fallito');
      setImportResult(null);
    } else {
      const s = data.stats || {};
      setImportResult(s);
      setMsg(
        `Import completato — nuovi asset: ${s.assets_new ?? 0}, aggiornati: ${s.assets_updated ?? 0}, servizi: ${s.services ?? 0}, righe griglia ignorate: ${s.grid_rows ?? 0}, saltati: ${s.skipped ?? 0}`
      );
      setImportPreview(null);
      setPendingImportFile(null);
      await loadAssets();
      await loadSummary();
      await loadGrid(gridSubnetId);
    }
    setBusy(false);
  }

  async function saveMercusysUrl(e) {
    e.preventDefault();
    setBusy(true);
    const r = await fetch('/api/assets/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mercusys_url: mercusysUrl }),
    });
    const data = await r.json();
    setMsg(data.error || 'URL Mercusys salvato');
    await loadMercusys();
    setBusy(false);
  }

  async function createAsset(e) {
    e.preventDefault();
    setBusy(true);
    const r = await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAsset),
    });
    const data = await r.json();
    if (r.ok) {
      setMsg(`Asset #${data.id} creato`);
      setShowCreate(false);
      setNewAsset({ name: '', category: '', location: '' });
      await loadAssets();
    } else setMsg(data.error || 'Errore');
    setBusy(false);
  }

  async function discoveryAction(id, action, extra = {}) {
    setBusy(true);
    setToast(null);
    const r = await fetch(`/api/assets/discovery/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await r.json();
    if (!r.ok) {
      setMsg(data.error || 'Operazione fallita');
      await loadDiscovery();
      setBusy(false);
      return;
    }
    if (action === 'dismiss') {
      setMsg('Voce ignorata');
      await loadDiscovery();
      await loadSummary();
      setBusy(false);
      return;
    }
    const assetId = data.assetId;
    if (assetId) {
      setAssetSubnetFilter('');
      await loadDiscovery();
      await loadSummary();
      await loadGrid(gridSubnetId);
      navigateTab('assets');
      await loadAssets();
      await openDetail(assetId);
      if (data.merged) {
        setToast({
          text: `Voce di coda unita all’asset «${data.assetName || assetId}» (MAC già noto)`,
          href: `/admin/assets/host/${assetId}`,
          linkLabel: 'Vista host',
        });
        setMsg('');
      } else {
        setMsg(`Asset «${data.assetName || assetId}» creato dalla coda`);
        setToast({
          text: 'Apri l’inventario o la vista host',
          href: `/admin/assets/host/${assetId}`,
          linkLabel: 'Vista host',
        });
      }
    }
    setBusy(false);
  }

  async function importMercusys() {
    setBusy(true);
    const r = await fetch('/api/assets/mercusys/import', { method: 'POST' });
    const data = await r.json();
    if (!r.ok || !data.ok) {
      const detail = [data.step, data.httpStatus ? `HTTP ${data.httpStatus}` : null, data.error]
        .filter(Boolean)
        .join(' — ');
      setMsg(detail || 'Import Mercusys fallito');
    } else if (data.mock) {
      setMsg(
        'Mock disabilitato in produzione: imposta MERCUSYS_MOCK=1 solo per test. Nessun client importato.'
      );
    } else {
      const parts = [];
      if (data.updated) parts.push(`${data.updated} asset aggiornati`);
      if (data.imported) parts.push(`${data.imported} in coda`);
      setMsg(parts.length ? parts.join(' · ') : 'Nessun nuovo client; asset noti aggiornati se online sul router');
    }
    await loadDiscovery();
    await loadAssets();
    await loadSummary();
    setBusy(false);
  }

  async function syncMercusysPresence() {
    setBusy(true);
    const r = await fetch('/api/assets/mercusys/sync', { method: 'POST' });
    const data = await r.json();
    if (!r.ok || !data.ok) {
      const detail = [data.step, data.error].filter(Boolean).join(' — ');
      setMsg(detail || 'Sync router fallita');
    } else {
      setMsg(
        data.updated
          ? `Stato aggiornato per ${data.updated} asset (router)`
          : 'Nessun asset noto con MAC online sul router'
      );
    }
    await loadAssets();
    await loadSummary();
    setBusy(false);
  }

  const navBadges = {
    discovery: summary?.pendingDiscovery ?? discovery.length,
    scan: jobs.filter((j) => ['queued', 'running'].includes(j.status)).length,
  };

  return (
    <div className="admin-assets assets-admin" data-assets-tab={tab}>
      <div className="assets-shell">
        <AssetsNavSidebar
          tab={tab}
          badges={navBadges}
          onSelect={navigateTab}
          className="assets-sidebar-desktop"
        />
        <AssetsNavMobileBar
          tab={tab}
          badges={navBadges}
          currentLabel={findNavLabel(tab)}
          onOpenMenu={() => setMobileNavOpen(true)}
        />
        <AssetsNavDrawer
          open={mobileNavOpen}
          tab={tab}
          badges={navBadges}
          onSelect={navigateTab}
          onClose={() => setMobileNavOpen(false)}
        />
        <div className="assets-main">

      {toast ? (
        <p className="assets-msg assets-toast" role="status">
          {toast.text}{' '}
          <Link href={toast.href} className="assets-link-btn">
            {toast.linkLabel}
          </Link>
        </p>
      ) : null}
      {msg ? (
        <p className="assets-msg" role="status">
          {msg}
        </p>
      ) : null}

      {tab === 'summary' && summary ? (
        <AssetsSummaryPanel summary={summary} />
      ) : null}

      {tab === 'subnet' ? (
        <div className="assets-subnet-panel">
          <label className="assets-field">
            Subnet
            <select
              value={gridSubnetId || ''}
              onChange={(e) => setGridSubnetId(parseInt(e.target.value, 10))}
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
          <button type="button" className="btn-secondary assets-btn-sm" onClick={scanSubnetFromGrid}>
            Scan questa subnet
          </button>
          {grid?.cells?.length ? (
            <div className="ip-grid" data-subnet-id={gridSubnetId}>
              {grid.cells.map((cell) => (
                <IpGridCell key={cell.host} cell={cell} onActivate={() => openAssetFromGrid(cell)} />
              ))}
            </div>
          ) : (
            <p className="assets-empty">Seleziona una subnet con CIDR</p>
          )}
        </div>
      ) : null}

      {tab === 'assets' ? (
        <div className="assets-list-panel">
          <div className="assets-toolbar">
            <input
              type="search"
              className="assets-search"
              placeholder="Cerca asset…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadAssets()}
            />
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="">Tutte le categorie</option>
              {suggestions.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={filters.location}
              onChange={(e) => setFilters({ ...filters, location: e.target.value })}
            >
              <option value="">Tutte le posizioni</option>
              {suggestions.locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <select
              value={filters.online}
              onChange={(e) => setFilters({ ...filters, online: e.target.value })}
              title="Stato di rilevazione in rete (scan o router), non alimentazione dispositivo"
            >
              <option value="">Tutti gli stati</option>
              <option value="1">Online (7 gg)</option>
              <option value="stale">Non visti di recente</option>
              <option value="never">Mai rilevati</option>
              <option value="not_online">Non online (non visti + mai rilevati)</option>
            </select>
            <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
              <option value="code">Ordina per codice</option>
              <option value="name">Ordina per nome</option>
            </select>
            <select
              value={assetSubnetFilter}
              onChange={(e) => setAssetSubnetFilter(e.target.value)}
              aria-label="Filtra subnet inventario"
            >
              <option value="">Tutte le subnet</option>
              {subnets
                .filter((s) => s.cidr && !s.is_non_ip)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.family_label}
                  </option>
                ))}
            </select>
            <button type="button" className="btn-primary assets-btn" onClick={loadAssets}>
              Applica
            </button>
            <button
              type="button"
              className="btn-secondary assets-btn"
              disabled={busy || !mercusys?.passwordConfigured || !mercusys?.routerUrl}
              title="Legge la lista client dal router e aggiorna last_seen degli asset con MAC nota"
              onClick={syncMercusysPresence}
            >
              Aggiorna stato dal router
            </button>
            <button type="button" className="btn-secondary assets-btn" onClick={() => setShowCreate((v) => !v)}>
              Nuovo asset
            </button>
            <a className="assets-link-btn" href="/api/assets/export?format=xlsx">
              Export XLSX
            </a>
            <a className="assets-link-btn" href="/api/assets/export?format=csv">
              Export CSV
            </a>
          </div>

          <p className="assets-muted assets-presence-legend">
            <strong>Stato rete:</strong> riflette l’ultima vista in scansione nmap/ARP o sync Mercusys — non l’alimentazione
            del dispositivo. Excel da solo → spesso «Mai rilevato». Passa il mouse sul badge per data e fonte.
          </p>

          {showCreate ? (
            <form className="assets-create-form" onSubmit={createAsset}>
              <input
                required
                placeholder="Nome"
                value={newAsset.name}
                onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
              />
              <input
                list="cat-suggest"
                placeholder="Categoria"
                value={newAsset.category}
                onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value })}
              />
              <datalist id="cat-suggest">
                {suggestions.categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <input
                list="loc-suggest"
                placeholder="Posizione"
                value={newAsset.location}
                onChange={(e) => setNewAsset({ ...newAsset, location: e.target.value })}
              />
              <datalist id="loc-suggest">
                {suggestions.locations.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
              <button type="submit" className="btn-primary" disabled={busy}>
                Crea
              </button>
            </form>
          ) : null}

          <div className="assets-table-wrap assets-desktop-only">
            <table className="assets-table">
              <thead>
                <tr>
                  <th>Cod.</th>
                  <th>Nome</th>
                  <th>IP</th>
                  <th>Categoria</th>
                  <th>Posizione</th>
                  <th title="Ultima rilevazione in rete (scan/router), ultimi 7 gg = Online">Stato rete</th>
                  <th>Host</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr
                    key={a.id}
                    className={detailId === a.id ? 'assets-row-active' : ''}
                    onClick={() => openDetail(a.id)}
                  >
                    <td>{a.asset_code ?? '—'}</td>
                    <td>{a.name}</td>
                    <td>{a.ip_list || '—'}</td>
                    <td>{a.category || '—'}</td>
                    <td>{a.location || '—'}</td>
                    <td>
                      <PresenceBadge asset={a} />
                    </td>
                    <td>
                      <Link
                        href={`/admin/assets/host/${a.id}`}
                        className="assets-link-btn assets-btn-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Host
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="assets-card-list assets-mobile-only">
            {assets.map((a) => (
              <li key={a.id}>
                <button type="button" className="assets-card" onClick={() => openDetail(a.id)}>
                  <strong>
                    {a.asset_code != null ? `${a.asset_code} — ` : ''}
                    {a.name}
                  </strong>
                  <span>{a.ip_list || '—'}</span>
                  <span className="assets-muted-sm">{a.category || ''}</span>
                </button>
              </li>
            ))}
          </ul>

          {detail ? (
            <AssetDetailPanel
              detail={detail}
              onClose={closeDetail}
              onRefresh={refreshDetail}
              setMsg={setMsg}
              setBusy={setBusy}
            />
          ) : null}
        </div>
      ) : null}

      {tab === 'discovery' ? (
        <div className="assets-discovery">
          <p className="assets-muted">Dispositivi visti da scan non ancora associati a un asset.</p>
          {discovery.length ? (
            <table className="assets-table">
              <thead>
                <tr>
                  <th>IP</th>
                  <th>MAC</th>
                  <th>Hostname</th>
                  <th>Suggerimento</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {discovery.map((d) => (
                  <tr key={d.id}>
                    <td>{d.ip_address}</td>
                    <td>{d.mac_address || '—'}</td>
                    <td>{d.hostname || '—'}</td>
                    <td>{d.suggested_name ? `→ ${d.suggested_name}` : '—'}</td>
                    <td className="assets-actions-cell">
                      <button
                        type="button"
                        className="btn-secondary assets-btn-sm"
                        data-testid="discovery-create"
                        onClick={() => discoveryAction(d.id, 'create')}
                      >
                        Crea asset
                      </button>
                      {d.suggested_asset_id ? (
                        <button
                          type="button"
                          className="btn-secondary assets-btn-sm"
                          onClick={() => discoveryAction(d.id, 'merge', { assetId: d.suggested_asset_id })}
                        >
                          Unisci
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-secondary assets-btn-sm"
                        onClick={() => discoveryAction(d.id, 'dismiss')}
                      >
                        Ignora
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="assets-empty">Coda vuota</p>
          )}
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
          <p>Carica Excel (General / All / Services). Anteprima obbligatoria, poi conferma import.</p>
          <label className="assets-file-label">
            File inventario
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportPreview(f);
              }}
            />
          </label>
          {importPreview ? (
            <ImportPreviewCard preview={importPreview} />
          ) : null}
          <div className="assets-import-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !pendingImportFile}
              onClick={commitImport}
            >
              Conferma import
            </button>
            {importResult ? (
              <button type="button" className="assets-link-btn" onClick={() => navigateTab('assets')}>
                Vai alla lista asset
              </button>
            ) : null}
          </div>
          {importResult ? (
            <ImportResultCard stats={importResult} />
          ) : null}
          <section className="assets-section">
            <h4>Export inventario</h4>
            <p className="assets-muted">Scarica l’inventario corrente senza passare dalla lista asset.</p>
            <p>
              <a className="assets-link-btn" href="/api/assets/export?format=xlsx">
                Export XLSX
              </a>
              {' · '}
              <a className="assets-link-btn" href="/api/assets/export?format=csv">
                Export CSV
              </a>
            </p>
          </section>
        </div>
      ) : null}

      {tab === 'mercusys' ? (
        <div className="assets-mercusys-box" data-testid="mercusys-tab">
          <h4>Router Mercusys</h4>
          <p className="assets-muted">
            Password container:{' '}
            <strong>{mercusys?.passwordConfigured ? 'configurata' : 'non configurata'}</strong>
            {mercusys?.mockMode ? ' · MOCK attivo (solo test)' : ''}
          </p>
          <form className="assets-inline-form" onSubmit={saveMercusysUrl}>
            <input
              type="url"
              placeholder="http://192.168.1.1"
              value={mercusysUrl}
              onChange={(e) => setMercusysUrl(e.target.value)}
            />
            <button type="submit" className="btn-secondary assets-btn-sm">
              Salva URL
            </button>
          </form>
          {mercusys?.lastError ? (
            <p className="assets-msg" role="alert">
              Ultimo errore: {mercusys.lastError}
            </p>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !mercusys?.passwordConfigured || !mercusys?.routerUrl}
            onClick={importMercusys}
          >
            Importa client dal router
          </button>
          <button
            type="button"
            className="btn-secondary assets-btn-sm"
            disabled={busy || !mercusys?.passwordConfigured || !mercusys?.routerUrl}
            onClick={syncMercusysPresence}
          >
            Aggiorna stato dal router
          </button>
        </div>
      ) : null}

      {tab === 'hosts' ? (
        <div className="assets-host-list" data-testid="hosts-tab">
          <p className="assets-muted">
            Porte unificate per asset (nmap, import Services, link dashboard). Apri il dettaglio per documentare o
            avviare scan host.
          </p>
          <div className="assets-host-list-filters">
            <select
              value={hostSubnetFilter}
              onChange={(e) => setHostSubnetFilter(e.target.value)}
              aria-label="Filtra subnet"
            >
              <option value="">Tutte le subnet</option>
              {subnets
                .filter((s) => s.cidr && !s.is_non_ip)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.family_label} ({s.cidr})
                  </option>
                ))}
            </select>
            <input
              placeholder="Cerca nome, codice, IP…"
              value={hostQ}
              onChange={(e) => setHostQ(e.target.value)}
            />
            <button type="button" className="btn-primary assets-btn-sm" onClick={loadHosts}>
              Applica
            </button>
          </div>
          <div className="assets-table-scroll">
            <table className="assets-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>IP</th>
                  <th>Aperte</th>
                  <th>Non doc.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {hosts.map((h) => (
                  <tr key={h.id}>
                    <td>
                      {h.asset_code != null ? `${h.asset_code} — ` : ''}
                      {h.name}
                    </td>
                    <td className="assets-host-endpoints">{h.ip_list || '—'}</td>
                    <td>{h.open_ports}</td>
                    <td>
                      {h.undocumented_ports > 0 ? (
                        <span className="assets-badge assets-badge-warn">{h.undocumented_ports}</span>
                      ) : (
                        h.undocumented_ports
                      )}
                    </td>
                    <td>
                      <Link href={`/admin/assets/host/${h.id}`} className="assets-link-btn">
                        Dettaglio host
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hostSuggestions.length ? (
            <section className="assets-section">
              <h4>Associazioni suggerite</h4>
              <ul className="assets-suggestions-list">
                {hostSuggestions.slice(0, 8).map((s, i) => (
                  <li key={`${s.kind}-${s.link_id || s.fqdn_id}-${i}`}>
                    {s.title || s.host}: {s.reason}
                    {s.suggested_asset_id ? (
                      <>
                        {' '}
                        →{' '}
                        <Link href={`/admin/assets/host/${s.suggested_asset_id}`}>
                          {s.suggested_asset_name}
                        </Link>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === 'scan' ? (
        <div className="assets-scan-panel">
          {scanWorker && (!scanWorker.nmapAvailable || !scanWorker.active) ? (
            <p className="assets-msg assets-warn" role="alert">
              {!scanWorker.nmapAvailable
                ? 'nmap non disponibile nel container: le scansioni non possono partire (ricostruire l’immagine Docker con nmap).'
                : 'Worker scansioni non inizializzato: riavvia il servizio homelab-hub.'}
            </p>
          ) : null}
          <form className="assets-scan-form" onSubmit={startScan}>
            <label>
              Target (subnet CIDR o IP privato)
              <input value={scanTarget} onChange={(e) => setScanTarget(e.target.value)} />
            </label>
            <label>
              Profilo
              <select value={scanProfile} onChange={(e) => setScanProfile(e.target.value)}>
                <option value="quick">Rapido (top 200)</option>
                <option value="full">Completo (-sV)</option>
              </select>
            </label>
            <button type="submit" className="btn-primary" disabled={busy}>
              Avvia scan
            </button>
          </form>
          <ScanJobsList
            jobs={jobs}
            busy={busy}
            onCancel={async (id) => {
              setBusy(true);
              await fetch(`/api/assets/scans/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cancel' }),
              });
              await loadJobs();
              setBusy(false);
            }}
            onRetry={async (id) => {
              setBusy(true);
              await fetch(`/api/assets/scans/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'retry' }),
              });
              await loadJobs();
              setBusy(false);
            }}
          />
        </div>
      ) : null}

      <nav className="admin-nav-links assets-legacy">
        <Link href="/admin/network">Vista legacy host da link</Link>
      </nav>
        </div>
      </div>
    </div>
  );
}

const SCAN_STATUS_LABEL = {
  queued: 'In coda',
  running: 'In corso',
  done: 'Completata',
  failed: 'Fallita',
  stale: 'Bloccata',
  cancelled: 'Annullata',
};

function formatScanDuration(job) {
  const start = job.started_at ? Date.parse(job.started_at.replace(' ', 'T') + 'Z') : NaN;
  if (!Number.isFinite(start)) return null;
  const end = job.finished_at
    ? Date.parse(job.finished_at.replace(' ', 'T') + 'Z')
    : Date.now();
  const sec = Math.max(0, Math.round((end - start) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  return `${m}m ${sec % 60}s`;
}

function ScanJobsList({ jobs, onCancel, onRetry, busy }) {
  if (!jobs.length) {
    return <p className="assets-muted-sm">Nessuna scansione recente.</p>;
  }
  return (
    <ul className="assets-jobs-list">
      {jobs.map((j) => {
        const label = SCAN_STATUS_LABEL[j.status] || j.status;
        const duration = formatScanDuration(j);
        const canCancel = j.status === 'queued' || j.status === 'running';
        const canRetry = ['failed', 'stale', 'cancelled', 'done'].includes(j.status);
        return (
          <li
            key={j.id}
            className={`assets-job-card assets-job-${j.status}`}
            data-testid={`scan-job-${j.id}`}
          >
            <div className="assets-job-head">
              <span className="assets-job-status">{label}</span>
              <span className="assets-muted-sm">#{j.id}</span>
            </div>
            <div className="assets-job-target">{j.target}</div>
            <div className="assets-job-meta">
              <span>Profilo: {j.profile === 'full' ? 'completo' : 'rapido'}</span>
              {duration ? <span>Durata: {duration}</span> : null}
              {j.status === 'running' && j.started_at ? (
                <span>Avviata: {j.started_at.replace('T', ' ').slice(0, 19)}</span>
              ) : null}
            </div>
            {j.progress ? <div className="assets-job-progress">{j.progress}</div> : null}
            {j.error ? (
              <div className="assets-job-error" role="alert">
                {j.error}
              </div>
            ) : null}
            <div className="assets-job-actions">
              {canCancel ? (
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => onCancel(j.id)}>
                  Annulla
                </button>
              ) : null}
              {canRetry ? (
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => onRetry(j.id)}>
                  Ripeti
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AssetsSummaryPanel({ summary }) {
  return (
    <>
      <div className="assets-summary-grid">
        <StatCard value={summary.assetsActive} label="Asset attivi" />
        <StatCard value={summary.online} label="Online (7 gg)" title="Visti da scan o router negli ultimi 7 giorni" />
        <StatCard
          value={summary.presenceStale ?? summary.offline}
          label="Non visti di recente"
          title="Ultima rilevazione oltre 7 giorni fa"
        />
        <StatCard value={summary.presenceNever ?? 0} label="Mai rilevati" title="Nessuna scansione/router su questo asset" />
        <StatCard value={summary.pendingDiscovery} label="Coda nuovi device" />
        <StatCard value={summary.portDrift?.undeclared ?? 0} label="Porte non documentate" />
        <StatCard value={summary.portDrift?.missingExpected ?? 0} label="Porte attese assenti" />
      </div>
      {summary.byCategory?.length ? (
        <section className="assets-section">
          <h4>Per categoria</h4>
          <ul className="assets-chip-list">
            {summary.byCategory.map((c) => (
              <li key={c.category}>
                <span className="assets-chip">{c.category}</span> {c.c}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {summary.byLocation?.length ? (
        <section className="assets-section">
          <h4>Per posizione</h4>
          <ul className="assets-chip-list">
            {summary.byLocation.map((c) => (
              <li key={c.location}>
                <span className="assets-chip">{c.location}</span> {c.c}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {summary.bySubnet?.length ? (
        <section className="assets-section">
          <h4>Occupazione subnet</h4>
          <ul className="assets-occupancy-list">
            {summary.bySubnet.map((s) => (
              <li key={s.id}>
                <div className="assets-occupancy-head">
                  <span>
                    {s.family_label} <span className="assets-muted-sm">({s.cidr})</span>
                  </span>
                  <span>
                    {s.ip_count} IP · {s.assets_count} asset · {s.occupancy_pct}%
                  </span>
                </div>
                <div className="assets-occupancy-bar" aria-hidden>
                  <span style={{ width: `${Math.min(100, s.occupancy_pct)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {summary.recentJobs?.length ? (
        <section className="assets-section">
          <h4>Ultimi scan</h4>
          <ul className="assets-simple-list">
            {summary.recentJobs.map((j) => (
              <li key={j.id}>
                #{j.id} {j.status} {j.progress || ''} — {j.target}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function PresenceBadge({ asset }) {
  const status = asset.presence_status || (asset.is_online ? 'online' : asset.last_seen_at ? 'stale' : 'never');
  const label = asset.presence_label || (status === 'online' ? 'Online' : status === 'never' ? 'Mai rilevato' : 'Non visto');
  const tip = asset.presence_tooltip || '';
  const cls =
    status === 'online'
      ? 'assets-badge-ok'
      : status === 'stale'
        ? 'assets-badge-warn'
        : 'assets-badge-muted';
  return (
    <span className={`assets-badge ${cls}`} title={tip}>
      {label}
    </span>
  );
}

function StatCard({ value, label, title }) {
  return (
    <div className="assets-stat-card" title={title || undefined}>
      <span className="assets-stat-value">{value}</span>
      <span className="assets-stat-label">{label}</span>
    </div>
  );
}

function ImportResultCard({ stats }) {
  return (
    <div className="assets-preview-card assets-import-result" data-testid="import-result">
      <h4>Riepilogo import</h4>
      <ul className="assets-simple-list">
        <li>Asset nuovi: {stats.assets_new ?? 0}</li>
        <li>Asset aggiornati: {stats.assets_updated ?? 0}</li>
        <li>Servizi: {stats.services ?? 0}</li>
        <li>Subnet nuove: {stats.subnets_new ?? 0}</li>
        <li>Subnet aggiornate: {stats.subnets_updated ?? 0}</li>
        <li>Righe griglia IP ignorate: {stats.grid_rows ?? 0}</li>
        <li>Righe saltate: {stats.skipped ?? 0}</li>
      </ul>
    </div>
  );
}

function ImportPreviewCard({ preview }) {
  return (
    <div className="assets-preview-card" data-testid="import-preview">
      <p>
        Fogli: {preview.sheets?.join(', ')} · Asset in anteprima: <strong>{preview.assets}</strong> (nuovi{' '}
        {preview.assets_new ?? 0}, aggiornati {preview.assets_updated ?? 0}) · Servizi:{' '}
        <strong>{preview.services}</strong>
      </p>
      <p>
        Subnet nuove: {preview.subnets_new ?? 0} · aggiornate: {preview.subnets_updated ?? 0} · righe griglia:{' '}
        {preview.grid_rows ?? 0} · saltati: {preview.skipped ?? 0}
      </p>
      {preview.errors?.length ? (
        <p className="assets-msg" role="alert">
          {preview.errors.join(' · ')}
        </p>
      ) : null}
      {preview.rows?.length ? (
        <table className="assets-table assets-table-compact">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nome</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.id}</td>
                <td>{r.name}</td>
                <td>{r.ip || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function IpGridCell({ cell, onActivate }) {
  const title =
    cell.state === 'free'
      ? `${cell.address} — libero (clic per creare asset)`
      : cell.assetName
        ? `${cell.address} — ${cell.assetName} (clic per dettaglio)`
        : `${cell.address} — ${cell.state}`;
  const canActivate = cell.state === 'free' || cell.assetId;
  return (
    <button
      type="button"
      className={`ip-cell ip-cell-${cell.state} ${canActivate ? 'ip-cell-action' : ''}`}
      title={title}
      data-host={cell.host}
      disabled={!canActivate}
      onClick={() => onActivate?.()}
    >
      {cell.host}
    </button>
  );
}