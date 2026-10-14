import { readKv, writeKv } from '@/lib/sqlite/kv';

const SCOPE = 'castcut-server';
const KEY = 'public-origin';
const FALLBACK = 'http://127.0.0.1:47832';

/**
 * The address links in emails (invites, password resets, batch notices) point at: PROMPT_API_URL
 * when set, else the address the admin last signed in at, else localhost. Remembered at an
 * admin's sign-in only — an address anyone could send (a forgot-password request's Origin) would
 * let a stranger point reset links at their own site (2026-10-14).
 */
export function publicAppOrigin(): string {
  const configured = process.env.PROMPT_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  try {
    const stored = readKv<{ origin?: string }>(SCOPE, KEY)?.origin;
    if (stored) return stored;
  } catch {
    // No database yet.
  }
  return FALLBACK;
}

/** Called after an admin signs in: keeps the page's Origin as the public address. */
export function rememberPublicAppOrigin(request: Request, role: string): void {
  if (role !== 'admin' || process.env.PROMPT_API_URL?.trim()) return;
  const raw = request.headers.get('origin');
  if (!raw) return;
  let origin: string;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    origin = url.origin;
  } catch {
    return;
  }
  try {
    if (readKv<{ origin?: string }>(SCOPE, KEY)?.origin !== origin) {
      writeKv(SCOPE, KEY, { origin });
    }
  } catch {
    // Best effort.
  }
}
