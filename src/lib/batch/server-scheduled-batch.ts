import { clampScheduledBatchConfig, type ScheduledBatchConfig } from './scheduled-batch';
import {
  mergeScheduledBatchProfile,
  normalizeScheduledBatchProfile,
  resolveScheduledBatchProfileFromEnv,
  type ScheduledBatchProfile,
} from './scheduled-batch-profile';
import { mapWithConcurrency } from '../queue/concurrency';
import { getLlmMaxInflight } from '../llm/backpressure';

type StoredScheduledBatch = {
  config?: ScheduledBatchConfig;
  lastRunAt?: number;
  /** Server-readable mirror of Studio Automation → Scheduled batch (model/detail/quality/etc). */
  profile?: ScheduledBatchProfile;
  schedulerEnabled?: boolean;
  intervalMinutes?: number;
};

async function loadStored(): Promise<StoredScheduledBatch> {
  const { isServerStorageEnabled, readServerStorage } = await import('../storage/server-storage');
  if (!isServerStorageEnabled()) {
    return {};
  }
  return readServerStorage<StoredScheduledBatch>('scheduled-batch') ?? {};
}

async function saveStored(data: StoredScheduledBatch): Promise<void> {
  const { isServerStorageEnabled, writeServerStorage } = await import('../storage/server-storage');
  if (isServerStorageEnabled()) {
    writeServerStorage('scheduled-batch', data);
  }
}

/** Persisted profile (when server storage is enabled) merged over the `SERVER_SCHEDULED_BATCH_*` env fallback. */
export async function loadServerScheduledBatchProfile(): Promise<ScheduledBatchProfile> {
  const stored = await loadStored();
  return mergeScheduledBatchProfile(resolveScheduledBatchProfileFromEnv(), stored.profile);
}

/** Persists a batch profile update from Settings Automation. No-ops (but still returns the normalized profile) when server storage is disabled. */
export async function saveServerScheduledBatchProfile(
  profile: Partial<ScheduledBatchProfile>
): Promise<{ profile: ScheduledBatchProfile; persisted: boolean }> {
  const normalized = normalizeScheduledBatchProfile(profile);
  const { isServerStorageEnabled } = await import('../storage/server-storage');
  if (!isServerStorageEnabled()) {
    return { profile: normalized, persisted: false };
  }
  const stored = await loadStored();
  await saveStored({ ...stored, profile: normalized });
  return { profile: normalized, persisted: true };
}

export async function saveServerScheduledBatchScheduler(input: {
  enabled?: boolean;
  intervalMinutes?: number;
}): Promise<{ enabled: boolean; intervalMinutes: number; persisted: boolean }> {
  const { isServerStorageEnabled } = await import('../storage/server-storage');
  const stored = isServerStorageEnabled() ? await loadStored() : {};
  const intervalMinutes = Math.max(
    5,
    Math.min(24 * 60, Math.round(Number(input.intervalMinutes ?? stored.intervalMinutes) || 60))
  );
  const enabled =
    input.enabled === undefined ? stored.schedulerEnabled === true : input.enabled === true;
  if (!isServerStorageEnabled()) {
    return { enabled, intervalMinutes, persisted: false };
  }
  await saveStored({
    ...stored,
    schedulerEnabled: enabled,
    intervalMinutes,
  });
  return { enabled, intervalMinutes, persisted: true };
}

/** Profile + last run status for display in Settings, regardless of storage availability. */
export async function loadServerScheduledBatchStatus(): Promise<{
  profile: ScheduledBatchProfile;
  lastRunAt?: number;
  persisted: boolean;
  enabled: boolean;
  intervalMinutes: number;
}> {
  const { isServerStorageEnabled } = await import('../storage/server-storage');
  const stored = await loadStored();
  const intervalMinutes =
    stored.intervalMinutes ?? Number(process.env.SERVER_SCHEDULED_BATCH_INTERVAL_MIN ?? '60');
  return {
    profile: mergeScheduledBatchProfile(resolveScheduledBatchProfileFromEnv(), stored.profile),
    lastRunAt: stored.lastRunAt,
    persisted: isServerStorageEnabled(),
    enabled: isServerScheduledBatchEnabled(stored.schedulerEnabled),
    intervalMinutes: Number.isFinite(intervalMinutes) ? intervalMinutes : 60,
  };
}

