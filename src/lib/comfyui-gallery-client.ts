import type { ComfyHistoryImportItem } from './comfyui-status';
import {
  addComfyGalleryEntry,
  loadComfyGallery,
  saveComfyGallery,
  updateComfyGalleryByPromptId,
  updateComfyGalleryEntryById,
  type ComfyGalleryEntry,
  type ComfyGalleryJobStatus,
} from './comfyui-gallery';
import { formatComfyUiJobStatusLine, type ComfyUiJobTrackerState } from './comfyui-job-status';
import { notifyComfyJobComplete } from './comfyui-notifications';
import { resolveComfyUiRuntime } from './comfyui-runtime';
import { loadComfyUiSettings } from './comfyui-settings';
import { clearComfyLivePreviewUrl } from './comfyui-live-preview-store';
import { getEngineAdapter, getEngineAdapterById } from './engine';
import { isCloudEngine } from './engine/capabilities';
import type { EngineProgressSubscription } from './engine';
import { dispatchWebhook } from './webhook-settings';
import { noteScheduledBatchJobComplete } from './scheduled-batch-tracker';
import { noteJobCompletionEmail } from './job-completion-email';
import { autoTagGalleryEntry } from './gallery-auto-vision-tags';
import { backfillHistoryGalleryLink } from './prompt-lineage';
import { mapWithConcurrency } from './concurrency';
import {
  consumePendingRefineAfterUpscale,
  consumePendingSkinRefineAfterStill,
} from './gallery-pending-actions';
import type { WorkflowParamValues } from './comfyui-config';
import { buildGalleryImageUrlsFromQueueParams } from './queue-requeue-images';
import { freeComfyUiMemory } from './comfyui-queue-control';
import { normalizeQueueQualityProfile } from './queue-quality-profile';
import { loadSettingsCache } from './settings-cache';
import { getCharacter } from './character-os';
import { attemptGalleryHostFailover } from './oom-retry';
import { resolveGalleryRenderDurationMs } from './comfyui-render-duration';
import { forgetPendingGalleryPoll } from './gallery-pending-polls';
import { resolveGalleryCharacterStamp } from './gallery-character-stamp';

/** Cap stored workflow graphs so gallery IndexedDB stays bounded. */
export const MAX_GALLERY_WORKFLOW_CHARS = 400_000;

export type ClampGalleryWorkflowResult = {
  workflowJson?: string;
  omitted: boolean;
};

export function clampGalleryWorkflowJson(workflowJson?: string): string | undefined {
  return clampGalleryWorkflowJsonDetailed(workflowJson).workflowJson;
}

export function clampGalleryWorkflowJsonDetailed(
  workflowJson?: string
): ClampGalleryWorkflowResult {
  const trimmed = workflowJson?.trim();
  if (!trimmed) {
    return { omitted: false };
  }
  if (trimmed.length > MAX_GALLERY_WORKFLOW_CHARS) {
    return { omitted: true };
  }
  return { workflowJson: trimmed, omitted: false };
}

export type RegisterComfyGalleryJobInput = {
  promptId: string;
  prompt: string;
  negativePrompt?: string;
  tool?: string;
  model?: string;
  historyId?: string;
  parentGalleryEntryId?: string;
  characterId?: string;
  lookId?: string;
  derivedKind?: ComfyGalleryEntry['derivedKind'];
  queueParams?: WorkflowParamValues;
  /** Exact workflow JSON used at queue time (capped). */
  workflowJson?: string;
  sourceImageUrl?: string;
  maskImageUrl?: string;
  controlImageUrls?: string[];
  queueQualityProfile?: import('./queue-quality-profile').QueueQualityProfile;
  /** Session LoRA ids active at queue time (for re-edit same stack). */
  sessionActiveLoraIds?: string[];
  sessionLoraStrengthOverrides?: import('./lora-stack').SessionLoraStrengthOverrides;
  sessionEmbeddingTokens?: string[];
  projectId?: string;
  comfyUrl: string;
  /** Inference engine for this job (defaults to active adapter). */
  engineId?: ComfyGalleryEntry['engineId'];
  clientId?: string;
};

export type PollComfyGalleryJobOptions = {
  comfyUrl?: string;
  /** Must match the client_id used when the prompt was queued. */
  clientId?: string;
  maxAttempts?: number;
  intervalMs?: number;
  onJobUpdate?: (job: ComfyUiJobTrackerState) => void;
};

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_POLL_ATTEMPTS = 450;

/** Prompt IDs whose in-flight poll loop should stop on the next tick (e.g. cancelled jobs). */
const cancelledPollPromptIds = new Set<string>();

