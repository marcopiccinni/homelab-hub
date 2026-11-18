'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setEnvOverrideAction } from '../app/actions/env-override';

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
  onPendingChange,
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingValue, setPendingValue] = useState(null);
  const chipValue =
    isPending && pendingValue !== null ? pendingValue : activeOverride;

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  const setOverride = useCallback(
    (value) => {
      if (value === activeOverride && !isPending) return;
      setPendingValue(value);
      startTransition(async () => {
        await setEnvOverrideAction(value);
        router.refresh();
        setPendingValue(null);
      });
    },
    [activeOverride, isPending, router]
  );

  return (
    <div
      className={`env-selector${isPending ? ' env-selector-pending' : ''}`}
      role="group"
      aria-label="Ambiente di accesso"
      aria-busy={isPending}
    >
      <span className="env-selector-label">
        Ambiente: <strong>{detectedLabel}</strong>
        {isPending ? (
          <span className="env-selector-updating" aria-live="polite">
            {' '}
            — aggiornamento…
          </span>
        ) : null}
      </span>
      <div className="env-chip-row">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`env-chip${chipValue === opt.value ? ' env-chip-active' : ''}`}
            onClick={() => setOverride(opt.value)}
            aria-pressed={chipValue === opt.value}
            disabled={isPending}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}