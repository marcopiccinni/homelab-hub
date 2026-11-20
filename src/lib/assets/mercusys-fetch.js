import { Agent } from 'undici';
import { mercusysLog } from './mercusys-log.js';

export const DEFAULT_MERCUSYS_TIMEOUT_MS = 30000;

export function getMercusysTimeoutMs() {
  const raw = process.env.MERCUSYS_TIMEOUT_MS;
  if (raw != null && String(raw).trim() !== '') {
    const n = parseInt(String(raw).trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_MERCUSYS_TIMEOUT_MS;
}

let dispatcher;

/** Connessione fresh: niente keep-alive (router risponde Connection: close). */
export function getMercusysDispatcher() {
  if (!dispatcher) {
    dispatcher = new Agent({
      keepAliveTimeout: 1,
      keepAliveMaxTimeout: 1,
      pipelining: 0,
      connections: 1,
    });
  }
  return dispatcher;
}

export function isMercusysTimeoutError(err) {
  if (!err) return false;
  if (err.code === 'MERCUSYS_TIMEOUT') return true;
  const name = err.name || '';
  const msg = String(err.message || '');
  return (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    msg.includes('aborted due to timeout') ||
    msg.includes('The operation was aborted')
  );
}

export function mercusysTimeoutError(stepId, ms) {
  const limit = getMercusysTimeoutMs();
  const err = new Error(`Timeout su ${stepId} dopo ${ms}ms (limite ${limit}ms)`);
  err.code = 'MERCUSYS_TIMEOUT';
  err.step = `${stepId}_timeout`;
  return err;
}

/**
 * fetch verso il router con dispatcher dedicato, Connection: close e log durata.
 */
export async function mercusysFetch(url, options, stepId) {
  const t0 = Date.now();
  const headers = {
    ...(options.headers || {}),
    Connection: 'close',
  };
  try {
    const res = await fetch(url, {
      ...options,
      headers,
      dispatcher: getMercusysDispatcher(),
      signal: options.signal ?? AbortSignal.timeout(getMercusysTimeoutMs()),
    });
    const ms = Date.now() - t0;
    mercusysLog('info', stepId, `${ms}ms`);
    return res;
  } catch (err) {
    const ms = Date.now() - t0;
    if (isMercusysTimeoutError(err)) {
      mercusysLog('error', `${stepId}_timeout`, `${ms}ms`);
      throw mercusysTimeoutError(stepId, ms);
    }
    mercusysLog('error', stepId, `${ms}ms — ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}