/** Marks an in-flight `pollComfyGalleryJob` loop for the given prompt to stop early. */
export function cancelComfyGalleryJobPoll(promptId: string): void {
  const trimmed = promptId.trim();
  if (trimmed) {
    cancelledPollPromptIds.add(trimmed);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function resolveComfyUrlForJob(promptId: string, comfyUrl?: string): string | undefined {
  return (
    comfyUrl?.trim().replace(/\/+$/, '') ||
    loadComfyGallery()
      .find(entry => entry.promptId === promptId)
      ?.comfyUrl?.trim()
      .replace(/\/+$/, '') ||
    resolveComfyUiRuntime()?.apiUrl?.trim().replace(/\/+$/, '')
  );
}

function resolveGalleryCharacterId(input: RegisterComfyGalleryJobInput): string | undefined {
  const parentId = input.parentGalleryEntryId?.trim();
  const parent = parentId ? loadComfyGallery().find(entry => entry.id === parentId) : undefined;
  return resolveGalleryCharacterStamp({
    characterId: input.characterId,
    parentCharacterId: parent?.characterId,
    activeCharacterId: loadSettingsCache().shared.activeCharacterId,
    tool: input.tool,
    derivedKind: input.derivedKind,
  });
}

function resolveGalleryLookId(input: RegisterComfyGalleryJobInput): string | undefined {
  const characterId = resolveGalleryCharacterId(input);
  if (!characterId) {
    return undefined;
  }
  const explicit = input.lookId?.trim();
  if (explicit) {
    return explicit;
  }
  const parentId = input.parentGalleryEntryId?.trim();
  const parent = parentId ? loadComfyGallery().find(entry => entry.id === parentId) : undefined;
  if (parent?.lookId?.trim()) {
    return parent.lookId.trim();
  }
  const shared = loadSettingsCache().shared;
  return (
    shared.activeLookId?.trim() || getCharacter(characterId)?.activeLookId?.trim() || undefined
  );
}

export function inheritGallerySessionFields(
  entry: Pick<
    ComfyGalleryEntry,
    'sessionActiveLoraIds' | 'sessionLoraStrengthOverrides' | 'sessionEmbeddingTokens'
  >
): Pick<
  RegisterComfyGalleryJobInput,
  'sessionActiveLoraIds' | 'sessionLoraStrengthOverrides' | 'sessionEmbeddingTokens'
> {
  return {
    ...(entry.sessionActiveLoraIds?.length
      ? { sessionActiveLoraIds: entry.sessionActiveLoraIds }
      : {}),
    ...(entry.sessionLoraStrengthOverrides &&
    Object.keys(entry.sessionLoraStrengthOverrides).length > 0
      ? { sessionLoraStrengthOverrides: entry.sessionLoraStrengthOverrides }
      : {}),
    ...(entry.sessionEmbeddingTokens?.length
      ? { sessionEmbeddingTokens: entry.sessionEmbeddingTokens }
      : {}),
  };
}

export function registerComfyGalleryJob(input: RegisterComfyGalleryJobInput): ComfyGalleryEntry {
  const imageUrls = buildGalleryImageUrlsFromQueueParams({
    comfyUrl: input.comfyUrl,
    queueParams: input.queueParams,
    sourceImageUrl: input.sourceImageUrl,
    maskImageUrl: input.maskImageUrl,
  });

  const clamped = clampGalleryWorkflowJsonDetailed(input.workflowJson);
  if (clamped.omitted && typeof window !== 'undefined') {
    void import('./app-toast').then(({ pushAppToast }) => {
      pushAppToast({
        text: 'Workflow graph too large to store — exact replay may need Comfy history.',
        tone: 'warning',
        ttlMs: 5000,
        href: '/gallery',
      });
    });
  }
  const entry = addComfyGalleryEntry({
    promptId: input.promptId,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    tool: input.tool,
    model: input.model,
    historyId: input.historyId,
    parentGalleryEntryId: input.parentGalleryEntryId,
    characterId: resolveGalleryCharacterId(input),
    lookId: resolveGalleryLookId(input),
    derivedKind: input.derivedKind,
    queueParams: input.queueParams,
    ...(clamped.workflowJson
      ? { workflowJson: clamped.workflowJson, hasStoredWorkflow: true }
      : {}),
    ...(clamped.omitted ? { workflowJsonOmitted: true } : {}),
    sourceImageUrl: imageUrls.sourceImageUrl,
    maskImageUrl: imageUrls.maskImageUrl,
    controlImageUrls: input.controlImageUrls?.length
      ? input.controlImageUrls
      : imageUrls.controlImageUrls,
    queueQualityProfile: input.queueQualityProfile,
    sessionActiveLoraIds: input.sessionActiveLoraIds,
    sessionLoraStrengthOverrides: input.sessionLoraStrengthOverrides,
    sessionEmbeddingTokens: input.sessionEmbeddingTokens,
    projectId: input.projectId,
    comfyUrl: input.comfyUrl,
    engineId: input.engineId ?? getEngineAdapter().id,
    clientId: input.clientId,
    status: 'pending',
    statusMessage: 'Queued',
  });
  backfillHistoryGalleryLink(entry);
  return entry;
}

/** Pure merge for history → gallery (import + upgrade thin duplicates). */
export function mergeHistoryImportItems(
  existing: ComfyGalleryEntry[],
  items: ComfyHistoryImportItem[],
  createId: () => string = () => crypto.randomUUID(),
  now: () => number = () => Date.now()
): {
  entries: ComfyGalleryEntry[];
  imported: number;
  upgraded: number;
  skipped: number;
} {
  const nextExisting = existing.map(entry => ({ ...entry }));
  const byPromptId = new Map(nextExisting.map(entry => [entry.promptId, entry]));
  const imported: ComfyGalleryEntry[] = [];
  let upgraded = 0;
  let skipped = 0;

  for (const item of items) {
    const prior = byPromptId.get(item.promptId);
    if (prior) {
      const needsParams = !prior.queueParams || Object.keys(prior.queueParams).length === 0;
      if (needsParams && item.queueParams && Object.keys(item.queueParams).length > 0) {
        prior.queueParams = item.queueParams;
        if (!prior.model?.trim() && item.model?.trim()) {
          prior.model = item.model;
        }
        if (!prior.negativePrompt?.trim() && item.negativePrompt?.trim()) {
          prior.negativePrompt = item.negativePrompt;
        }
        prior.statusMessage = item.statusMessage ?? prior.statusMessage;
        const clamped = clampGalleryWorkflowJsonDetailed(item.workflowJson);
        if (!prior.workflowJson?.trim() && clamped.workflowJson) {
          prior.workflowJson = clamped.workflowJson;
          prior.hasStoredWorkflow = true;
        }
        if (clamped.omitted) {
          prior.workflowJsonOmitted = true;
        }
        upgraded += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const clamped = clampGalleryWorkflowJsonDetailed(item.workflowJson);
    const entry: ComfyGalleryEntry = {
      id: createId(),
      promptId: item.promptId,
      prompt: item.prompt,
      negativePrompt: item.negativePrompt,
      model: item.model,
      tool: 'comfyui-import',
      comfyUrl: item.comfyUrl,
      status: 'completed',
      statusMessage: item.statusMessage ?? 'Imported from ComfyUI history',
      queuedAt: item.executionStartedAt ?? now(),
      completedAt:
        item.executionStartedAt != null && item.renderDurationMs != null
          ? item.executionStartedAt + item.renderDurationMs
          : now(),
      ...(item.renderDurationMs != null ? { renderDurationMs: item.renderDurationMs } : {}),
      ...(item.executionStartedAt != null ? { executionStartedAt: item.executionStartedAt } : {}),
      images: item.images,
      queueParams: item.queueParams,
      ...(clamped.workflowJson
        ? { workflowJson: clamped.workflowJson, hasStoredWorkflow: true }
        : {}),
      ...(clamped.omitted ? { workflowJsonOmitted: true } : {}),
    };
    imported.push(entry);
    byPromptId.set(item.promptId, entry);
  }

  return {
    entries: [...imported, ...nextExisting],
    imported: imported.length,
    upgraded,
    skipped,
  };
}

export function importComfyGalleryFromHistory(items: ComfyHistoryImportItem[]): {
  imported: number;
  upgraded: number;
  skipped: number;
} {
  const existing = loadComfyGallery();
  const merged = mergeHistoryImportItems(existing, items);
  if (merged.imported > 0 || merged.upgraded > 0) {
    saveComfyGallery(merged.entries);
  }
  return {
    imported: merged.imported,
    upgraded: merged.upgraded,
    skipped: merged.skipped,
  };
}

export async function fetchComfyJobImportItem(
  promptId: string,
  comfyUrl?: string
): Promise<ComfyHistoryImportItem | null> {
  const params = new URLSearchParams({ promptId });
  if (comfyUrl?.trim()) {
    params.set('comfyUrl', comfyUrl.trim());
  }
  const response = await fetch(`/api/comfyui/jobs?${params.toString()}`);
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { item?: ComfyHistoryImportItem | null };
  return data.item ?? null;
}

/** Pull a Comfy-side job that is not in this gallery into Gallery and start polling if needed. */
export async function claimOrphanComfyJob(input: {
  promptId: string;
  status?: string;
  comfyUrl?: string;
}): Promise<{ ok: boolean; imported: number; message: string }> {
  const promptId = input.promptId.trim();
  if (!promptId) {
    return { ok: false, imported: 0, message: 'Missing prompt id.' };
  }
  const existing = loadComfyGallery().find(entry => entry.promptId === promptId);
  if (existing) {
    return { ok: true, imported: 0, message: 'Already in gallery.' };
  }

  const comfyUrl =
    input.comfyUrl?.trim() || resolveComfyUiRuntime()?.apiUrl?.trim() || 'http://127.0.0.1:8188';
  const item = await fetchComfyJobImportItem(promptId, comfyUrl);
  if (item?.images?.length) {
    const result = importComfyGalleryFromHistory([item]);
    return {
      ok: result.imported > 0 || result.upgraded > 0,
      imported: result.imported,
      message:
        result.imported > 0
          ? 'Imported into gallery.'
          : result.upgraded > 0
            ? 'Updated existing gallery row.'
            : 'Already in gallery.',
    };
  }

  registerComfyGalleryJob({
    promptId,
    prompt: item?.prompt?.trim() || `Host job ${promptId.slice(0, 8)}`,
    negativePrompt: item?.negativePrompt,
    model: item?.model,
    queueParams: item?.queueParams,
    workflowJson: item?.workflowJson,
    comfyUrl,
    tool: 'comfyui-import',
  });
  const { scheduleComfyGalleryPoll } = await import('./comfyui-gallery-poller');
  void scheduleComfyGalleryPoll(promptId, { comfyUrl });
  return { ok: true, imported: 1, message: 'Claimed. Tracking in gallery.' };
}

export async function claimOrphanComfyJobs(
  jobs: Array<{ promptId: string; status?: string; comfyUrl?: string }>
): Promise<{ imported: number; skipped: number; failed: number; message: string }> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  // Each job is claimed independently — was previously one HTTP round-trip at a time via
  // "Claim all host jobs". registerComfyGalleryJob() (called inside claimOrphanComfyJob) is
  // synchronous, so running these concurrently doesn't introduce a read-modify-write race on
  // the gallery store.
  const results = await mapWithConcurrency(jobs, 6, job => claimOrphanComfyJob(job));
  for (const result of results) {
    if (!result.ok) {
      failed += 1;
    } else if (result.imported === 0) {
      skipped += 1;
    } else {
      imported += result.imported;
    }
  }
  const parts = [
    imported > 0 ? `Imported ${imported}` : '',
    skipped > 0 ? `skipped ${skipped}` : '',
    failed > 0 ? `${failed} failed` : '',
  ].filter(Boolean);
  return {
    imported,
    skipped,
    failed,
    message: parts.length > 0 ? `${parts.join(', ')}.` : 'Nothing to import.',
  };
}

export function dedupeHistoryImportItems(
  items: ComfyHistoryImportItem[]
): ComfyHistoryImportItem[] {
  const seen = new Set<string>();
  const unique: ComfyHistoryImportItem[] = [];
  for (const item of items) {
    const id = item.promptId.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    unique.push(item);
  }
  return unique;
}

export async function importCompletedHostJobs(
  limit = 40,
  comfyUrl?: string
): Promise<{ imported: number; upgraded: number; skipped: number; hosts: number }> {
  const { listHealComfyUrls } = await import('./comfyui-manager-install-client');
  const urls = await listHealComfyUrls(comfyUrl);
  const targets = urls.length > 0 ? urls : [comfyUrl?.trim() || ''];
  // Each pool host's history is fetched independently — was previously one at a time, so a
  // single slow/dead host in the pool serialized behind every other host's request too.
  const batches = await mapWithConcurrency(targets, 6, async url => {
    try {
      const payload = await fetchComfyHistoryImports(limit, url || undefined);
      return payload.items ?? [];
    } catch {
      // Skip a dead pool member; others can still import.
      return [];
    }
  });
  const items: ComfyHistoryImportItem[] = batches.flat();
  const result = importComfyGalleryFromHistory(dedupeHistoryImportItems(items).slice(0, 80));
  return { ...result, hosts: urls.length || (comfyUrl?.trim() ? 1 : 0) };
}

export async function fetchComfyHistoryImports(limit = 40, comfyUrl?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  const sticky = comfyUrl?.trim();
  if (sticky) {
    params.set('comfyUrl', sticky);
  }
  const response = await fetch(`/api/comfyui/history?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Could not load ComfyUI history.');
  }
  return (await response.json()) as {
    items: ComfyHistoryImportItem[];
    count: number;
    comfyUrl?: string;
  };
}

type ComfyJobStatusPayload = {
  status?: string;
  statusMessage?: string;
  comfyUrl?: string;
  queuePosition?: number | null;
  images?: ComfyGalleryEntry['images'];
  renderDurationMs?: number;
  executionStartedAt?: number;
};

function isUsableJobStatus(status: ComfyJobStatusPayload | null | undefined): boolean {
  return (
    status?.status === 'pending' ||
    status?.status === 'running' ||
    status?.status === 'completed' ||
    status?.status === 'error'
  );
}

export async function fetchComfyJobStatus(promptId: string, comfyUrl?: string) {
  const params = new URLSearchParams({ promptId });
  const resolvedUrl = resolveComfyUrlForJob(promptId, comfyUrl);
  if (resolvedUrl) {
    params.set('comfyUrl', resolvedUrl);
  }

  try {
    const jobsResponse = await fetch(`/api/comfyui/jobs?${params.toString()}`);
    if (jobsResponse.ok) {
      const data = (await jobsResponse.json()) as {
        status?: ComfyJobStatusPayload | null;
        item?: ComfyHistoryImportItem | null;
      };
      const fromJobs = data.status ?? null;
      if (isUsableJobStatus(fromJobs)) {
        if (
          fromJobs?.status === 'completed' &&
          !(fromJobs.images && fromJobs.images.length > 0) &&
          data.item?.images?.length
        ) {
          return {
            ...fromJobs,
            images: data.item.images,
            statusMessage: data.item.statusMessage ?? fromJobs.statusMessage,
          };
        }
        return fromJobs;
      }
      if (data.item?.images?.length) {
        return {
          status: 'completed',
          statusMessage: data.item.statusMessage,
          comfyUrl: data.item.comfyUrl,
          images: data.item.images,
          renderDurationMs: data.item.renderDurationMs,
          executionStartedAt: data.item.executionStartedAt,
        } satisfies ComfyJobStatusPayload;
      }
    }
  } catch {
    // Fall through to /status (history).
  }

  const response = await fetch(`/api/comfyui/status?${params.toString()}`);
  if (!response.ok) {
    return null;
  }

  return (await response.json()) as ComfyJobStatusPayload;
}

function normalizeTrackerStatus(status: string | undefined): ComfyGalleryJobStatus | null {
  if (
    status === 'pending' ||
    status === 'running' ||
    status === 'completed' ||
    status === 'error'
  ) {
    return status;
  }

  return null;
}

function buildTrackerState(
  promptId: string,
  status: NonNullable<Awaited<ReturnType<typeof fetchComfyJobStatus>>>
): ComfyUiJobTrackerState | null {
  const normalized = normalizeTrackerStatus(status.status);
  if (!normalized) {
    return null;
  }

  return {
    promptId,
    status: normalized,
    statusMessage: status.statusMessage,
    comfyUrl: status.comfyUrl,
    queuePosition: status.queuePosition,
    imageCount: status.images?.length,
  };
}

function applyComfyJobStatus(
  promptId: string,
  status: NonNullable<Awaited<ReturnType<typeof fetchComfyJobStatus>>>,
  onStatus?: (message: string) => void,
  onJobUpdate?: (job: ComfyUiJobTrackerState) => void
): ComfyGalleryEntry | null {
  const tracker = buildTrackerState(promptId, status);
  if (!tracker) {
    return null;
  }

  onJobUpdate?.(tracker);
  onStatus?.(formatComfyUiJobStatusLine(tracker));

  if (tracker.status === 'running' || tracker.status === 'pending') {
    updateComfyGalleryByPromptId(promptId, {
      status: tracker.status,
      statusMessage: tracker.statusMessage,
      queuePosition: tracker.queuePosition,
      comfyUrl: tracker.comfyUrl,
    });
    return null;
  }

  if (tracker.status === 'error') {
    // Drop resume metadata before gallery save (save can re-trigger resume).
    forgetPendingGalleryPoll(promptId);
    clearComfyLivePreviewUrl(promptId);
    const completedAt = Date.now();
    const prior = loadComfyGallery().find(item => item.promptId === promptId);
    const renderDurationMs = resolveGalleryRenderDurationMs({
      renderDurationMs: status.renderDurationMs,
      queuedAt: prior?.queuedAt,
      completedAt,
    });
    const entry = updateComfyGalleryByPromptId(promptId, {
      status: 'error',
      statusMessage: tracker.statusMessage,
      queuePosition: null,
      progressValue: undefined,
      progressMax: undefined,
      progressNode: undefined,
      completedAt,
      ...(status.executionStartedAt != null
        ? { executionStartedAt: status.executionStartedAt }
        : {}),
      ...(renderDurationMs != null ? { renderDurationMs } : {}),
      comfyUrl: tracker.comfyUrl,
    });
    if (entry) {
      noteJobCompletionEmail({
        promptId,
        status: 'error',
        prompt: entry.prompt,
      });
      void dispatchWebhook({
        event: 'comfyui.job.error',
        promptId,
        prompt: entry.prompt,
        negativePrompt: entry.negativePrompt,
        model: entry.model,
        tool: entry.tool,
        status: entry.status,
        completedAt: Date.now(),
      });
      // Best-effort — never blocks the error path or surfaces failures to the user.
      void attemptGalleryHostFailover(entry, tracker.statusMessage, onStatus);
    }
    return entry;
  }

  clearComfyLivePreviewUrl(promptId);
  const completedAt = Date.now();
  const priorCompleted = loadComfyGallery().find(item => item.promptId === promptId);
  const hasImages = Boolean(status.images && status.images.length > 0);
  // Jobs can report completed before history writes filenames — keep polling briefly.
  if (!hasImages) {
    updateComfyGalleryByPromptId(promptId, {
      status: 'running',
      statusMessage: 'Job finished — waiting for output files…',
      queuePosition: null,
      comfyUrl: tracker.comfyUrl,
    });
    onStatus?.('Job finished — waiting for output files…');
    return null;
  }
  const renderDurationMs = resolveGalleryRenderDurationMs({
    renderDurationMs: status.renderDurationMs,
    queuedAt: priorCompleted?.queuedAt,
    completedAt,
  });
  const entry = updateComfyGalleryByPromptId(promptId, {
    status: 'completed',
    statusMessage: tracker.statusMessage,
    queuePosition: null,
    progressValue: undefined,
    progressMax: undefined,
    progressNode: undefined,
    completedAt,
    ...(status.executionStartedAt != null ? { executionStartedAt: status.executionStartedAt } : {}),
    ...(renderDurationMs != null ? { renderDurationMs } : {}),
    comfyUrl: tracker.comfyUrl,
    images: status.images ?? [],
  });
  if (entry && loadComfyUiSettings().notifyOnComplete) {
    notifyComfyJobComplete(entry);
  }
  if (entry?.status === 'completed') {
    backfillHistoryGalleryLink(entry);
    noteJobCompletionEmail({
      promptId,
      status: 'completed',
      prompt: entry.prompt,
    });
    const shouldParkComfy =
      !isCloudEngine(entry.engineId) &&
      (entry.engineId === 'diffusers' ||
        (loadSettingsCache().shared.freeVramAfterMax === true &&
          normalizeQueueQualityProfile(entry.queueQualityProfile) === 'max'));
    if (shouldParkComfy) {
      // Best-effort — never blocks the completion path. Diffusers jobs park
      // Comfy on the default Comfy host (entry.comfyUrl is the Diffusers URL).
      void freeComfyUiMemory(entry.engineId === 'diffusers' ? undefined : entry.comfyUrl);
    }
    void autoTagGalleryEntry(entry);
    // Best-effort: pull every output in this job (image or video, any engine)
    // into durable storage — including every frame of a multi-image batch,
    // not just the first — so the gallery still has it once the source
    // engine cleans up its own output history. See gallery-media-client.ts.
    void import('./gallery-media-client').then(({ persistGalleryMedia }) => {
      void persistGalleryMedia(entry).then(result => {
        if (!result) {
          return;
        }
        const patch: Partial<ComfyGalleryEntry> = {
          durableThumbPaths: result.thumbPaths,
          durableOriginalPaths: result.originalPaths,
        };
        // Legacy single-value fields always mirror index 0 — several
        // single-image call sites (uploads, film assembly, requeue-from)
        // still read these directly instead of the arrays above.
        if (result.thumbPaths[0]) {
          patch.durableThumbPath = result.thumbPaths[0];
        }
        if (result.originalPaths[0]) {
          patch.durableOriginalPath = result.originalPaths[0];
        }
        updateComfyGalleryEntryById(entry.id, patch);
      });
    });
    noteScheduledBatchJobComplete(entry.tool);
    void dispatchWebhook({
      event: 'comfyui.job.completed',
      promptId,
      prompt: entry.prompt,
      negativePrompt: entry.negativePrompt,
      model: entry.model,
      tool: entry.tool,
      status: entry.status,
      imageCount: entry.images.length,
      queueParams: entry.queueParams,
      completedAt: entry.completedAt ?? Date.now(),
    });

    // Simple-mode first completed render (success metric beyond queue accept).
    void import('./workspace-mode').then(({ isLeanWorkspaceMode, loadWorkspaceMode }) => {
      if (!isLeanWorkspaceMode(loadWorkspaceMode())) {
        return;
      }
      void import('./onboarding-hooks').then(({ markOnboardingFirstQueueSuccess }) => {
        const first = markOnboardingFirstQueueSuccess();
        if (!first) {
          return;
        }
        void import('./local-observability').then(({ noteFirstQueueSuccessMetric }) => {
          noteFirstQueueSuccessMetric();
        });
        void import('./first-queue-setup').then(({ dismissFirstQueueSetupModal }) => {
          dismissFirstQueueSetupModal();
        });
        // Tray + notification survive muted toasts (pushAppToast no-ops when toasts are off).
        void import('./notification-center').then(({ pushNotification }) => {
          pushNotification({
            title: 'First render complete',
            body: 'Rate it in Gallery review next.',
            href: '/gallery?review=1',
            kind: 'job',
          });
        });
        void import('./system-tray-celebrate').then(({ celebrateSystemTray }) => {
          celebrateSystemTray('job');
        });
        void import('./app-toast').then(({ pushAppToast }) => {
          pushAppToast({
            text: 'First render complete — rate it in Gallery next.',
            tone: 'success',
            ttlMs: 7000,
            href: '/gallery?review=1',
          });
        });
      });
    });

    const pendingRefine = consumePendingRefineAfterUpscale(promptId);
    if (pendingRefine && entry.derivedKind === 'upscale') {
      void import('./comfyui-requeue').then(({ requeueRefineFromGalleryEntry }) =>
        requeueRefineFromGalleryEntry(entry, {
          qualityProfile: pendingRefine.qualityProfile,
          onStatus,
        })
      );
    }

    const pendingSkin = consumePendingSkinRefineAfterStill(promptId);
    if (pendingSkin) {
      void import('./comfyui-requeue').then(({ requeueSkinRefineFromGalleryEntry }) =>
        requeueSkinRefineFromGalleryEntry(entry, {
          model: pendingSkin.model,
          qualityProfile: 'final',
          onStatus,
        })
      );
    }
  }
  return entry;
}

export async function pollComfyGalleryJob(
  promptId: string,
  onStatus?: (message: string) => void,
  options?: PollComfyGalleryJobOptions
): Promise<ComfyGalleryEntry | null> {
  const galleryEntry = loadComfyGallery().find(entry => entry.promptId === promptId);
  const engine = getEngineAdapterById(galleryEntry?.engineId ?? getEngineAdapter().id);
  const comfyUrl = resolveComfyUrlForJob(promptId, options?.comfyUrl);
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
  const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const onJobUpdate = options?.onJobUpdate;
  const settings = loadComfyUiSettings();
  let wsFinished = false;
  let wsSubscription: EngineProgressSubscription | undefined;
  let lastProgressWriteAt = 0;
  let trailingProgressTimer: number | null = null;
  let latestProgress: {
    value?: number;
    max?: number;
    node?: string | null;
    message?: string;
  } | null = null;

  const clearTrailingProgress = () => {
    if (trailingProgressTimer != null) {
      window.clearTimeout(trailingProgressTimer);
      trailingProgressTimer = null;
    }
  };

  const publishProgress = (force = false) => {
    if (!latestProgress) {
      return;
    }
    const now = Date.now();
    if (!force && now - lastProgressWriteAt < 250) {
      if (trailingProgressTimer == null) {
        trailingProgressTimer = window.setTimeout(() => {
          trailingProgressTimer = null;
          publishProgress(true);
        }, 250);
      }
      return;
    }

    lastProgressWriteAt = now;
    clearTrailingProgress();

    const tracker: ComfyUiJobTrackerState = {
      promptId,
      status: 'running',
      statusMessage: latestProgress.message ?? 'Running in ComfyUI',
      comfyUrl,
      queuePosition: 0,
      progressValue: latestProgress.value,
      progressMax: latestProgress.max,
      progressNode: latestProgress.node,
    };
    onJobUpdate?.(tracker);
    onStatus?.(formatComfyUiJobStatusLine(tracker));
    updateComfyGalleryByPromptId(promptId, {
      status: 'running',
      statusMessage: tracker.statusMessage,
      queuePosition: 0,
      progressValue: tracker.progressValue,
      progressMax: tracker.progressMax,
      progressNode: tracker.progressNode,
      comfyUrl,
    });
  };

  // Prefer explicit option, then gallery entry — must match /prompt client_id.
  if (settings.useWebSocketProgress !== false && comfyUrl) {
    const clientId =
      options?.clientId?.trim() ||
      loadComfyGallery()
        .find(entry => entry.promptId === promptId)
        ?.clientId?.trim();
    wsSubscription = engine.subscribeProgress({
      // Live bridge resolves Comfy server-side; pass entry URL only as a hint.
      engineUrl: comfyUrl,
      promptId,
      clientId,
      onProgress: progress => {
        if (progress.status === 'preview' && progress.previewUrl) {
          // Type-4 frames carry prompt_id; ignore frames for other jobs on a shared socket.
          if (
            progress.promptId &&
            progress.promptId !== promptId &&
            progress.promptId !== clientId
          ) {
            return;
          }
          // Preview bytes are already in the live-preview store from the bridge client.
          const tracker: ComfyUiJobTrackerState = {
            promptId,
            status: 'running',
            statusMessage: latestProgress?.message ?? 'Live preview',
            comfyUrl,
            queuePosition: 0,
            progressValue: latestProgress?.value,
            progressMax: latestProgress?.max,
            progressNode: latestProgress?.node,
            previewUrl: progress.previewUrl,
          };
          onJobUpdate?.(tracker);
          return;
        }

        if (progress.status === 'finished') {
          wsFinished = true;
          clearTrailingProgress();
          if (progress.message) {
            onStatus?.(progress.message);
          }
          return;
        }

        if (progress.status === 'error') {
          clearTrailingProgress();
          wsFinished = true;
          applyComfyJobStatus(
            promptId,
            {
              status: 'error',
              statusMessage: progress.message ?? 'Diffusers job failed.',
              comfyUrl,
            },
            onStatus,
            onJobUpdate
          );
          return;
        }

        latestProgress = {
          value: progress.value ?? latestProgress?.value,
          max: progress.max ?? latestProgress?.max,
          node: progress.node !== undefined ? progress.node : latestProgress?.node,
          message: progress.message ?? latestProgress?.message,
        };
        publishProgress();
      },
    });
  }

  let cancelled = false;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (cancelledPollPromptIds.has(promptId)) {
        cancelled = true;
        break;
      }

      if (attempt > 0) {
        await sleep(wsFinished ? 250 : intervalMs);
        if (cancelledPollPromptIds.has(promptId)) {
          cancelled = true;
          break;
        }
      }

      try {
        const engineStatus = await engine.fetchJobStatus(promptId, comfyUrl);
        if (!engineStatus) {
          continue;
        }

        const status = {
          status: engineStatus.status,
          statusMessage: engineStatus.statusMessage,
          comfyUrl: engineStatus.engineUrl || comfyUrl,
          queuePosition: engineStatus.queuePosition,
          images: engineStatus.images,
          renderDurationMs: engineStatus.renderDurationMs,
          executionStartedAt: engineStatus.executionStartedAt,
        };

        const entry = applyComfyJobStatus(promptId, status, onStatus, onJobUpdate);
        if (entry) {
          return entry;
        }
        // Lost Diffusers/Comfy jobs must not spin until maxAttempts.
        if (
          engineStatus.status === 'error' &&
          /not found|unknown prompt|engine restarted|id lost/i.test(
            engineStatus.statusMessage ?? ''
          )
        ) {
          forgetPendingGalleryPoll(promptId);
          return (
            updateComfyGalleryByPromptId(promptId, {
              status: 'error',
              statusMessage: engineStatus.statusMessage ?? 'Job not found (engine restarted).',
              queuePosition: null,
              comfyUrl: engineStatus.engineUrl || comfyUrl,
            }) ?? null
          );
        }
      } catch {
        // keep polling
      }
    }
  } finally {
    clearTrailingProgress();
    wsSubscription?.close();
    cancelledPollPromptIds.delete(promptId);
  }

  if (cancelled) {
    return null;
  }

  // Final history reconciliation before giving up — catches long Max jobs and WS races.
  try {
    const reconciled = await engine.fetchJobStatus(promptId, comfyUrl);
    if (reconciled) {
      const status = {
        status: reconciled.status,
        statusMessage: reconciled.statusMessage,
        comfyUrl: reconciled.engineUrl || comfyUrl,
        queuePosition: reconciled.queuePosition,
        images: reconciled.images,
        renderDurationMs: reconciled.renderDurationMs,
        executionStartedAt: reconciled.executionStartedAt,
      };
      const entry = applyComfyJobStatus(promptId, status, onStatus, onJobUpdate);
      if (entry) {
        return entry;
      }
      if (reconciled.status === 'completed' && reconciled.images && reconciled.images.length > 0) {
        return (
          updateComfyGalleryByPromptId(promptId, {
            status: 'completed',
            statusMessage: reconciled.statusMessage ?? 'Completed',
            images: reconciled.images,
            queuePosition: null,
            comfyUrl: reconciled.engineUrl || comfyUrl,
            completedAt: Date.now(),
          }) ?? null
        );
      }
    }
  } catch {
    // Fall through to timed-out error.
  }

  forgetPendingGalleryPoll(promptId);
  return updateComfyGalleryByPromptId(promptId, {
    status: 'error',
    statusMessage:
      'Timed out waiting for ComfyUI — open Queue to claim orphans or import history, or run Heal & ready if the host restarted.',
    queuePosition: null,
    comfyUrl,
  });
}
