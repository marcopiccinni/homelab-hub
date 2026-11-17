'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Settings, X } from 'lucide-react';
import { safeHref, safeImgSrc, safeColor } from '../lib/validation';

function LinkCard({ link, links, onOpenFolder }) {
  const isFolder = link.is_folder === 1;
  const tint = safeColor(link.color);
  const cardStyle = tint ? { backgroundColor: `${tint}20` } : undefined;

  const folderItems = isFolder
    ? links
        .filter((l) => l.folder_id === link.id)
        .sort((a, b) => a.sort_order - b.sort_order)
    : [];

  if (isFolder) {
    return (
      <button
        type="button"
        className="card card-static"
        style={cardStyle}
        onClick={() => onOpenFolder(link)}
        aria-label={`Apri gruppo ${link.title}`}
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

  return (
    <a
      href={safeHref(link.url)}
      target="_blank"
      rel="noopener noreferrer"
      className="card card-static card-link"
      style={cardStyle}
    >
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

function FolderModal({ folder, links, onClose }) {
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
      if (e.key === 'Escape') onClose();
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
  }, [onClose, trapFocus]);

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
        <div className="grid modal-grid">
          {modalLinks.length > 0 ? (
            modalLinks.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                links={links}
                onOpenFolder={() => {}}
              />
            ))
          ) : (
            <p className="empty-state">Questo gruppo è vuoto.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardClient({ initialLinks = [], loadError = false }) {
  const [links] = useState(initialLinks);
  const [activeFolder, setActiveFolder] = useState(null);

  const rootLinks = useMemo(
    () =>
      links
        .filter((l) => !l.folder_id)
        .sort((a, b) => a.sort_order - b.sort_order),
    [links]
  );

  return (
    <div className="container page-dashboard">
      <header className="header header-once">
        <h1 className="title">Homelab Hub</h1>
        <p className="subtitle">I tuoi servizi di rete, in un unico posto</p>
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
          <div className="grid">
            {rootLinks.length > 0 ? (
              rootLinks.map((link) => (
                <LinkCard
                  key={link.id}
                  link={link}
                  links={links}
                  onOpenFolder={setActiveFolder}
                />
              ))
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

      <Link
        href="/admin"
        className="admin-fab"
        aria-label="Vai all'amministrazione"
      >
        <Settings size={28} aria-hidden="true" />
      </Link>

      {activeFolder ? (
        <FolderModal
          folder={activeFolder}
          links={links}
          onClose={() => setActiveFolder(null)}
        />
      ) : null}
    </div>
  );
}