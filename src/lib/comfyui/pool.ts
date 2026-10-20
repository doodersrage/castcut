import { parseComfyUiSystemStats } from './system-stats';
import { normalizeSafeHttpUrl, getComfyUiAllowedHosts } from '../url-safety';

let poolIndex = 0;

/**
 * Structurally compatible with `ComfyUiPoolEndpointHealth` from service-health.ts
 * (and `ComfyUiHealth`) — callers can pass those results straight through without
 * an import (keeps this module free of a circular dependency on service-health).
 */
export type ComfyUiPoolEndpointStat = {
  url: string;
  ok?: boolean;
  vram?: { free?: number; total?: number };
  queuePending?: number;
  queueRunning?: number;
};

/** Each queued/running job penalizes score by this many "free GB equivalent" units. */
const QUEUE_LOAD_PENALTY_GB = 2;

/** Default queue depth (pending + running) above which an endpoint is "too busy". */
const DEFAULT_POOL_BUSY_THRESHOLD = 4;

export type ComfyUiPoolRoutingMeta = {
  /** Preferred host skipped because queue load exceeded the busy threshold. */
  skippedPreferredDueToLoad?: boolean;
  preferredHost?: string;
  /** How the routed URL was chosen. */
  strategy?:
    | 'preferred'
    | 'load_balance'
    | 'vram_aware'
    | 'round_robin'
    | 'user'
    | 'client'
    | 'env'
    | 'failover';
};

export function getDefaultPoolBusyThreshold(): number {
  const raw = process.env.COMFYUI_POOL_BUSY_THRESHOLD?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return DEFAULT_POOL_BUSY_THRESHOLD;
}

/** Queue load metric used for busy detection and least-loaded fallback. */
export function endpointQueueLoad(stat: ComfyUiPoolEndpointStat): number {
  return (stat.queuePending ?? 0) + (stat.queueRunning ?? 0);
}

export function isComfyUiEndpointTooBusy(
  stat: ComfyUiPoolEndpointStat,
  threshold = getDefaultPoolBusyThreshold()
): boolean {
  if (stat.ok === false) {
    return true;
  }
  return endpointQueueLoad(stat) >= threshold;
}

