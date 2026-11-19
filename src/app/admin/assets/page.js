import Link from 'next/link';
import { listSubnets } from '../../../lib/assets/repository';
import AssetsAdminClient from '../../../components/AssetsAdminClient';

export const dynamic = 'force-dynamic';

export default function AssetsAdminPage() {
  let subnets = [];
  let loadError = false;
  try {
    subnets = listSubnets();
  } catch (err) {
    console.error(err);
    loadError = true;
  }

  return (
    <div className="container admin-assets">
      <header className="header header-once">
        <h1 className="title">Asset di rete</h1>
        <p className="subtitle">Inventario, subnet, FQDN, porte e scan (nmap)</p>
        <nav className="admin-nav-links" aria-label="Navigazione amministrazione">
          <Link href="/admin">← Collegamenti</Link>
          <span className="nav-sep" aria-hidden="true">
            |
          </span>
          <Link href="/">Dashboard</Link>
        </nav>
      </header>

      {loadError ? (
        <p className="dashboard-error" role="alert">
          Migrazione asset non applicata o DB non disponibile.
        </p>
      ) : (
        <AssetsAdminClient initialSubnets={subnets} />
      )}
    </div>
  );
}