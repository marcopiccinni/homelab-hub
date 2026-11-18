'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { COOKIE_NAME, VIEWER_ENVIRONMENTS } from '../../lib/access-environment';

const ALLOWED = new Set(['auto', ...VIEWER_ENVIRONMENTS]);

/**
 * Imposta override ambiente e ricalcola la home (cookie + revalidate).
 */
export async function setEnvOverrideAction(value) {
  const v = String(value ?? 'auto').trim();
  if (!ALLOWED.has(v)) {
    return { ok: false, error: 'Valore non valido' };
  }

  const store = await cookies();
  if (v === 'auto') {
    store.delete(COOKIE_NAME);
  } else {
    store.set(COOKIE_NAME, v, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }

  revalidatePath('/', 'layout');
  revalidatePath('/');
  return { ok: true, value: v };
}