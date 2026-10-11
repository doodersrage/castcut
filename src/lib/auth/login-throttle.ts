/**
 * Failed-login throttle (security audit, 2026-10-11). Login had only the general API limit — 120
 * a minute per client and route — so a password could be guessed ~170k times a day, and behind a
 * reverse proxy every visitor shared one limit. Failures are counted per username (whatever
 * address they come from) and per client; past the limit that username or client waits.
 */
const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;
export const LOGIN_MAX_FAILURES_PER_USER = 5;
export const LOGIN_MAX_FAILURES_PER_CLIENT = 20;

type Bucket = { failures: number[]; lockedUntil: number };
const buckets = new Map<string, Bucket>();

function bucket(key: string, now: number): Bucket {
  let entry = buckets.get(key);
  if (!entry) {
    entry = { failures: [], lockedUntil: 0 };
    buckets.set(key, entry);
  }
  entry.failures = entry.failures.filter(at => now - at < WINDOW_MS);
  return entry;
}

const userKey = (username: string) => `user:${username.trim().toLowerCase()}`;
const clientKey = (client: string) => `client:${client}`;

/** Seconds to wait before this username / client may try again (0 = go ahead). */
export function loginRetryAfterSec(
  input: { username: string; client: string },
  now = Date.now()
): number {
  const waits = [userKey(input.username), clientKey(input.client)].map(key => {
    const entry = bucket(key, now);
    return entry.lockedUntil > now ? Math.ceil((entry.lockedUntil - now) / 1000) : 0;
  });
  return Math.max(...waits);
}

export function recordLoginFailure(
  input: { username: string; client: string },
  now = Date.now()
): void {
  for (const [key, max] of [
    [userKey(input.username), LOGIN_MAX_FAILURES_PER_USER],
    [clientKey(input.client), LOGIN_MAX_FAILURES_PER_CLIENT],
  ] as const) {
    const entry = bucket(key, now);
    entry.failures.push(now);
    if (entry.failures.length >= max) {
      entry.lockedUntil = now + LOCK_MS;
      entry.failures = [];
    }
  }
  if (buckets.size > 10_000) {
    for (const [key, entry] of buckets) {
      if (entry.lockedUntil < now && !entry.failures.length) buckets.delete(key);
    }
  }
}

export function recordLoginSuccess(username: string): void {
  buckets.delete(userKey(username));
}

/** Tests only. */
export function resetLoginThrottle(): void {
  buckets.clear();
}
