import type { ComfyUiRuntimeConfig } from './comfyui-config';
import type { QueueQualityProfile } from './queue-quality-profile';
import { normalizeQueueQualityProfile } from './queue-quality-profile';
import { loadSettingsCache } from './settings-cache';

/** Default free VRAM below which Max enrich is too heavy for most 24GB cards mid-queue. */
export const MAX_VRAM_FREE_BYTES_THRESHOLD = 6 * 1e9;

export type VramSnapshot = { free?: number; total?: number };

export type VramGuardOptions = {
  enabled?: boolean;
  /** Free VRAM threshold in bytes. */
  freeBytesThreshold?: number;
  /** Size the threshold from the card's total VRAM when it is known. */
  auto?: boolean;
};

/** Auto threshold for a card: ~30% of total VRAM, in half-GB steps, kept to 4–12 GB. */
export function autoVramThresholdGb(totalBytes: number | null | undefined): number | null {
  if (typeof totalBytes !== 'number' || !Number.isFinite(totalBytes) || totalBytes <= 0) {
    return null;
  }
  const gb = Math.round((totalBytes / 1e9) * 0.3 * 2) / 2;
  return Math.min(12, Math.max(4, gb));
}

export function getVramGuardOptions(): Required<VramGuardOptions> {
  if (typeof window === 'undefined') {
    return { enabled: true, freeBytesThreshold: MAX_VRAM_FREE_BYTES_THRESHOLD, auto: true };
  }
  const shared = loadSettingsCache().shared;
  const gb = shared.vramGuardMinFreeGb;
  const freeBytesThreshold =
    typeof gb === 'number' && Number.isFinite(gb)
      ? Math.min(48, Math.max(1, gb)) * 1e9
      : MAX_VRAM_FREE_BYTES_THRESHOLD;
  return {
    enabled: shared.vramGuardEnabled !== false,
    freeBytesThreshold,
    auto: shared.vramGuardAutoThreshold !== false,
  };
}

export function isVramTightForMax(vram?: VramSnapshot | null, options?: VramGuardOptions): boolean {
  const stored =
    options?.enabled == null || options?.freeBytesThreshold == null || options?.auto == null
      ? getVramGuardOptions()
      : null;
  const resolved = {
    enabled: options?.enabled ?? stored!.enabled,
    freeBytesThreshold: options?.freeBytesThreshold ?? stored!.freeBytesThreshold,
    auto: options?.auto ?? stored!.auto,
  };
  if (!resolved.enabled) {
    return false;
  }
  const free = vram?.free;
  if (typeof free !== 'number' || !Number.isFinite(free)) {
    return false;
  }
  const autoGb = resolved.auto ? autoVramThresholdGb(vram?.total) : null;
  return free < (autoGb != null ? autoGb * 1e9 : resolved.freeBytesThreshold);
}

/**
 * When Max would run and free VRAM is tight, downgrade to Final (skip neural/refiner peak).
 */
export function maybeDowngradeMaxForVram(
  profile: QueueQualityProfile | undefined,
  vram?: VramSnapshot | null,
  options?: VramGuardOptions
): { profile: QueueQualityProfile; downgraded: boolean } {
  const normalized = normalizeQueueQualityProfile(profile);
  if (normalized !== 'max' || !isVramTightForMax(vram, options)) {
    return { profile: normalized, downgraded: false };
  }
  return { profile: 'final', downgraded: true };
}

export async function fetchComfyVramSnapshot(comfyUrl?: string): Promise<VramSnapshot | null> {
  try {
    const params = new URLSearchParams();
    if (comfyUrl?.trim()) {
      params.set('comfyUrl', comfyUrl.trim());
    }
    const query = params.toString();
    const response = await fetch(query ? `/api/health?${query}` : '/api/health', {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      comfyui?: { vram?: VramSnapshot; url?: string };
      comfyuiPool?: {
        enabled?: boolean;
        endpoints?: Array<{
          url?: string;
          ok?: boolean;
          vram?: VramSnapshot;
          queuePending?: number;
          queueRunning?: number;
        }>;
      };
    };

    // Prefer the target host, else the highest-scoring healthy pool member, else primary.
    if (comfyUrl?.trim() && data.comfyui?.vram) {
      return data.comfyui.vram;
    }
    if (data.comfyuiPool?.enabled && data.comfyuiPool.endpoints?.length) {
      const { pickHighestScoringComfyUiEndpoint } = await import('./comfyui-pool');
      const stats = data.comfyuiPool.endpoints
        .map(endpoint => {
          const url = endpoint.url?.trim();
          if (!url) {
            return null;
          }
          return {
            url,
            ok: endpoint.ok !== false,
            vram: endpoint.vram,
            queuePending: endpoint.queuePending,
            queueRunning: endpoint.queueRunning,
          };
        })
        .filter((endpoint): endpoint is NonNullable<typeof endpoint> => Boolean(endpoint));
      const bestUrl = pickHighestScoringComfyUiEndpoint(
        stats.map(stat => stat.url),
        stats
      );
      const best = bestUrl
        ? stats.find(stat => stat.url === bestUrl)
        : stats.find(stat => stat.ok && stat.vram?.free != null);
      if (best?.vram) {
        return best.vram;
      }
    }
    return data.comfyui?.vram ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch VRAM + downgrade Max→Final on a runtime (and optional override profile).
 * Use before every /api/comfyui post that may run Max enrich.
 * Pass `comfyUrl` when the target host is already known so the guard reads that card.
 */
export async function guardQueueQualityForVram(input: {
  profile?: QueueQualityProfile;
  runtime?: ComfyUiRuntimeConfig;
  comfyUrl?: string;
}): Promise<{
  profile: QueueQualityProfile;
  runtime?: ComfyUiRuntimeConfig;
  downgraded: boolean;
}> {
  const base =
    input.profile ?? input.runtime?.queueQualityProfile ?? normalizeQueueQualityProfile(undefined);
  const targetUrl = input.comfyUrl?.trim() || input.runtime?.apiUrl?.trim() || undefined;
  const vram = await fetchComfyVramSnapshot(targetUrl);
  const guard = maybeDowngradeMaxForVram(base, vram);
  return {
    profile: guard.profile,
    downgraded: guard.downgraded,
    runtime: input.runtime ? { ...input.runtime, queueQualityProfile: guard.profile } : undefined,
  };
}
