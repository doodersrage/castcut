import { isIpLiteral } from '@/lib/same-origin-host';
import { readKv, writeKv } from '@/lib/sqlite/kv';

const SCOPE = 'castcut-server';
const KEY = 'public-origin';
const FALLBACK = 'http://127.0.0.1:47832';

/**
 * The address links in emails (invites, password resets, batch notices) point at: PROMPT_API_URL
 * when set, else the public address the admin last used, else the first PROMPT_TRUSTED_HOSTS name
 * (https), else localhost. Remembered at an
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
  return trustedHostOrigin() ?? FALLBACK;
}

/** https://<first public PROMPT_TRUSTED_HOSTS name>, or null. */
export function trustedHostOrigin(hosts = process.env.PROMPT_TRUSTED_HOSTS): string | null {
  const host = (hosts ?? '')
    .split(/[\s,]+/)
    .map(entry =>
      entry
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
    )
    .find(entry => entry && !isLocalHost(entry.replace(/:\d+$/, '')));
  return host ? `https://${host}` : null;
}

function isLocalHost(hostname: string): boolean {
  const name = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return name === 'localhost' || name.endsWith('.local') || isIpLiteral(name);
}

/** The page's own origin: Origin, else Referer, else the proxy's forwarded host. */
function requestPageOrigin(request: Request): string | null {
  const candidates = [
    request.headers.get('origin'),
    request.headers.get('referer'),
    (() => {
      const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
      const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
      return host ? `${proto}://${host}` : null;
    })(),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    } catch {
      // Next candidate.
    }
  }
  return null;
}

/**
 * Called on an admin's sign-in and on their signed-in session checks (a session that never signs
 * in again — the usual case — never recorded an address, and emails linked to localhost): keeps
 * the page's address. A localhost / LAN-IP visit never replaces a public name already kept.
 */
export function rememberPublicAppOrigin(request: Request, role: string): void {
  if (role !== 'admin' || process.env.PROMPT_API_URL?.trim()) return;
  const origin = requestPageOrigin(request);
  if (!origin) return;
  try {
    const kept = readKv<{ origin?: string }>(SCOPE, KEY)?.origin;
    if (kept === origin) return;
    const local = isLocalHost(new URL(origin).hostname);
    if (local && kept && !isLocalHost(new URL(kept).hostname)) return;
    writeKv(SCOPE, KEY, { origin });
  } catch {
    // Best effort.
  }
}
