import { Suspense } from 'react';
import DashboardClient from '../components/DashboardClient';
import { getVisibleLinks } from '../lib/links-data';

export const dynamic = 'force-dynamic';

function DashboardSkeleton() {
  return (
    <div className="container page-dashboard" aria-busy="true" aria-label="Caricamento dashboard">
      <header className="header header-once">
        <h1 className="title">Homelab Hub</h1>
        <p className="subtitle">I tuoi servizi di rete, in un unico posto</p>
      </header>
      <div className="grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card skeleton-card" aria-hidden="true" />
        ))}
      </div>
    </div>
  );
}

async function DashboardFromDb() {
  let links = [];
  let loadError = false;
  try {
    links = getVisibleLinks();
  } catch (err) {
    console.error('Dashboard SSR error:', err);
    loadError = true;
  }
  return <DashboardClient initialLinks={links} loadError={loadError} />;
}

export default function HomePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardFromDb />
    </Suspense>
  );
}