function normalizeUrlForCompare(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * Score a pool endpoint by free VRAM (higher is better) minus a queue-load
 * penalty. Returns null when the endpoint is unhealthy or has no usable VRAM
 * reading, so callers can skip it and fall back to round-robin.
 */
export function scoreComfyUiPoolEndpointStat(stat: ComfyUiPoolEndpointStat): number | null {
  if (stat.ok === false) {
    return null;
  }
  const free = stat.vram?.free;
  if (typeof free !== 'number' || !Number.isFinite(free)) {
    return null;
  }
  const freeGb = free / 1e9;
  const queueLoad = (stat.queuePending ?? 0) + (stat.queueRunning ?? 0) * 2;
  return freeGb - queueLoad * QUEUE_LOAD_PENALTY_GB;
}

/**
 * Picks the pool URL with the highest free-VRAM / lowest-queue score among
 * `poolUrls`. Returns null when no stat matches a pool URL or none score.
 */
export function pickHighestScoringComfyUiEndpoint(
  poolUrls: string[],
  stats: ComfyUiPoolEndpointStat[]
): string | null {
  const byUrl = new Map(stats.map(stat => [normalizeUrlForCompare(stat.url), stat] as const));

  let best: { url: string; score: number } | null = null;
  for (const url of poolUrls) {
    const stat = byUrl.get(normalizeUrlForCompare(url));
    if (!stat) {
      continue;
    }
    const score = scoreComfyUiPoolEndpointStat(stat);
    if (score == null) {
      continue;
    }
    if (!best || score > best.score) {
      best = { url, score };
    }
  }
  return best?.url ?? null;
}

/**
 * Picks the healthiest endpoint that is not over the busy threshold. When every
 * endpoint is busy, falls back to the one with the lowest queue load.
 */
export function pickLoadBalancedComfyUiEndpoint(
  poolUrls: string[],
  stats: ComfyUiPoolEndpointStat[],
  options?: { busyThreshold?: number }
): string | null {
  const threshold = options?.busyThreshold ?? getDefaultPoolBusyThreshold();
  const byUrl = new Map(stats.map(stat => [normalizeUrlForCompare(stat.url), stat] as const));

  let bestIdle: { url: string; score: number } | null = null;
  let leastBusy: { url: string; load: number } | null = null;

  for (const url of poolUrls) {
    const stat = byUrl.get(normalizeUrlForCompare(url));
    if (!stat || stat.ok === false) {
      continue;
    }
    const load = endpointQueueLoad(stat);
    if (!leastBusy || load < leastBusy.load) {
      leastBusy = { url, load };
    }
    if (isComfyUiEndpointTooBusy(stat, threshold)) {
      continue;
    }
    const score = scoreComfyUiPoolEndpointStat(stat);
    if (score == null) {
      continue;
    }
    if (!bestIdle || score > bestIdle.score) {
      bestIdle = { url, score };
    }
  }

  return bestIdle?.url ?? leastBusy?.url ?? null;
}

async function fetchComfyUiPoolEndpointStat(url: string): Promise<ComfyUiPoolEndpointStat> {
  try {
    const [queueResponse, statsResponse] = await Promise.all([
      fetch(`${url}/queue`, {
        signal: AbortSignal.timeout(3000),
        redirect: 'manual',
      }),
      fetch(`${url}/system_stats`, {
        signal: AbortSignal.timeout(3000),
        redirect: 'manual',
      }),
    ]);

    let ok = statsResponse.ok;
    let queuePending: number | undefined;
    let queueRunning: number | undefined;
    let vram: ComfyUiPoolEndpointStat['vram'];

    if (queueResponse.ok) {
      const queue = (await queueResponse.json()) as {
        queue_pending?: unknown[];
        queue_running?: unknown[];
      };
      queuePending = queue.queue_pending?.length ?? 0;
      queueRunning = queue.queue_running?.length ?? 0;
    }

    if (statsResponse.ok) {
      const stats = parseComfyUiSystemStats(await statsResponse.json().catch(() => null));
      vram = stats.vram;
    } else {
      ok = false;
    }

    return { url, ok, vram, queuePending, queueRunning };
  } catch {
    return { url, ok: false };
  }
}

/** Fetches fresh queue + VRAM stats for every pool URL and updates the cache. */
export async function refreshComfyUiPoolStats(pool?: string[]): Promise<ComfyUiPoolEndpointStat[]> {
  const urls = pool ?? parseComfyUiPool();
  if (urls.length === 0) {
    return [];
  }
  const stats = await Promise.all(urls.map(fetchComfyUiPoolEndpointStat));
  setComfyUiPoolStatsCache(stats);
  return stats;
}

/**
 * Refreshes pool stats when load balancing is enabled and the cache is stale.
 * Safe to call before every queue — skips work when a recent snapshot exists.
 */
export async function ensureComfyUiPoolStatsForQueue(input?: {
  loadBalance?: boolean;
  maxCacheAgeMs?: number;
  poolUrls?: readonly string[];
}): Promise<ComfyUiPoolEndpointStat[] | null> {
  const pool = parseComfyUiPool(input?.poolUrls);
  if (pool.length === 0 || input?.loadBalance === false) {
    return getComfyUiPoolStatsCache();
  }
  const maxAge = input?.maxCacheAgeMs ?? 5_000;
  const cached = getComfyUiPoolStatsCache(maxAge);
  if (cached) {
    return cached;
  }
  return refreshComfyUiPoolStats(pool);
}

type PoolStatsCacheEntry = { at: number; stats: ComfyUiPoolEndpointStat[] };
let poolStatsCache: PoolStatsCacheEntry | null = null;
/** How long a cached pool health snapshot stays usable for VRAM-aware picks. */
const POOL_STATS_CACHE_TTL_MS = 15_000;
/** Avoid piling up concurrent background refreshes when the cache is stale. */
let poolStatsRefreshInFlight = false;

/** Remembers the most recent pool health snapshot (e.g. from `checkComfyUiPoolHealth`). */
export function setComfyUiPoolStatsCache(stats: ComfyUiPoolEndpointStat[]): void {
  poolStatsCache = { at: Date.now(), stats };
}

/** Mark a pool member unhealthy so the next pick skips it (connection refused / timeout). */
export function markComfyUiPoolEndpointUnhealthy(url: string): void {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return;
  }
  const current = poolStatsCache?.stats ?? [];
  const norm = normalizeUrlForCompare(trimmed);
  let found = false;
  const next = current.map(stat => {
    if (normalizeUrlForCompare(stat.url) === norm) {
      found = true;
      return { ...stat, ok: false };
    }
    return stat;
  });
  if (!found) {
    next.push({ url: trimmed, ok: false });
  }
  setComfyUiPoolStatsCache(next);
}

/** Returns the cached pool stats when still fresh, or null otherwise. */
export function getComfyUiPoolStatsCache(
  maxAgeMs = POOL_STATS_CACHE_TTL_MS
): ComfyUiPoolEndpointStat[] | null {
  if (!poolStatsCache) {
    return null;
  }
  if (Date.now() - poolStatsCache.at > maxAgeMs) {
    return null;
  }
  return poolStatsCache.stats;
}

