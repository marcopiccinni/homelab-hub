'use client';

import {
  LayoutDashboard,
  Package,
  Server,
  Grid3x3,
  Globe,
  Inbox,
  Radar,
  Router,
  FileUp,
  Menu,
  X,
} from 'lucide-react';

const ICONS = {
  summary: LayoutDashboard,
  assets: Package,
  hosts: Server,
  subnet: Grid3x3,
  fqdn: Globe,
  discovery: Inbox,
  scan: Radar,
  mercusys: Router,
  import: FileUp,
};

export const ASSETS_NAV_GROUPS = [
  { label: 'Panoramica', tabs: [{ id: 'summary', label: 'Riepilogo' }] },
  {
    label: 'Inventario',
    tabs: [
      { id: 'assets', label: 'Asset' },
      { id: 'hosts', label: 'Host' },
      { id: 'subnet', label: 'Subnet' },
      { id: 'fqdn', label: 'FQDN' },
    ],
  },
  {
    label: 'Scoperta',
    tabs: [
      { id: 'discovery', label: 'Coda' },
      { id: 'scan', label: 'Scansioni' },
      { id: 'mercusys', label: 'Router Mercusys' },
    ],
  },
  { label: 'Dati', tabs: [{ id: 'import', label: 'Import / Export' }] },
];

function NavItem({ id, label, active, badge, onSelect }) {
  const Icon = ICONS[id] || Package;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={active ? 'assets-nav-item assets-nav-item-active assets-tab' : 'assets-nav-item assets-tab'}
      onClick={() => onSelect(id)}
    >
      <Icon className="assets-nav-icon" aria-hidden size={18} strokeWidth={2} />
      <span className="assets-nav-label">{label}</span>
      {badge != null && badge > 0 ? (
        <span className="assets-nav-badge" aria-label={`${badge} elementi`}>
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  );
}

function NavGroups({ tab, badges, onSelect }) {
  return ASSETS_NAV_GROUPS.map((group) => (
    <div key={group.label} className="assets-sidebar-group">
      <span className="assets-sidebar-group-label">{group.label}</span>
      <div className="assets-sidebar-items" role="tablist">
        {group.tabs.map((t) => (
          <NavItem
            key={t.id}
            id={t.id}
            label={t.label}
            active={tab === t.id}
            badge={badges?.[t.id]}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  ));
}

export function AssetsNavSidebar({ tab, badges, onSelect, className = '' }) {
  return (
    <nav className={`assets-sidebar ${className}`.trim()} aria-label="Sezioni asset di rete">
      <NavGroups tab={tab} badges={badges} onSelect={onSelect} />
    </nav>
  );
}

export function AssetsNavMobileBar({ tab, badges, onOpenMenu, currentLabel }) {
  return (
    <div className="assets-mobile-bar">
      <button type="button" className="assets-mobile-menu-btn" onClick={onOpenMenu} aria-label="Menu sezioni">
        <Menu size={22} />
      </button>
      <span className="assets-mobile-current">{currentLabel}</span>
      {badges?.discovery > 0 ? (
        <span className="assets-nav-badge" aria-hidden>
          {badges.discovery > 99 ? '99+' : badges.discovery}
        </span>
      ) : null}
    </div>
  );
}

export function AssetsNavDrawer({ open, tab, badges, onSelect, onClose }) {
  if (!open) return null;
  return (
    <div className="assets-nav-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="assets-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu asset di rete"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="assets-nav-drawer-header">
          <strong>Asset di rete</strong>
          <button type="button" className="assets-mobile-menu-btn" onClick={onClose} aria-label="Chiudi menu">
            <X size={22} />
          </button>
        </div>
        <AssetsNavSidebar
          tab={tab}
          badges={badges}
          onSelect={(id) => {
            onSelect(id);
            onClose();
          }}
        />
      </aside>
    </div>
  );
}

export function findNavLabel(tabId) {
  for (const g of ASSETS_NAV_GROUPS) {
    const hit = g.tabs.find((t) => t.id === tabId);
    if (hit) return hit.label;
  }
  return 'Riepilogo';
}