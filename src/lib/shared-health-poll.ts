'use client';

import { loadComfyUiSettings } from './comfyui-settings';

/**
 * Shared /api/health poller.
 *
 * Before this module existed, ConnectionHealthChip (60s), useSystemTrayState (20s),
 * QueueOrchestrationPanel (30s), QueueTool (4s), and MobileQueueTool (8s) each ran their own
 * independent `fetch('/api/health')` + `setInterval` — every one of them mounted globally or on
 * a commonly-visited page, so e.g. visiting /queue meant 3+ uncoordinated pollers hitting the
 * same endpoint at once (roughly 19 requests/minute where 1-4 would do), with no shared cache,
 * no pause when the tab is backgrounded, and no backoff when the backend is unreachable.
 *
 * This module fetches /api/health once per tick and fans the parsed response out to every
 * subscriber. Each subscriber still declares its own desired interval — the actual poll runs at
 * the FASTEST interval any current subscriber wants, so e.g. QueueTool's 4s need is preserved
 * while it's mounted, and the interval relaxes back down once it unmounts. Consumers keep their
 * own narrower typing/derivation of the response exactly as before; this module only dedupes the
 * network fetch and the timer.
 */

export type RawHealthResponse = Record<string, unknown> | null;

type Listener = {
  intervalMs: number;
  onData: (data: RawHealthResponse) => void;
};

const DEFAULT_POLL_MS = 20_000;
// Bursts of forceRefresh() calls (e.g. several components refreshing on window focus at once)
// collapse into a single fetch instead of one per caller.
const MIN_FORCE_GAP_MS = 1_000;

const listeners = new Map<symbol, Listener>();
let cached: RawHealthResponse = null;
let inFlight: Promise<RawHealthResponse> | null = null;
let lastFetchAt = 0;
let intervalId: number | null = null;

/**
 * The ComfyUI address renders go to when it isn't the server's: Settings → ComfyUI with "Use the
 * server's ComfyUI URL" off sends its own address with every queue, so health must check that one
 * — checking the server's showed "ComfyUI is offline" while renders went through.
 */
function healthUrl(): string {
  try {
    const settings = loadComfyUiSettings();
    const own = settings.useServerDefaults ? '' : settings.apiUrl?.trim();
    return own ? `/api/health?comfyUrl=${encodeURIComponent(own)}` : '/api/health';
  } catch {
    return '/api/health';
  }
}

async function doFetch(): Promise<RawHealthResponse> {
  try {
    const response = await fetch(healthUrl());
    return (await response.json()) as RawHealthResponse;
  } catch {
    return null;
  }
}

function notifyAll(): void {
  for (const listener of listeners.values()) {
    listener.onData(cached);
  }
}

/** Force a fresh fetch (bypassing the cache), e.g. for a manual "Refresh" button or right after
 * a mutating action (cancel/restart/claim) where the caller wants the latest state immediately. */
export async function refreshSharedHealth(options?: {
  force?: boolean;
}): Promise<RawHealthResponse> {
  const force = options?.force === true;
  if (inFlight) {
    return inFlight;
  }
  const now = Date.now();
  if (!force && cached !== null && now - lastFetchAt < MIN_FORCE_GAP_MS) {
    return cached;
  }
  inFlight = doFetch().then(result => {
    cached = result;
    lastFetchAt = Date.now();
    inFlight = null;
    notifyAll();
    return result;
  });
  return inFlight;
}

function fastestRequestedIntervalMs(): number {
  let fastest = Infinity;
  for (const listener of listeners.values()) {
    if (listener.intervalMs < fastest) {
      fastest = listener.intervalMs;
    }
  }
  return Number.isFinite(fastest) ? fastest : DEFAULT_POLL_MS;
}

function rescheduleInterval(): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (intervalId != null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
  if (listeners.size === 0) {
    return;
  }
  const ms = fastestRequestedIntervalMs();
  intervalId = window.setInterval(() => {
    // Skip ticks while the tab is backgrounded — none of the original pollers did this, so this
    // is a strict improvement, not a behavior this replaces.
    if (document.visibilityState === 'visible') {
      void refreshSharedHealth();
    }
  }, ms);
}

/**
 * Subscribe to shared health updates. `intervalMs` is this subscriber's desired freshness — the
 * actual shared poll runs at the fastest interval any current subscriber requests. Returns an
 * unsubscribe function; call it from your effect's cleanup.
 */
export function subscribeSharedHealth(
  onData: (data: RawHealthResponse) => void,
  intervalMs: number = DEFAULT_POLL_MS
): () => void {
  const key = Symbol('shared-health-subscriber');
  listeners.set(key, { intervalMs, onData });
  rescheduleInterval();
  if (cached !== null) {
    onData(cached);
  } else {
    void refreshSharedHealth();
  }
  return () => {
    listeners.delete(key);
    rescheduleInterval();
  };
}
