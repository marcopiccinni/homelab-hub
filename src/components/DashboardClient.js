'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Settings, X, Rows3, Lock, Check } from 'lucide-react';
import { safeHref, safeImgSrc, safeColor } from '../lib/validation';
import { badgeDisplayLabel } from '../lib/resolved-url-badge';
import EnvironmentSelector from './EnvironmentSelector';
import { DashboardSortableGrid } from './DashboardSortable';

function EnvBadge({ badge, locked }) {
  if (locked) {
    return (
      <span className="card-env-badge card-env-locked" title="Disponibile solo in rete locale">
        <Lock size={12} aria-hidden="true" />
        <span className="sr-only">Bloccato fuori rete locale</span>
      </span>
    );
  }
  if (!badge) return null;
  return (
    <span className="card-env-badge">{badgeDisplayLabel(badge)}</span>
  );
}

function LinkCard({ link, links, onOpenFolder, reorderMode = false }) {
  const isFolder = link.is_folder === 1;
  const tint = safeColor(link.color);
  const cardStyle = tint ? { backgroundColor: `${tint}20` } : undefined;
  const locked = link.locked === true;
  const href = link.resolvedHref ? safeHref(link.resolvedHref) : '#';
  const lockTip = link.lockReason || 'Disponibile solo in rete locale';
  const sortAttr = { 'data-sort-order': link.sort_order };
  const wiggleClass = reorderMode ? ' card-wiggle' : '';

  const folderItems = isFolder
    ? links
        .filter((l) => l.folder_id === link.id)
        .sort((a, b) => a.sort_order - b.sort_order)
    : [];

  if (isFolder) {
    if (reorderMode) {
      return (
        <div
          className={`card card-static${wiggleClass}`}
          style={cardStyle}
          data-link-title={link.title}
          role="group"
          aria-label={`Gruppo ${link.title} — riordina trascinando`}
          {...sortAttr}
        >
          <div className="folder-grid" aria-hidden="true">
            {folderItems.slice(0, 4).map((item) => (
              <img
                key={item.id}
                src={safeImgSrc(item.icon)}
                className="folder-mini-icon"
                alt=""
                width={24}
                height={24}
                loading="lazy"
              />
            ))}
          </div>
          <span className="card-title">{link.title}</span>
        </div>
      );
    }
    return (
      <button
        type="button"
        className="card card-static"
        style={cardStyle}
        onClick={() => onOpenFolder(link)}
        aria-label={`Apri gruppo ${link.title}`}
        data-link-title={link.title}
        {...sortAttr}
      >
        <div className="folder-grid" aria-hidden="true">
          {folderItems.slice(0, 4).map((item) => (
            <img
              key={item.id}
              src={safeImgSrc(item.icon)}
              className="folder-mini-icon"
              alt=""
              width={24}
              height={24}
              loading="lazy"
            />
          ))}
        </div>
        <span className="card-title">{link.title}</span>
      </button>
    );
  }

  if (locked) {
    return (
      <div
        className={`card card-static card-locked${wiggleClass}`}
        style={cardStyle}
        title={lockTip}
        role="group"
        aria-label={`${link.title} — ${lockTip}`}
        data-link-title={link.title}
        data-locked="1"
        data-badge=""
        data-resolved-href=""
        {...sortAttr}
      >
        <EnvBadge locked badge={link.envBadge} />
        <img
          src={safeImgSrc(link.icon)}
          alt=""
          className="card-icon card-icon-dim"
          width={64}
          height={64}
          loading="lazy"
        />
        <span className="card-title">{link.title}</span>
        <span className="card-lock-hint">{lockTip}</span>
      </div>
    );
  }

  if (reorderMode) {
    return (
      <div
        className={`card card-static${wiggleClass}`}
        style={cardStyle}
        data-link-title={link.title}
        data-locked="0"
        data-badge={link.envBadge || ''}
        data-resolved-href={link.resolvedHref || ''}
        role="group"
        aria-label={`${link.title} — trascina per riordinare`}
        {...sortAttr}
      >
        <EnvBadge badge={link.envBadge} locked={false} />
        <img
          src={safeImgSrc(link.icon)}
          alt=""
          className="card-icon"
          width={64}
          height={64}
          loading="lazy"
        />
        <span className="card-title">{link.title}</span>
      </div>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="card card-static card-link"
      style={cardStyle}
      data-link-title={link.title}
      data-locked="0"
      data-badge={link.envBadge || ''}
      data-resolved-href={link.resolvedHref || ''}
      {...sortAttr}
    >
      <EnvBadge badge={link.envBadge} locked={false} />
      <img
        src={safeImgSrc(link.icon)}
        alt=""
        className="card-icon"
        width={64}
        height={64}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.src = '/default-icon.svg';
        }}
      />
      <span className="card-title">{link.title}</span>
    </a>
  );
}

