'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

export const FINE_POINTER_MQ = '(hover: hover) and (pointer: fine)';
const FORCE_COOKIE = 'homelab_dnd_force';

function readEnabled() {
  if (typeof window === 'undefined') return false;
  if (document.cookie.includes(`${FORCE_COOKIE}=1`)) return true;
  try {
    return window.matchMedia(FINE_POINTER_MQ).matches;
  } catch {
    return false;
  }
}

export function useFinePointerDnD() {
  const [enabled, setEnabled] = useState(false);

  useLayoutEffect(() => {
    // Allinea stato client dopo hydr. (cookie test / matchMedia desktop).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- media query al mount
    setEnabled(readEnabled());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(FINE_POINTER_MQ);
    const sync = () => setEnabled(readEnabled());
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return enabled;
}