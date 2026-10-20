'use client';

import type { ComfyGalleryEntry } from './gallery/comfyui-gallery';
import type { ComfyUiRuntimeConfig, WorkflowParamValues } from './comfyui/config';
import type { QueueQualityProfile } from './queue-quality-profile';
import { normalizeQueueQualityProfile } from './queue-quality-profile';
import { readBrowserValue, writeBrowserValue } from './browser-storage';

const STORAGE_KEY = 'prompt-studio.held-max-jobs.v1';

export const HELD_MAX_UPDATED_EVENT = 'prompt-studio-held-max-updated';

export type HeldMaxGalleryJob = {
  id: string;
  createdAt: number;
  kind: 'upscale' | 'moire' | 'refine';
  entryId: string;
  qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'>;
  label: string;
};

export type HeldMaxGenerateJob = {
  id: string;
  createdAt: number;
  kind: 'generate';
  qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'>;
  label: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  tool?: string;
  params?: WorkflowParamValues;
  comfy?: ComfyUiRuntimeConfig;
};

export type HeldMaxJob = HeldMaxGalleryJob | HeldMaxGenerateJob;

function emitHeldMaxUpdated(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(HELD_MAX_UPDATED_EVENT));
}

function readJobs(): HeldMaxJob[] {
  if (typeof window === 'undefined') {
    return [];
  }
  const parsed = readBrowserValue<HeldMaxJob[]>(STORAGE_KEY);
  return Array.isArray(parsed) ? parsed : [];
}

function writeJobs(jobs: HeldMaxJob[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  // Jobs are appended to the end (see holdMaxGalleryEnhance/holdMaxGenerate below), so keeping
  // the *last* 40 keeps the newest ones; slice(0, 40) was keeping the oldest and silently
  // dropping every job queued past the cap.
  writeBrowserValue(STORAGE_KEY, jobs.slice(-40));
  emitHeldMaxUpdated();
}

export function listHeldMaxJobs(): HeldMaxJob[] {
  return readJobs();
}

/** Replace the held-max queue (used by studio-extras sync). */
export function replaceHeldMaxJobs(jobs: HeldMaxJob[]): void {
  writeJobs(Array.isArray(jobs) ? jobs : []);
}

export function holdMaxGalleryEnhance(input: {
  entry: Pick<ComfyGalleryEntry, 'id' | 'model' | 'tool'>;
  kind: 'upscale' | 'moire' | 'refine';
  qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'>;
}): HeldMaxGalleryJob {
  const job: HeldMaxGalleryJob = {
    id: `held-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    kind: input.kind,
    entryId: input.entry.id,
    qualityProfile: input.qualityProfile,
    label: input.entry.model ?? input.entry.tool ?? input.entry.id.slice(0, 8),
  };
  writeJobs([...readJobs(), job]);
  return job;
}

export function holdMaxGenerateJob(input: {
  prompt: string;
  negativePrompt?: string;
  model: string;
  tool?: string;
  params?: WorkflowParamValues;
  comfy?: ComfyUiRuntimeConfig;
  qualityProfile?: Extract<QueueQualityProfile, 'final' | 'max'>;
}): HeldMaxGenerateJob {
  const job: HeldMaxGenerateJob = {
    id: `held-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    kind: 'generate',
    qualityProfile: input.qualityProfile ?? 'max',
    label: input.model || input.tool || 'generate',
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    model: input.model,
    tool: input.tool,
    params: input.params,
    comfy: input.comfy,
  };
  writeJobs([...readJobs(), job]);
  return job;
}

/**
 * When Hold Max is on and the Comfy queue is busy, park Max generate jobs.
 * Returns held count (0 = proceed to queue normally).
 */
export async function maybeHoldMaxGenerateJobs(input: {
  profile?: QueueQualityProfile;
  jobs: Array<{
    prompt: string;
    negativePrompt?: string;
    model: string;
    tool?: string;
    params?: WorkflowParamValues;
    comfy?: ComfyUiRuntimeConfig;
  }>;
}): Promise<{ held: boolean; count: number }> {
  if (normalizeQueueQualityProfile(input.profile) !== 'max') {
    return { held: false, count: 0 };
  }
  if (input.jobs.length === 0) {
    return { held: false, count: 0 };
  }
  if (!(await shouldHoldMaxUntilIdle())) {
    return { held: false, count: 0 };
  }
  for (const job of input.jobs) {
    holdMaxGenerateJob({
      ...job,
      qualityProfile: 'max',
    });
  }
  return { held: true, count: input.jobs.length };
}

export function removeHeldMaxJob(id: string): void {
  writeJobs(readJobs().filter(job => job.id !== id));
}

export function clearHeldMaxJobs(): void {
  writeJobs([]);
}

export function isComfyQueueIdle(health: {
  queuePending?: number;
  queueRunning?: number;
}): boolean {
  return (health.queuePending ?? 0) === 0 && (health.queueRunning ?? 0) === 0;
}

export async function fetchComfyQueueIdle(): Promise<boolean> {
  try {
    const response = await fetch('/api/health', {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return true;
    }
    const data = (await response.json()) as {
      comfyui?: { queuePending?: number; queueRunning?: number };
    };
    return isComfyQueueIdle(data.comfyui ?? {});
  } catch {
    return true;
  }
}

/** True when Max should be parked instead of queued. */
export async function shouldHoldMaxUntilIdle(): Promise<boolean> {
  const { loadSettingsCache } = await import('./settings-cache');
  if (loadSettingsCache().shared.holdMaxUntilIdle !== true) {
    return false;
  }
  return !(await fetchComfyQueueIdle());
}