function ReorderToggleButton({
  reorderMode,
  onToggle,
  disabled,
  variant = 'fab',
}) {
  const label = reorderMode ? 'Fatto' : 'Riorganizza';
  if (variant === 'inline') {
    return (
      <button
        type="button"
        className={`dashboard-reorder-toggle${reorderMode ? ' dashboard-reorder-toggle-active' : ''}`}
        onClick={onToggle}
        aria-pressed={reorderMode}
        aria-label={label}
        title={label}
        data-reorder-toggle
        disabled={disabled}
      >
        {reorderMode ? (
          <Check size={18} aria-hidden="true" />
        ) : (
          <Rows3 size={18} aria-hidden="true" />
        )}
        <span className="sr-only">{label}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`dashboard-reorder-fab${reorderMode ? ' dashboard-reorder-fab-active' : ''}`}
      onClick={onToggle}
      aria-pressed={reorderMode}
      aria-label={label}
      title={label}
      data-reorder-toggle
      disabled={disabled}
    >
      {reorderMode ? (
        <Check size={28} aria-hidden="true" />
      ) : (
        <Rows3 size={28} aria-hidden="true" />
      )}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function FolderModal({
  folder,
  links,
  setLinks,
  linksSnapshotRef,
  reorderMode,
  onClose,
  onExitReorder,
  onToggleReorder,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const previousFocus = useRef(null);

  const modalLinks = useMemo(
    () =>
      links
        .filter((l) => l.folder_id === folder.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    [links, folder.id]
  );

  const renderCard = useCallback(
    (link) => (
      <LinkCard
        link={link}
        links={links}
        onOpenFolder={() => {}}
        reorderMode={reorderMode}
      />
    ),
    [links, reorderMode]
  );

  const trapFocus = useCallback((e) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll(
      'a[href], button:not([disabled])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (reorderMode) {
          onExitReorder();
        } else {
          onClose();
        }
        return;
      }
      trapFocus(e);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (previousFocus.current instanceof HTMLElement) {
        previousFocus.current.focus();
      }
    };
  }, [onClose, trapFocus, reorderMode, onExitReorder]);

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="folder-modal-title" className="modal-title">
            {folder.title}
          </h2>
          <div className="modal-header-actions">
            <ReorderToggleButton
              variant="inline"
              reorderMode={reorderMode}
              onToggle={onToggleReorder}
            />
            <button
              ref={closeRef}
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Chiudi finestra gruppo"
            >
              <X size={24} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          className={`grid modal-grid${reorderMode ? ' grid-reorder-mode' : ''}`}
          data-folder-id={folder.id}
        >
          {modalLinks.length > 0 ? (
            <DashboardSortableGrid
              items={modalLinks}
              containerId={folder.id}
              setLinks={setLinks}
              linksSnapshotRef={linksSnapshotRef}
              renderCard={renderCard}
              reorderMode={reorderMode}
            />
          ) : (
            <p className="empty-state">Questo gruppo è vuoto.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardClient({
  initialLinks = [],
  loadError = false,
  detectedLabel = '',
  envOverride = 'auto',
}) {
  const [links, setLinks] = useState(initialLinks);
  const linksSnapshotRef = useRef(links);
  const [activeFolder, setActiveFolder] = useState(null);
  const [envPending, setEnvPending] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);

  useEffect(() => {
    linksSnapshotRef.current = links;
  }, [links]);

  useEffect(() => {
    if (!reorderMode) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setReorderMode(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [reorderMode]);

  const rootLinks = useMemo(
    () =>
      links
        .filter((l) => !l.folder_id)
        .sort((a, b) => a.sort_order - b.sort_order),
    [links]
  );

  const renderCard = useCallback(
    (link) => (
      <LinkCard
        link={link}
        links={links}
        onOpenFolder={setActiveFolder}
        reorderMode={reorderMode}
      />
    ),
    [links, reorderMode]
  );

  const toggleReorder = useCallback(() => {
    setReorderMode((v) => !v);
  }, []);

  return (
    <div
      className={`container page-dashboard${reorderMode ? ' page-dashboard-reorder' : ''}`}
      data-reorder-mode={reorderMode ? '1' : '0'}
    >
      <header className="header header-once">
        <h1 className="title">Homelab Hub</h1>
        <p className="subtitle">I tuoi servizi di rete, in un unico posto</p>
        <div className="dashboard-toolbar">
          <EnvironmentSelector
            detectedLabel={detectedLabel}
            activeOverride={envOverride}
            onPendingChange={setEnvPending}
          />
        </div>
      </header>

      {loadError ? (
        <div className="dashboard-error" role="alert">
          <p>Impossibile caricare i collegamenti. Riprova tra poco.</p>
          <Link href="/" className="btn-primary">
            Riprova
          </Link>
        </div>
      ) : (
        <main>
          <div
            className={`grid${envPending ? ' grid-env-pending' : ''}${reorderMode ? ' grid-reorder-mode' : ''}`}
            aria-busy={envPending}
            data-dashboard-root
          >
            {rootLinks.length > 0 ? (
              <DashboardSortableGrid
                items={rootLinks}
                containerId={null}
                setLinks={setLinks}
                linksSnapshotRef={linksSnapshotRef}
                renderCard={renderCard}
                reorderMode={reorderMode}
              />
            ) : (
              <div className="empty-dashboard">
                <p>Nessun collegamento nella dashboard.</p>
                <Link href="/admin" className="btn-primary">
                  Configura dashboard
                </Link>
              </div>
            )}
          </div>
        </main>
      )}

      <div className="dashboard-fab-cluster">
        <Link
          href="/admin"
          className="admin-fab"
          aria-label="Vai all'amministrazione"
          title="Amministrazione"
        >
          <Settings size={28} aria-hidden="true" />
        </Link>
        <ReorderToggleButton
          reorderMode={reorderMode}
          onToggle={toggleReorder}
          disabled={loadError || rootLinks.length === 0}
        />
      </div>

      {activeFolder ? (
        <FolderModal
          folder={activeFolder}
          links={links}
          setLinks={setLinks}
          linksSnapshotRef={linksSnapshotRef}
          reorderMode={reorderMode}
          onToggleReorder={toggleReorder}
          onExitReorder={() => setReorderMode(false)}
          onClose={() => setActiveFolder(null)}
        />
      ) : null}
    </div>
  );
}