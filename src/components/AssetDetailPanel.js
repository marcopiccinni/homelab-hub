'use client';

import { useState } from 'react';
import Link from 'next/link';

const PORT_BADGE = {
  ok: 'assets-badge-ok',
  undeclared: 'assets-badge-warn',
  missing: 'assets-badge-muted',
};

export default function AssetDetailPanel({ detail, onClose, onRefresh, setMsg, setBusy }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(() => ({ ...detail.asset }));
  const [newIp, setNewIp] = useState('');
  const [newMac, setNewMac] = useState('');

  if (!detail) return null;
  const { asset, interfaces, ips, fqdns, portRows, scanHistory, dashboardLinks } = detail;

  async function api(path, opts) {
    setBusy(true);
    const r = await fetch(path, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) setMsg(data.error || 'Errore');
    else setMsg('');
    await onRefresh(asset.id);
    setBusy(false);
    return r.ok;
  }

  async function saveAsset() {
    await api(`/api/assets/${asset.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setEdit(false);
  }

  async function deleteAsset() {
    if (!confirm(`Eliminare asset «${asset.name}»?`)) return;
    const ok = await api(`/api/assets/${asset.id}`, { method: 'DELETE' });
    if (ok) onClose();
  }

  async function assignIp() {
    if (!newIp.trim()) return;
    await api(`/api/assets/${asset.id}/assign-ip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: newIp.trim() }),
    });
    setNewIp('');
  }

  async function addMac() {
    if (!newMac.trim()) return;
    await api(`/api/assets/${asset.id}/interfaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac_address: newMac.trim(), iface_type: 'eth' }),
    });
    setNewMac('');
  }

  async function documentPort(row) {
    const linkId = row.observed?.link_id;
    await api('/api/assets/ports/document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        observedId: row.observed.id,
        link_id: linkId,
      }),
    });
  }

  async function scanHost() {
    const target = ips[0]?.address;
    if (!target) {
      setMsg('Assegna un IP per eseguire lo scan host');
      return;
    }
    setBusy(true);
    const r = await fetch('/api/assets/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, jobType: 'host', profile: 'full' }),
    });
    const data = await r.json();
    setMsg(data.error || `Scan host #${data.id} accodata`);
    setBusy(false);
  }

  return (
    <div className="assets-detail-card" role="dialog" aria-label={`Dettaglio ${asset.name}`}>
      <header className="assets-detail-header">
        <div>
          <h3 className="assets-detail-title">
            {asset.asset_code != null ? `${asset.asset_code} — ` : ''}
            {asset.name}
          </h3>
          <p className="assets-detail-sub">
            {asset.category || 'Senza categoria'} · {asset.location || 'Posizione non impostata'}
          </p>
        </div>
        <div className="assets-detail-actions">
          <Link href={`/admin/assets/host/${asset.id}`} className="btn-secondary assets-btn-sm">
            Vista host
          </Link>
          <button type="button" className="btn-secondary assets-btn-sm" onClick={scanHost}>
            Scan host
          </button>
          <button type="button" className="btn-secondary assets-btn-sm" onClick={() => setEdit((v) => !v)}>
            {edit ? 'Annulla' : 'Modifica'}
          </button>
          <button type="button" className="btn-secondary assets-btn-sm" onClick={deleteAsset}>
            Elimina
          </button>
          <button type="button" className="btn-primary assets-btn-sm" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </header>

      {edit ? (
        <section className="assets-section assets-section-edit">
          <h4>Modifica identità</h4>
          <EditAssetForm form={form} setForm={setForm} onSave={saveAsset} />
        </section>
      ) : (
        <section className="assets-section">
          <h4>Identità</h4>
          {asset.hostname ? <p>Hostname: {asset.hostname}</p> : null}
          <p className="assets-muted-sm">Stato: {asset.status}</p>
          {asset.description ? <p>{asset.description}</p> : <p className="assets-empty">Nessuna descrizione</p>}
        </section>
      )}

      <section className="assets-section">
        <h4>Interfacce / MAC</h4>
        {interfaces.length ? (
          <ul className="assets-chip-list">
            {interfaces.map((i) => (
              <li key={i.id}>
                <span className="assets-chip">{i.iface_type}</span>{' '}
                {i.mac_address || i.ieee_address || '—'} {i.label ? `(${i.label})` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="assets-empty">Nessuna interfaccia registrata</p>
        )}
        <div className="assets-inline-form">
          <input
            placeholder="MAC (es. aa:bb:cc:dd:ee:ff)"
            value={newMac}
            onChange={(e) => setNewMac(e.target.value)}
          />
          <button type="button" className="btn-secondary assets-btn-sm" onClick={addMac}>
            Aggiungi
          </button>
        </div>
      </section>

      <section className="assets-section">
        <h4>IP</h4>
        {ips.length ? (
          <ul className="assets-chip-list">
            {ips.map((i) => (
              <li key={i.id}>
                <strong>{i.address}</strong>
                <span className="assets-muted-sm">
                  {i.last_seen_at ? ` · visto ${i.last_seen_at}` : ' · mai visto da scan'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="assets-empty">Nessun IP assegnato</p>
        )}
        <div className="assets-inline-form">
          <input placeholder="10.0.x.x" value={newIp} onChange={(e) => setNewIp(e.target.value)} />
          <button type="button" className="btn-secondary assets-btn-sm" onClick={assignIp}>
            Assegna IP
          </button>
        </div>
      </section>

      <section className="assets-section">
        <h4>FQDN</h4>
        {fqdns.length ? (
          <ul className="assets-chip-list">
            {fqdns.map((f) => (
              <li key={f.id}>{f.fqdn}</li>
            ))}
          </ul>
        ) : (
          <p className="assets-empty">Nessun FQDN collegato</p>
        )}
      </section>

      <section className="assets-section">
        <h4>Porte dichiarate vs osservate</h4>
        {portRows?.length ? (
          <table className="assets-table assets-table-ports">
            <thead>
              <tr>
                <th>Porta</th>
                <th>Dichiarata</th>
                <th>Osservata</th>
                <th>Stato</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {portRows.map((row) => (
                <tr key={`${row.protocol}-${row.port}`}>
                  <td>
                    {row.port}/{row.protocol}
                  </td>
                  <td>{row.declared?.name || row.declared?.service_name || '—'}</td>
                  <td>
                    {row.observed
                      ? `${row.observed.state || ''} ${row.observed.service_name || ''}`.trim() || 'aperta'
                      : '—'}
                  </td>
                  <td>
                    <span className={`assets-badge ${PORT_BADGE[row.status] || ''}`}>
                      {row.status === 'ok' ? 'Allineata' : row.status === 'undeclared' ? 'Non documentata' : 'Attesa assente'}
                    </span>
                  </td>
                  <td>
                    {row.status === 'undeclared' && row.observed ? (
                      <button
                        type="button"
                        className="btn-secondary assets-btn-sm"
                        onClick={() => documentPort(row)}
                      >
                        Documenta
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="assets-empty">Nessun dato porte — esegui uno scan</p>
        )}
        {dashboardLinks?.length ? (
          <p className="assets-muted-sm">Collegamenti dashboard disponibili per servizi intranet.</p>
        ) : null}
      </section>

      <section className="assets-section">
        <h4>Storico scan</h4>
        {scanHistory?.length ? (
          <ul className="assets-simple-list">
            {scanHistory.map((j) => (
              <li key={j.id}>
                #{j.id} {j.profile} — {j.status} {j.finished_at || ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="assets-empty">Nessuno scan collegato a questo asset</p>
        )}
      </section>

      <section className="assets-section">
        <h4>Note</h4>
        {asset.notes ? <p>{asset.notes}</p> : <p className="assets-empty">Nessuna nota</p>}
      </section>
    </div>
  );
}

function EditAssetForm({ form, setForm, onSave }) {
  return (
    <div className="assets-form-grid">
      <label>
        Nome
        <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label>
        Codice
        <input
          type="number"
          value={form.asset_code ?? ''}
          onChange={(e) => setForm({ ...form, asset_code: parseInt(e.target.value, 10) || null })}
        />
      </label>
      <label>
        Categoria
        <input value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })} />
      </label>
      <label>
        Posizione
        <input value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} />
      </label>
      <label className="assets-span-2">
        Note
        <textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
      </label>
      <button type="button" className="btn-primary" onClick={onSave}>
        Salva
      </button>
    </div>
  );
}