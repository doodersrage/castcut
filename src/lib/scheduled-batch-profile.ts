import { DEFAULT_COMFY_MODEL } from './comfy-models/client';
import { normalizeDetailLevel, type DetailLevel } from './detail-level';
import { normalizeQueueQualityProfile, type QueueQualityProfile } from './queue-quality-profile';
import { clampScheduledBatchConfig, type ScheduledBatchConfig } from './scheduled-batch';

/**
 * Server-readable mirror of the Studio Automation → Scheduled batch settings.
 * Lets the headless server runner queue with the same model/detail/quality
 * the user configured in Settings instead of hardcoded defaults.
 */
export type ScheduledBatchProfile = {
  model: string;
  detail: DetailLevel;
  qualityProfile: QueueQualityProfile;
  target: ScheduledBatchConfig['target'];
  count: number;
  genre?: string;
  autoQueueComfyUi: boolean;
  bestOfN?: number;
  bestOfNVision?: boolean;
};

export const DEFAULT_SCHEDULED_BATCH_PROFILE: ScheduledBatchProfile = {
  model: DEFAULT_COMFY_MODEL,
  detail: 'balanced',
  qualityProfile: 'followSettings',
  target: 'random-scene',
  count: 3,
  autoQueueComfyUi: false,
};

export function normalizeScheduledBatchProfile(
  input?: Partial<ScheduledBatchProfile>
): ScheduledBatchProfile {
  const clampedBatch = clampScheduledBatchConfig({
    enabled: true,
    intervalMinutes: 60,
    target: input?.target ?? DEFAULT_SCHEDULED_BATCH_PROFILE.target,
    count: input?.count ?? DEFAULT_SCHEDULED_BATCH_PROFILE.count,
    autoQueueComfyUi: input?.autoQueueComfyUi ?? DEFAULT_SCHEDULED_BATCH_PROFILE.autoQueueComfyUi,
    genre: input?.genre,
  });

  const genre = clampedBatch.genre?.trim();
  return {
    model: input?.model?.toString().trim() || DEFAULT_SCHEDULED_BATCH_PROFILE.model,
    detail: normalizeDetailLevel(input?.detail),
    qualityProfile: normalizeQueueQualityProfile(input?.qualityProfile),
    target: clampedBatch.target,
    count: clampedBatch.count,
    ...(genre ? { genre } : {}),
    autoQueueComfyUi: clampedBatch.autoQueueComfyUi,
    ...(input?.bestOfN && Number.isFinite(input.bestOfN)
      ? { bestOfN: Math.min(4, Math.max(1, Math.floor(input.bestOfN))) }
      : {}),
    ...(input?.bestOfNVision === true ? { bestOfNVision: true } : {}),
  };
}

/** Merges a partial override onto a base profile, re-normalizing the result. */
export function mergeScheduledBatchProfile(
  base: ScheduledBatchProfile,
  override?: Partial<ScheduledBatchProfile>
): ScheduledBatchProfile {
  if (!override) {
    return base;
  }
  return normalizeScheduledBatchProfile({ ...base, ...override });
}

function envDetailLevel(): DetailLevel | undefined {
  const raw = process.env.SERVER_SCHEDULED_BATCH_DETAIL?.trim();
  return raw ? normalizeDetailLevel(raw) : undefined;
}

function envQualityProfile(): QueueQualityProfile | undefined {
  const raw = process.env.SERVER_SCHEDULED_BATCH_QUALITY?.trim();
  return raw ? normalizeQueueQualityProfile(raw) : undefined;
}

/** Builds the fallback profile from `SERVER_SCHEDULED_BATCH_*` env knobs (used when no persisted profile exists). */
export function resolveScheduledBatchProfileFromEnv(): ScheduledBatchProfile {
  return normalizeScheduledBatchProfile({
    model:
      process.env.SERVER_SCHEDULED_BATCH_MODEL?.trim() ||
      process.env.LLM_MODEL?.trim() ||
      DEFAULT_SCHEDULED_BATCH_PROFILE.model,
    detail: envDetailLevel(),
    qualityProfile: envQualityProfile(),
    target: process.env.SERVER_SCHEDULED_BATCH_TARGET === 'topics' ? 'topics' : 'random-scene',
    count: Number(
      process.env.SERVER_SCHEDULED_BATCH_COUNT ?? DEFAULT_SCHEDULED_BATCH_PROFILE.count
    ),
    genre: process.env.SERVER_SCHEDULED_BATCH_GENRE,
    autoQueueComfyUi: process.env.SERVER_SCHEDULED_BATCH_QUEUE === 'true',
  });
}
