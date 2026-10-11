type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

// buckets never shrinks on its own — every distinct route:client-key pair that's
// ever seen a request stays in memory even after its window expires. That's fine
// at small scale, but on a long-running process with many distinct clients/routes
// (in particular the high-volume media routes, which key by IP + full path) it's
// unbounded growth. Sweep expired entries periodically rather than on every call,
// so normal request handling stays O(1) amortized.
const SWEEP_INTERVAL_CALLS = 500;
let callsSinceSweep = 0;

function sweepExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number; retryAfterSec: number };

function getLimits(): { windowMs: number; max: number } {
  const max = Number(process.env.API_RATE_LIMIT_MAX ?? '120');
  const windowSec = Number(process.env.API_RATE_LIMIT_WINDOW_SEC ?? '60');
  return {
    max: Number.isFinite(max) && max > 0 ? Math.floor(max) : 120,
    windowMs: Number.isFinite(windowSec) && windowSec > 0 ? windowSec * 1000 : 60_000,
  };
}

export function checkRateLimit(key: string, route = 'api', maxOverride?: number): RateLimitResult {
  const { max: envMax, windowMs } = getLimits();
  const max = maxOverride && maxOverride > 0 ? Math.floor(maxOverride) : envMax;
  const bucketKey = `${route}:${key}`;
  const now = Date.now();

  callsSinceSweep += 1;
  if (callsSinceSweep >= SWEEP_INTERVAL_CALLS) {
    callsSinceSweep = 0;
    sweepExpiredBuckets(now);
  }

  const existing = buckets.get(bucketKey);

  if (!existing || now >= existing.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(bucketKey, { count: 1, resetAt });
    return { allowed: true, remaining: max - 1, resetAt };
  }

  if (existing.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  buckets.set(bucketKey, existing);
  return { allowed: true, remaining: max - existing.count, resetAt: existing.resetAt };
}

// X-Forwarded-For / X-Real-Ip are set by a trusted reverse proxy in front of
// this app — but nothing stops a client connecting directly (or through an
// untrusted hop) from setting them itself. Trusting them unconditionally
// lets any such client mint a fresh rate-limit bucket key on every request
// (a new X-Forwarded-For value = a new bucket), bypassing both the general
// anonymous API limit and the high-volume media limit, which keys off this
// same value even for signed-in users. Only trust these headers once the
// operator confirms they're actually behind a proxy that sets/overwrites
// them; otherwise every direct client collapses into one shared bucket,
// which is stricter than intended but never spoofable.
export function rateLimitClientKey(request: Request): string {
  if (process.env.TRUST_PROXY_HEADERS?.trim().toLowerCase() !== 'true') {
    return 'local';
  }
  // The proxy's own header first; else the LAST X-Forwarded-For entry — the one the proxy
  // appended. The first entry is whatever the visitor sent, so keying on it let anyone dodge the
  // limits (and the login throttle) with a made-up address each request (security audit,
  // 2026-10-11). Behind more than one proxy, have the outer one set X-Real-IP.
  const realIp = request.headers.get('x-real-ip')?.trim();
  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .at(-1);
  return realIp || forwarded || 'local';
}

// Read-only image/video byte-serving routes (ComfyUI `/view`, gallery thumbs,
// other engine "view"/"preview" proxies). Every gallery thumbnail, hover
// preview, and lightbox open fires one of these, so a gallery page with a
// few dozen cards can burn through the general API budget in seconds even
// though each request is cheap and already cache-backed (see
// comfyui-view-cache.ts / Cache-Control headers). These routes get their own,
// much larger budget so normal gallery browsing never trips the limiter that
// exists to protect mutating/expensive API routes.
const HIGH_VOLUME_MEDIA_ROUTE =
  /^\/api\/(?:comfyui|openai|replicate|diffusers|gemini|fal|grok)\/(?:view|view-metadata|preview|model-preview)(?:\/|$)/;
const GALLERY_MEDIA_ROUTE = /^\/api\/gallery\/media\/(?!persist(?:\/|$))[^/]+\/?$/;

export function isHighVolumeMediaRoute(pathname: string): boolean {
  return HIGH_VOLUME_MEDIA_ROUTE.test(pathname) || GALLERY_MEDIA_ROUTE.test(pathname);
}

export function mediaRateLimitMax(): number {
  const raw = Number(process.env.API_RATE_LIMIT_MEDIA_MAX ?? '600');
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 600;
}
