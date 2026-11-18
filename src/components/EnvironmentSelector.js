'use client';

import { useRouter } from 'next/navigation';
import { setHomelabEnvOverrideCookie } from '../lib/client-cookie';

const OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'external', label: 'Esterno' },
  { value: 'local_fqdn', label: 'Locale' },
  { value: 'ip', label: 'IP' },
  { value: 'vpn', label: 'VPN' },
];

export default function EnvironmentSelector({
  detectedLabel,
  activeOverride = 'auto',
}) {
  const router = useRouter();

  const setOverride = (value) => {
    setHomelabEnvOverrideCookie(value);
    router.refresh();
  };

  return (
    <div className="env-selector" role="group" aria-label="Ambiente di accesso">
      <span className="env-selector-label">
        Ambiente: <strong>{detectedLabel}</strong>
      </span>
      <div className="env-chip-row">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`env-chip${activeOverride === opt.value ? ' env-chip-active' : ''}`}
            onClick={() => setOverride(opt.value)}
            aria-pressed={activeOverride === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}