/** Test-only: reset the module-level pool stats cache between test runs. */
export function resetComfyUiPoolStatsCacheForTests(): void {
  poolStatsCache = null;
  poolStatsRefreshInFlight = false;
}

/**
 * Best-effort, non-blocking refresh of pool health so the next VRAM-aware pick
 * has fresher data. Never awaited by callers — failures are swallowed.
 */
function refreshComfyUiPoolStatsInBackground(pool: string[]): void {
  if (poolStatsRefreshInFlight || pool.length === 0) {
    return;
  }
  poolStatsRefreshInFlight = true;

  void Promise.all(pool.map(fetchComfyUiPoolEndpointStat))
    .then(stats => setComfyUiPoolStatsCache(stats))
    .catch(() => {})
    .finally(() => {
      poolStatsRefreshInFlight = false;
    });
}

function uniquePoolUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const key = normalizeUrlForCompare(url);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(url.replace(/\/+$/, ''));
  }
  return out;
}

/** Validate extra pool members against the host allowlist; skip invalid rows. */
export function normalizeComfyPoolUrlList(raw: unknown): string[] {
  const allowedHosts = getComfyUiAllowedHosts();
  const entries = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\n,]+/) : [];
  const parsed: string[] = [];
  for (const entry of entries) {
    const trimmed = String(entry ?? '').trim();
    if (!trimmed) {
      continue;
    }
    try {
      parsed.push(normalizeSafeHttpUrl(trimmed, { allowPrivate: true, allowedHosts }));
    } catch {
      // Settings extras fail closed per URL instead of aborting the whole pool.
    }
  }
  return uniquePoolUrls(parsed);
}

export function parseEnvComfyUiPool(): string[] {
  const raw = process.env.COMFYUI_POOL?.trim();
  if (!raw) {
    return [];
  }
  const allowedHosts = getComfyUiAllowedHosts();
  return uniquePoolUrls(
    raw
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean)
      .map(entry => normalizeSafeHttpUrl(entry, { allowPrivate: true, allowedHosts }))
  );
}

export function parseComfyUiPool(extra?: readonly string[]): string[] {
  return uniquePoolUrls([...parseEnvComfyUiPool(), ...normalizeComfyPoolUrlList(extra)]);
}

export function pickComfyUiFromPool(seed?: string, poolUrls?: readonly string[]): string | null {
  const pool = poolUrls ? parseComfyUiPool(poolUrls) : parseComfyUiPool();
  if (pool.length === 0) {
    return null;
  }
  if (seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return pool[hash % pool.length];
  }
  const url = pool[poolIndex % pool.length];
  poolIndex += 1;
  return url;
}

/**
 * VRAM-aware pool pick: prefers the healthy endpoint with the highest free
 * VRAM / lowest queue load using `stats` (or the last cached pool health
 * snapshot). Falls back to round-robin/hash pick (`pickComfyUiFromPool`) when
 * no usable stats are available — always kicking off a best-effort background
 * refresh so the next call has fresher data.
 */
export function pickComfyUiFromPoolVramAware(input?: {
  seed?: string;
  stats?: ComfyUiPoolEndpointStat[] | null;
  poolUrls?: readonly string[];
}): string | null {
  const pool = parseComfyUiPool(input?.poolUrls);
  if (pool.length === 0) {
    return null;
  }

  const stats = input?.stats ?? getComfyUiPoolStatsCache();
  if (stats && stats.length > 0) {
    const best = pickHighestScoringComfyUiEndpoint(pool, stats);
    if (best) {
      return best;
    }
  }

  if (!input?.stats) {
    refreshComfyUiPoolStatsInBackground(pool);
  }

  return pickComfyUiFromPool(input?.seed, pool);
}

/**
 * When a preferred pool host is configured, return it if it appears in the pool
 * and is healthy-ish (unknown health or `ok !== false`). Unhealthy preferred
 * hosts are skipped so VRAM-aware / round-robin can take over.
 */
export function resolvePreferredComfyUiHost(input: {
  preferredComfyHost?: string;
  poolUrls?: string[];
  poolStats?: ComfyUiPoolEndpointStat[] | null;
  /** When true (default), skip preferred host when queue load exceeds threshold. */
  loadBalance?: boolean;
  busyThreshold?: number;
}): string | null {
  const preferred = input.preferredComfyHost?.trim();
  if (!preferred) {
    return null;
  }
  const pool = input.poolUrls ?? parseComfyUiPool();
  if (pool.length === 0) {
    return null;
  }
  const preferredNorm = normalizeUrlForCompare(preferred);
  const match = pool.find(url => normalizeUrlForCompare(url) === preferredNorm);
  if (!match) {
    return null;
  }
  const stats = input.poolStats ?? getComfyUiPoolStatsCache();
  if (!stats || stats.length === 0) {
    return match;
  }
  const stat = stats.find(entry => normalizeUrlForCompare(entry.url) === preferredNorm);
  if (stat && stat.ok === false) {
    return null;
  }
  if (
    input.loadBalance !== false &&
    stat &&
    isComfyUiEndpointTooBusy(stat, input.busyThreshold ?? getDefaultPoolBusyThreshold())
  ) {
    return null;
  }
  return match;
}

