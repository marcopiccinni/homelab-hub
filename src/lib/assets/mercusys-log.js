/** Log server Mercusys — mai loggare password o payload sensibili. */
export function mercusysLog(level, message, detail) {
  const line = detail != null && detail !== '' ? `${message} — ${detail}` : message;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`mercusys: ${line}`);
}