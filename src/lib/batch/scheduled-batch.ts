import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';
import { normalizeDetailLevel, type DetailLevel } from '../prompt/detail-level';
import { normalizeQueueQualityProfile, type QueueQualityProfile } from '../queue/quality-profile';

export const SCHEDULED_BATCH_KEY = 'comfy-scheduled-batch-v2';

export type ScheduledBatchConfig = {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt?: number;
  target: 'random-scene' | 'topics' | 'nsfw-generator';
  count: number;
  autoQueueComfyUi: boolean;
  genre?: string;
  /** When true, use model/detail/qualityProfile below instead of shared tool settings. */
  overrideSharedSettings?: boolean;
  model?: string;
  detail?: DetailLevel;
  qualityProfile?: QueueQualityProfile;
  /** Generate count × bestOfN, LLM-rank down to count (1 = off). */
  bestOfN?: number;
  /** After Comfy queue completes, vision-rank outputs and keep top count (needs LLM_VISION_MODEL). */
  bestOfNVision?: boolean;
  /** Auto-retry failed webhook deliveries with backoff (browser log). */
  webhookAutoRetry?: boolean;
};

export const DEFAULT_SCHEDULED_BATCH: ScheduledBatchConfig = {
  enabled: false,
  intervalMinutes: 60,
  target: 'random-scene',
  count: 3,
  autoQueueComfyUi: false,
};

const MAX_SCHEDULED_COUNT = 12;
const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 24 * 60;

export function clampScheduledBatchConfig(config: ScheduledBatchConfig): ScheduledBatchConfig {
  const count = Number.isFinite(config.count)
    ? Math.min(MAX_SCHEDULED_COUNT, Math.max(1, Math.floor(config.count)))
    : DEFAULT_SCHEDULED_BATCH.count;
  const intervalMinutes = Number.isFinite(config.intervalMinutes)
    ? Math.min(
        MAX_INTERVAL_MINUTES,
        Math.max(MIN_INTERVAL_MINUTES, Math.floor(config.intervalMinutes))
      )
    : DEFAULT_SCHEDULED_BATCH.intervalMinutes;

  return {
    ...DEFAULT_SCHEDULED_BATCH,
    ...config,
    count,
    intervalMinutes,
    target:
      config.target === 'topics'
        ? 'topics'
        : config.target === 'nsfw-generator'
          ? 'nsfw-generator'
          : 'random-scene',
    autoQueueComfyUi: Boolean(config.autoQueueComfyUi),
    enabled: Boolean(config.enabled),
    overrideSharedSettings: Boolean(config.overrideSharedSettings),
    model: config.model?.trim() || undefined,
    detail: config.detail ? normalizeDetailLevel(config.detail) : undefined,
    qualityProfile: config.qualityProfile
      ? normalizeQueueQualityProfile(config.qualityProfile)
      : undefined,
    bestOfN: Number.isFinite(config.bestOfN)
      ? Math.min(4, Math.max(1, Math.floor(config.bestOfN!)))
      : 1,
    bestOfNVision: Boolean(config.bestOfNVision),
    webhookAutoRetry: Boolean(config.webhookAutoRetry),
  };
}

export function loadScheduledBatchConfig(): ScheduledBatchConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_SCHEDULED_BATCH;
  }
  try {
    const parsed =
      readBrowserValue<ScheduledBatchConfig>(SCHEDULED_BATCH_KEY) ??
      readBrowserValue<ScheduledBatchConfig>('comfy-scheduled-batch-v1');
    if (!parsed) {
      return DEFAULT_SCHEDULED_BATCH;
    }
    return clampScheduledBatchConfig({
      ...DEFAULT_SCHEDULED_BATCH,
      ...parsed,
    });
  } catch {
    return DEFAULT_SCHEDULED_BATCH;
  }
}

export function saveScheduledBatchConfig(config: ScheduledBatchConfig): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(SCHEDULED_BATCH_KEY, clampScheduledBatchConfig(config));
}

export function shouldRunScheduledBatch(config: ScheduledBatchConfig, now = Date.now()): boolean {
  const clamped = clampScheduledBatchConfig(config);
  if (!clamped.enabled) {
    return false;
  }
  const intervalMs = clamped.intervalMinutes * 60_000;
  const last = clamped.lastRunAt ?? 0;
  return now - last >= intervalMs;
}
