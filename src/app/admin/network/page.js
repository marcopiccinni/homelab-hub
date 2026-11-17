import Link from 'next/link';
import { getNetworkHostsReport } from '../../../lib/links-data';

export const dynamic = 'force-dynamic';

export default function NetworkAnalysisPage() {
  let data = [];
  let loadError = false;
  try {
    data = getNetworkHostsReport();
  } catch (err) {
    console.error('Network analysis error:', err);
    loadError = true;
  }

  return (
    <div className="container admin-network">
      <header className="header header-once">
        <h1 className="title">Analisi di rete</h1>
        <p className="subtitle">Host e porte usati dai collegamenti salvati</p>
        <nav className="admin-nav-links" aria-label="Navigazione amministrazione">
          <Link href="/admin">← Torna amministrazione</Link>
          <span className="nav-sep" aria-hidden="true">
            |
          </span>
          <Link href="/">Vai alla dashboard</Link>
        </nav>
      </header>

      {loadError ? (
        <p className="dashboard-error" role="alert">
          Impossibile leggere i dati dal database.
        </p>
      ) : data.length > 0 ? (
        <ul className="network-list">
          {data.map((item) => (
            <li key={item.host} className="network-card">
              <h2 className="network-host">{item.host}</h2>
              <p className="network-ports">
                Porte:{' '}
                {item.ports.map((port, idx) => (
                  <span key={port}>
                    {idx > 0 ? ', ' : ''}
                    {port}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">
          Nessun host rilevato. Aggiungi dei collegamenti per iniziare
          l&apos;analisi.
        </p>
      )}
    </div>
  );
}