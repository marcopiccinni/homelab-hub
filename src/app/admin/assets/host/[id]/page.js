import Link from 'next/link';
import { listSubnets } from '../../../../../lib/assets/repository';
import HostViewClient from '../../../../../components/HostViewClient';

export const dynamic = 'force-dynamic';

export default async function HostAssetPage({ params }) {
  const { id: idRaw } = await params;
  const assetId = parseInt(idRaw, 10);
  const subnets = listSubnets();

  return (
    <div className="container admin-assets">
      <header className="header header-once">
        <h1 className="title">Vista host</h1>
        <p className="subtitle">Porte e servizi unificati per IP e FQDN</p>
        <nav className="admin-nav-links" aria-label="Navigazione">
          <Link href="/admin/assets">← Asset</Link>
          <span className="nav-sep">|</span>
          <Link href="/">Dashboard</Link>
        </nav>
      </header>
      {Number.isNaN(assetId) ? (
        <p role="alert">ID asset non valido</p>
      ) : (
        <HostViewClient assetId={assetId} initialSubnets={subnets} />
      )}
    </div>
  );
}