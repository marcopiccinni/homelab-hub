import { Suspense } from 'react';
import { cookies, headers } from 'next/headers';
import DashboardClient from '../components/DashboardClient';
import { getVisibleLinks } from '../lib/links-data';
import {
  COOKIE_NAME,
  detectAccessEnvironment,
  enrichLinksForViewer,
  environmentLabel,
} from '../lib/access-environment';

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

  const h = await headers();
  const host =
    h.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    h.get('host') ||
    '';

  const cookieStore = await cookies();
  const override = cookieStore.get(COOKIE_NAME)?.value ?? 'auto';

  const viewerEnv = detectAccessEnvironment(host, override);
  const detectedLabel = environmentLabel(
    override === 'auto' ? viewerEnv : override
  );

  try {
    const raw = getVisibleLinks();
    links = enrichLinksForViewer(raw, viewerEnv);
  } catch (err) {
    console.error('Dashboard SSR error:', err);
    loadError = true;
  }

  return (
    <DashboardClient
      initialLinks={links}
      loadError={loadError}
      viewerEnv={viewerEnv}
      detectedLabel={detectedLabel}
      envOverride={override}
    />
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardFromDb />
    </Suspense>
  );
}