/** Resolves the effective server scheduler config (enabled/interval from env, rest from the batch profile). */
export function isServerScheduledBatchEnabled(
  storedEnabled: boolean | undefined,
  envFlag: string | undefined = process.env.SERVER_SCHEDULED_BATCH
): boolean {
  return storedEnabled === true || envFlag?.trim() === 'true';
}

export async function resolveServerScheduledBatchConfig(
  profile?: ScheduledBatchProfile
): Promise<ScheduledBatchConfig> {
  const resolvedProfile = profile ?? (await loadServerScheduledBatchProfile());
  const stored = await loadStored();
  const intervalMinutes = Number(
    stored.intervalMinutes ?? process.env.SERVER_SCHEDULED_BATCH_INTERVAL_MIN ?? '60'
  );
  return clampScheduledBatchConfig({
    enabled: isServerScheduledBatchEnabled(stored.schedulerEnabled),
    intervalMinutes,
    target: resolvedProfile.target,
    count: resolvedProfile.count,
    autoQueueComfyUi: resolvedProfile.autoQueueComfyUi,
    genre: resolvedProfile.genre,
  });
}

async function fetchJson<T>(path: string, body: unknown): Promise<T> {
  const origin = process.env.PROMPT_API_URL?.trim() || 'http://127.0.0.1:47832';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = process.env.PROMPT_API_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Server batch call failed: ${path} HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function runServerScheduledBatch(
  configInput?: Partial<ScheduledBatchConfig>
): Promise<{ prompts: string[]; queued: number }> {
  const profile = await loadServerScheduledBatchProfile();
  const baseConfig = await resolveServerScheduledBatchConfig(profile);
  const config = clampScheduledBatchConfig({
    ...baseConfig,
    enabled: true,
    ...configInput,
  });

  const bestOfN = profile.bestOfN ?? 1;
  const generateCount = bestOfN > 1 ? config.count * bestOfN : config.count;
  const useVisionRank = Boolean(profile.bestOfNVision && bestOfN > 1 && config.autoQueueComfyUi);
  const prompts: string[] = [];
  const model = profile.model;
  const detail = profile.detail;

  if (config.target === 'topics') {
    const data = await fetchJson<{ results?: Array<{ prompt?: string }> }>('/api/topics/batch', {
      topics: Array.from({ length: generateCount }, (_, index) =>
        config.genre?.trim()
          ? `${config.genre.trim()} scene ${index + 1}`
          : `Scheduled scene ${index + 1}`
      ),
      target: 'generate',
      model,
      detail,
    });
    for (const entry of data.results ?? []) {
      if (entry.prompt?.trim()) {
        prompts.push(entry.prompt.trim());
      }
    }
  } else if (config.target === 'nsfw-generator') {
    // Each call goes through /api/nsfw-generate -> chatCompletion(), which is throttled to
    // LLM_MAX_INFLIGHT concurrent requests (llm-backpressure.ts) and throws immediately rather
    // than queuing once saturated — so this can't be a flat Promise.all over up to 48 calls
    // without most of them failing outright. Bounding concurrency to the same limit the LLM
    // client itself enforces keeps this safely under that ceiling while still running calls in
    // parallel instead of one at a time.
    const results = await mapWithConcurrency(
      Array.from({ length: generateCount }),
      getLlmMaxInflight(),
      () =>
        fetchJson<{ prompt?: string }>('/api/nsfw-generate', {
          model,
          detail,
          wildness: 55,
          hints: config.genre?.trim() || undefined,
        })
    );
    for (const data of results) {
      if (data.prompt?.trim()) {
        prompts.push(data.prompt.trim());
      }
    }
  } else {
    const results = await mapWithConcurrency(
      Array.from({ length: generateCount }),
      getLlmMaxInflight(),
      () =>
        fetchJson<{ prompt?: string }>('/api/random-scene', {
          model,
          detail,
          genre: config.genre?.trim() || undefined,
          includePeople: true,
          wildness: 50,
        })
    );
    for (const data of results) {
      if (data.prompt?.trim()) {
        prompts.push(data.prompt.trim());
      }
    }
  }

  let finalPrompts = prompts;
  if (!useVisionRank && bestOfN > 1 && prompts.length > config.count) {
    const { rankPromptsWithLlm } = await import('../best-of-n/rank-server');
    finalPrompts = await rankPromptsWithLlm(prompts, config.count);
  } else if (!useVisionRank) {
    finalPrompts = prompts.slice(0, config.count);
  } else {
    finalPrompts = prompts.slice(0, generateCount);
  }

  let queued = 0;
  const queuedPromptIds: string[] = [];
  const queuedPromptTexts: string[] = [];
  let batchComfyUrl: string | undefined;

  if (config.autoQueueComfyUi && finalPrompts.length > 0) {
    const { queueBatchToComfyUi } = await import('../comfyui/client');
    const { resolveQueueParams } = await import('../queue/params-settings');
    const paramsPerPrompt = finalPrompts.map((_, index) =>
      resolveQueueParams({
        model,
        tool: 'scheduled-batch',
        base: { seed: String(Math.floor(Math.random() * 2 ** 32) + index) },
        qualityProfile: profile.qualityProfile,
      })
    );
    const batch = await queueBatchToComfyUi(
      finalPrompts.map((prompt, index) => ({
        prompt,
        model,
        params: paramsPerPrompt[index],
      }))
    );
    queued = batch.queued;
    batchComfyUrl = batch.comfyUrl;

    const { appendServerGalleryEntries } = await import('../gallery/server-gallery-storage');
    const queuedAt = Date.now();
    const entries = batch.results.flatMap((result, index) => {
      if (!result.ok || !result.promptId) {
        return [];
      }
      queuedPromptIds.push(result.promptId);
      queuedPromptTexts.push(finalPrompts[index] ?? '');
      return [
        {
          id: crypto.randomUUID(),
          promptId: result.promptId,
          prompt: finalPrompts[index] ?? '',
          tool: 'scheduled-batch',
          model,
          comfyUrl: result.comfyUrl,
          queueParams: paramsPerPrompt[index],
          queueQualityProfile: profile.qualityProfile,
          status: 'pending' as const,
          statusMessage: 'Queued via server scheduled batch',
          queuedAt,
          images: [],
        },
      ];
    });
    await appendServerGalleryEntries(entries);

    if (useVisionRank && queuedPromptIds.length > config.count) {
      const { runServerPostQueueVisionCull } = await import('../best-of-n/vision-server');
      const { removeServerGalleryEntriesByPromptIds } =
        await import('../gallery/server-gallery-storage');
      const cull = await runServerPostQueueVisionCull({
        promptIds: queuedPromptIds,
        prompts: queuedPromptTexts,
        keep: config.count,
        comfyUrl: batchComfyUrl,
      });
      if (cull.culledPromptIds.length > 0) {
        await removeServerGalleryEntriesByPromptIds(cull.culledPromptIds);
      }
      finalPrompts = cull.keptCandidates.map(entry => entry.prompt);
    }
  }

  const stored = await loadStored();
  await saveStored({ ...stored, config, profile, lastRunAt: Date.now() });
  return { prompts: finalPrompts, queued };
}

export async function notifyServerScheduledBatchComplete(result: {
  prompts: string[];
  queued: number;
  ranked?: boolean;
}): Promise<void> {
  const { notifyBatchCompleted } = await import('../email/notifications');
  await notifyBatchCompleted({
    kind: 'server-scheduled',
    promptCount: result.prompts.length,
    queued: result.queued,
    ranked: result.ranked,
  });
}

export async function shouldRunServerScheduledBatch(
  config: ScheduledBatchConfig,
  now = Date.now()
): Promise<boolean> {
  const configClamped = clampScheduledBatchConfig(config);
  if (!configClamped.enabled) {
    return false;
  }
  const stored = await loadStored();
  const intervalMs = configClamped.intervalMinutes * 60_000;
  const last = stored.lastRunAt ?? 0;
  return now - last >= intervalMs;
}