export function resolveComfyUiUrlWithPoolDetailed(input: {
  userUrl?: string;
  clientUrl?: string;
  envUrl: string;
  routingSeed?: string;
  poolStats?: ComfyUiPoolEndpointStat[] | null;
  preferredComfyHost?: string;
  loadBalance?: boolean;
  busyThreshold?: number;
  poolUrls?: readonly string[];
}): { url: string; routing?: ComfyUiPoolRoutingMeta } {
  if (input.userUrl?.trim()) {
    return { url: input.userUrl.trim(), routing: { strategy: 'user' } };
  }
  if (input.clientUrl?.trim()) {
    return { url: input.clientUrl.trim(), routing: { strategy: 'client' } };
  }

  const pool = parseComfyUiPool(input.poolUrls);
  const poolStats = input.poolStats ?? getComfyUiPoolStatsCache();
  const loadBalance = input.loadBalance !== false;
  const busyThreshold = input.busyThreshold ?? getDefaultPoolBusyThreshold();
  const preferredHost = input.preferredComfyHost?.trim();

  const preferredSkippedDueToLoad =
    loadBalance &&
    preferredHost &&
    pool.length > 0 &&
    poolStats &&
    poolStats.length > 0 &&
    (() => {
      const preferredNorm = normalizeUrlForCompare(preferredHost);
      const inPool = pool.some(url => normalizeUrlForCompare(url) === preferredNorm);
      if (!inPool) {
        return false;
      }
      const stat = poolStats.find(entry => normalizeUrlForCompare(entry.url) === preferredNorm);
      return Boolean(stat && isComfyUiEndpointTooBusy(stat, busyThreshold));
    })();

  const preferred = resolvePreferredComfyUiHost({
    preferredComfyHost: input.preferredComfyHost,
    poolUrls: pool,
    poolStats,
    loadBalance,
    busyThreshold,
  });
  if (preferred) {
    return { url: preferred, routing: { strategy: 'preferred', preferredHost } };
  }

  if (loadBalance && pool.length > 0 && poolStats && poolStats.length > 0) {
    const balanced = pickLoadBalancedComfyUiEndpoint(pool, poolStats, { busyThreshold });
    if (balanced) {
      return {
        url: balanced,
        routing: {
          strategy: 'load_balance',
          skippedPreferredDueToLoad: preferredSkippedDueToLoad || undefined,
          preferredHost: preferredSkippedDueToLoad ? preferredHost : undefined,
        },
      };
    }
  }

  const pooled = pickComfyUiFromPoolVramAware({
    seed: input.routingSeed,
    stats: poolStats,
    poolUrls: pool,
  });
  if (pooled) {
    return {
      url: pooled,
      routing: {
        strategy: 'vram_aware',
        skippedPreferredDueToLoad: preferredSkippedDueToLoad || undefined,
        preferredHost: preferredSkippedDueToLoad ? preferredHost : undefined,
      },
    };
  }

  const roundRobin = pickComfyUiFromPool(input.routingSeed, pool);
  if (roundRobin) {
    return {
      url: roundRobin,
      routing: {
        strategy: 'round_robin',
        skippedPreferredDueToLoad: preferredSkippedDueToLoad || undefined,
        preferredHost: preferredSkippedDueToLoad ? preferredHost : undefined,
      },
    };
  }

  return { url: input.envUrl, routing: { strategy: 'env' } };
}

export function resolveComfyUiUrlWithPool(input: {
  userUrl?: string;
  clientUrl?: string;
  envUrl: string;
  routingSeed?: string;
  /** VRAM/queue snapshot to prefer over round-robin (falls back to the last cached one). */
  poolStats?: ComfyUiPoolEndpointStat[] | null;
  /** Preferred pool host from SharedToolSettings — wins when in-pool and healthy-ish. */
  preferredComfyHost?: string;
  /** When true (default), skip busy endpoints and rotate to the next least-loaded host. */
  loadBalance?: boolean;
  busyThreshold?: number;
  poolUrls?: readonly string[];
}): string {
  return resolveComfyUiUrlWithPoolDetailed(input).url;
}
