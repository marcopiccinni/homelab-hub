import { NextResponse } from 'next/server';

export function jsonError(status, message, logContext, cause) {
  if (cause) {
    console.error(logContext || 'API error:', cause);
  }
  return NextResponse.json({ error: message }, { status });
}