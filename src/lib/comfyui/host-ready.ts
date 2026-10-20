export type PoolQueueEndpoint = {
  url?: string;
  ok?: boolean;
  queueRunning?: number;
  queuePending?: number;
};

export type PoolQueueSummary = {
  totalRunning: number;
  totalPending: number;
  anyOk: boolean;
  hosts: Array<{ url: string; ok: boolean; running: number; pending: number }>;
};

export function shortComfyHostLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.port && parsed.port !== '80' && parsed.port !== '443'
      ? `${parsed.hostname}:${parsed.port}`
      : parsed.hostname;
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '') || url;
  }
}

export function summarizePoolQueueDepth(
  endpoints: PoolQueueEndpoint[],
  fallback?: PoolQueueEndpoint
): PoolQueueSummary {
  const rows = endpoints.filter(endpoint => endpoint.url?.trim()).length
    ? endpoints
    : fallback?.url?.trim()
      ? [fallback]
      : [];
  const hosts = rows
    .map(endpoint => ({
      url: endpoint.url?.trim().replace(/\/+$/, '') ?? '',
      ok: endpoint.ok !== false,
      running: endpoint.queueRunning ?? 0,
      pending: endpoint.queuePending ?? 0,
    }))
    .filter(host => host.url);
  return {
    totalRunning: hosts.reduce((sum, host) => sum + host.running, 0),
    totalPending: hosts.reduce((sum, host) => sum + host.pending, 0),
    anyOk: hosts.some(host => host.ok),
    hosts,
  };
}

export function formatPoolQueueStrip(summary: PoolQueueSummary): string {
  if (summary.hosts.length <= 1) {
    return `ComfyUI queue: ${summary.totalRunning} running · ${summary.totalPending} pending`;
  }
  const parts = summary.hosts.map(host => {
    const mark = host.ok ? '' : ' down';
    return `${shortComfyHostLabel(host.url)} ${host.running}/${host.pending}${mark}`;
  });
  return `Pool ${summary.totalRunning} running · ${summary.totalPending} pending · ${parts.join(' · ')}`;
}

export function collectComfyPoolUrls(input: {
  primary?: string;
  settingsUrl?: string;
  extras?: Array<string | undefined>;
  healthUrls?: Array<string | undefined>;
}): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of [
    input.primary,
    input.settingsUrl,
    ...(input.extras ?? []),
    ...(input.healthUrls ?? []),
  ]) {
    const normalized = raw?.trim().replace(/\/+$/, '');
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    urls.push(normalized);
  }
  return urls;
}

export type WaitForComfyUiHostReadyResult = {
  ok: boolean;
  waitedMs: number;
  attempts: number;
};

/**
 * Poll until `probe` returns true or the timeout elapses.
 * Used after Manager reboot so retry/re-audit wait for ComfyUI, not a fixed sleep.
 */
export async function waitForComfyUiHostReady(input: {
  probe: () => Promise<boolean>;
  timeoutMs?: number;
  intervalMs?: number;
  initialDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<WaitForComfyUiHostReadyResult> {
  const timeoutMs = Math.max(1, input.timeoutMs ?? 60_000);
  const intervalMs = Math.max(1, input.intervalMs ?? 2_000);
  const sleep = input.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  const now = input.now ?? Date.now;
  const started = now();

  if ((input.initialDelayMs ?? 0) > 0) {
    await sleep(input.initialDelayMs ?? 0);
  }

  let attempts = 0;
  while (now() - started < timeoutMs) {
    attempts += 1;
    try {
      if (await input.probe()) {
        return { ok: true, waitedMs: Math.max(0, now() - started), attempts };
      }
    } catch {
      // Host still down or probe threw.
    }
    const remaining = timeoutMs - (now() - started);
    if (remaining <= 0) {
      break;
    }
    await sleep(Math.min(intervalMs, remaining));
  }

  return { ok: false, waitedMs: Math.max(0, now() - started), attempts };
}

export async function probeComfyUiHostViaHealth(comfyUrl?: string): Promise<boolean> {
  const params = new URLSearchParams();
  if (comfyUrl?.trim()) {
    params.set('comfyUrl', comfyUrl.trim());
  }
  const query = params.toString();
  const response = await fetch(query ? `/api/health?${query}` : '/api/health');
  if (!response.ok) {
    return false;
  }
  const data = (await response.json().catch(() => null)) as { comfyui?: { ok?: boolean } } | null;
  return Boolean(data?.comfyui?.ok);
}

/** Health ok plus a non-empty object_info — cold GPU boots often answer health before nodes load. */
export async function probeComfyUiHostFullyReady(comfyUrl?: string): Promise<boolean> {
  if (!(await probeComfyUiHostViaHealth(comfyUrl))) {
    return false;
  }
  try {
    const { fetchComfyObjectInfoCached } = await import('./object-info-cache');
    const info = await fetchComfyObjectInfoCached({ comfyUrl, forceRefresh: true });
    return Boolean(info?.nodeTypes && info.nodeTypes.size > 0);
  } catch {
    return false;
  }
}

/** Default wait after Manager/Queue restart — cold GPU + custom nodes often need >60s. */
export const COMFY_HOST_RESTART_READY_TIMEOUT_MS = 180_000;

export async function waitForComfyUiHostAfterRestart(
  comfyUrl?: string,
  options?: { timeoutMs?: number; requireObjectInfo?: boolean }
): Promise<{
  ok: boolean;
  waitedMs: number;
}> {
  const requireObjectInfo = options?.requireObjectInfo !== false;
  const ready = await waitForComfyUiHostReady({
    probe: () =>
      requireObjectInfo
        ? probeComfyUiHostFullyReady(comfyUrl)
        : probeComfyUiHostViaHealth(comfyUrl),
    timeoutMs: options?.timeoutMs ?? COMFY_HOST_RESTART_READY_TIMEOUT_MS,
    intervalMs: 2_000,
    initialDelayMs: 1_000,
  });
  if (ready.ok && !requireObjectInfo) {
    const { fetchComfyObjectInfoCached } = await import('./object-info-cache');
    await fetchComfyObjectInfoCached({ comfyUrl, forceRefresh: true });
  }
  return { ok: ready.ok, waitedMs: ready.waitedMs };
}
