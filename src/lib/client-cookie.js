import { COOKIE_NAME } from './access-environment.js';

export function setHomelabEnvOverrideCookie(value) {
  if (typeof document === 'undefined') return;
  if (value === 'auto') {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  } else {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
  }
}