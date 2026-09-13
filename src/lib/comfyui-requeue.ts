'use client';

import type { ComfyImageModel } from './comfy-models/client';
import { registerComfyGalleryJob, inheritGallerySessionFields } from './comfyui-gallery-client';
import { scheduleComfyGalleryPoll } from './comfyui-gallery-poller';
import { getEngineAdapter, getEngineAdapterById } from './engine';
import { cloudEngineHost, engineDisplayName, isCloudEngine } from './engine/capabilities';
import { resolveCloudQueueExtras, resolveCloudQueueModel } from './engine-settings';
import { inferVideoClipMode } from './video-clip-mode';
import { scheduleRefineAfterUpscaleComplete } from './gallery-pending-actions';
import {
  resolveWorkflowGraphEnrichOptions,
  type ComfyUiRuntimeConfig,
  type WorkflowParamValues,
} from './comfyui-config';
import { resolveQueueInputImageFilename } from './queue-input-image';
import { resolveRuntimeForQueue } from './comfyui-runtime-for-model';
import {
  profileSkipsOutputUpscaleForModel,
  type QueueQualityProfile,
} from './queue-quality-profile';
import { resolveComfyUiRuntime } from './comfyui-runtime';
import { resolveQueueNegativePrompt } from './queue-negative';
import { resolveQueueParams } from './queue-params-settings';
import {
  refreshQueueImageParamsForRequeue,
  resolveRequeueImageUrlsFromEntry,
  auditRequeueImageReadiness,
} from './queue-requeue-images';
import type { ComfyGalleryEntry } from './comfyui-gallery';
import { findGalleryEntryForHistory } from './prompt-lineage';
import { runWorkflowPreflight } from './workflow-preflight';
import {
  buildGalleryMoireCleanWorkflow,
  buildGalleryUpscaleWorkflow,
  GalleryUpscaleBuildError,
  resolveGalleryOutputImageUrl,
  resolveGalleryOutputImageUrls,
} from './gallery-output-upscale';
import { isFluxFineTuneCheckpointModel } from './model-checkpoint-map';
import { isQwenLightningModel } from './model-sampling-patch';
import { isQwenRapidAioModel } from './model-denoise-defaults';
import {
  appendPortraitRefineNegative,
  buildGalleryRefineWorkflow,
  galleryRefineQueueParams,
  type GalleryRefineMode,
} from './gallery-output-refine';
import {
  findLibraryUpscaleWorkflowForModel,
  libraryUpscaleWorkflowEnlarges,
} from './workflow-library-upscale';
import { findLibraryFaceDetailerWorkflow } from './workflow-library-face-detailer';
import { buildAutoFaceDetailerWorkflow } from './facedetailer-workflow-patch';
import {
  faceDetailCustomTokens,
  faceDetailQueueParams,
  normalizeFaceDetailDenoise,
} from './gallery-output-face-detail';
import { isUpscaleModelInstalled, resolveUpscaleModelFilename } from './model-upscale-map';
import {
  fetchComfyObjectInfoCached,
  fetchComfyObjectInfoNodeTypesCached,
} from './comfyui-object-info-cache';
import { loadSettingsCache } from './settings-cache';
import {
  loadComfyUiSettings,
  mergeLoraLibraryIntoCustomTokens,
  resolveSharedEffectiveSessionLoraIds,
} from './comfyui-settings';
import {
  fetchComfyQueueIdle,
  holdMaxGalleryEnhance,
  holdMaxGenerateJob,
  shouldHoldMaxUntilIdle,
} from './held-max-queue';
import {
  fetchComfyVramSnapshot,
  guardQueueQualityForVram,
  maybeDowngradeMaxForVram,
} from './vram-queue-guard';
import {
  canMoireCleanGalleryEntry,
  canRefineGalleryEntry,
  canUpscaleGalleryEntry,
  galleryEntryAlreadyEnrichedForUpscale,
} from './gallery-entry-actions';

export {
  canFaceDetailGalleryEntry,
  canMoireCleanGalleryEntry,
  canRefineGalleryEntry,
  canSoftSecondPassGalleryEntry,
  canUpscaleGalleryEntry,
  galleryEntryAlreadyEnrichedForUpscale,
  galleryEntryIsFinalToMaxBump,
  galleryEntrySupportsFaceDetail,
  galleryEntrySupportsMoireClean,
  galleryEntrySupportsRefine,
  galleryEntrySupportsSoftSecondPass,
  galleryEntrySupportsUpscale,
} from './gallery-entry-actions';

type WorkflowPreviewResponse = {
  ok: boolean;
  replacements?: {
    positive: number;
    negative: number;
    params: Record<string, number>;
    custom?: Record<string, number>;
  };
  resolvedParams?: {
    seed: string;
    width: string;
    height: string;
    cfg: string;
    steps: string;
  };
  snippets?: Array<{ path: string; value: string }>;
  workflowJson?: string;
  truncated?: boolean;
  preflightIssues?: Array<{ severity: 'error' | 'warn'; message: string }>;
};

export type RequeueComfyJobInput = {
  prompt: string;
  negativePrompt?: string;
  tool?: string;
  model?: string;
  hints?: string;
  /** When true, override seed with a new random value for this job. */
  newSeed?: boolean;
  /** Recover width/steps/cfg from a prior gallery job when re-queueing. */
  queueParams?: WorkflowParamValues;
  /** Source image URL — re-uploaded for edit/img2img/inpaint workflows before queue. */
  sourceImageUrl?: string;
  /** Inpaint mask URL — re-uploaded when present. */
  maskImageUrl?: string;
  /** Override queue quality profile for this re-queue (draft / final / max). */
  qualityProfile?: QueueQualityProfile;
  /** Prior job quality profile — used when qualityProfile override is not set. */
  storedQualityProfile?: QueueQualityProfile;
  /** Gallery entry this re-queue derives from. */
  parentGalleryEntryId?: string;
  derivedKind?: ComfyGalleryEntry['derivedKind'];
  /** Upload sourceImageUrl even when the model/tool is normally text-to-image. */
  forceInputImage?: boolean;
  /** Force a specific ComfyUI endpoint for this re-queue (e.g. pool failover on OOM). */
  comfyUrlOverride?: string;
  /**
   * Exact API workflow graph (e.g. from PNG/Comfy history). When set, queues with
   * directWorkflowPatching instead of rebuilding from the library template.
   */
  workflowJson?: string;
  /**
   * LoRA library ids to restore for this re-queue (from the gallery entry).
   * When omitted, falls back to the current Shared stack for the entry model.
   */
  sessionActiveLoraIds?: string[];
  onStatus?: (message: string) => void;
};

/** Prefer LoRAs recorded on the gallery entry; else the current stack for that model. */
export function resolveRequeueSessionLoraIds(
  entry: Pick<ComfyGalleryEntry, 'sessionActiveLoraIds' | 'model'>
): string[] | undefined {
  if (entry.sessionActiveLoraIds !== undefined) {
    return entry.sessionActiveLoraIds;
  }
  return resolveSharedEffectiveSessionLoraIds(entry.model);
}

export type RequeueComfyJobResult = {
  ok: boolean;
  promptId?: string;
  error?: string;
  comfyUrl?: string;
  /** Max job parked until ComfyUI queue is idle. */
  held?: boolean;
  vramDowngraded?: boolean;
};

async function resolveEnhanceQualityProfile(input: {
  entry: Pick<ComfyGalleryEntry, 'id' | 'model' | 'tool' | 'comfyUrl'>;
  qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'>;
  kind: 'upscale' | 'moire' | 'refine';
  force?: boolean;
  onStatus?: (message: string) => void;
}): Promise<
  | { action: 'hold' }
  | {
      action: 'queue';
      qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'>;
      vramDowngraded: boolean;
    }
> {
  let qualityProfile = input.qualityProfile;
  if (qualityProfile === 'max' && !input.force) {
    const shared = loadSettingsCache().shared;
    if (shared.holdMaxUntilIdle) {
      const idle = await fetchComfyQueueIdle();
      if (!idle) {
        holdMaxGalleryEnhance({
          entry: input.entry,
          kind: input.kind,
          qualityProfile: 'max',
        });
        input.onStatus?.('Max held until ComfyUI queue is idle (Queue → Orchestration).');
        return { action: 'hold' };
      }
    }
  }
  // Always re-check VRAM for Max (including force flush) — hold bypass stays force-only.
  if (qualityProfile === 'max') {
    const vram = await fetchComfyVramSnapshot(input.entry.comfyUrl);
    const guard = maybeDowngradeMaxForVram(qualityProfile, vram);
    if (guard.downgraded) {
      qualityProfile = 'final';
      input.onStatus?.('Max → Final (VRAM) — free VRAM under 6 GB.');
    }
    return {
      action: 'queue',
      qualityProfile,
      vramDowngraded: guard.downgraded,
    };
  }
  return { action: 'queue', qualityProfile, vramDowngraded: false };
}

export function requeueSourceImageUrlFromEntry(
  entry: Pick<
    ComfyGalleryEntry,
    'comfyUrl' | 'images' | 'tool' | 'model' | 'queueParams' | 'sourceImageUrl' | 'maskImageUrl'
  >
): string | undefined {
  return resolveRequeueImageUrlsFromEntry(entry).sourceImageUrl;
}

export async function requeueUpscaleFromGalleryEntry(
  entry: ComfyGalleryEntry,
  options: {
    qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'>;
    onStatus?: (message: string) => void;
    /** Queue low-denoise refine after upscale completes (uses upscaled output). */
    refineAfterComplete?: Extract<QueueQualityProfile, 'final' | 'max'>;
    /** Bypass keeper skip (manual force re-upscale). */
    force?: boolean;
  }
): Promise<RequeueComfyJobResult> {
  const model = (entry.model ?? 'qwen-image-2512') as ComfyImageModel;

  const resolved = await resolveEnhanceQualityProfile({
    entry,
    qualityProfile: options.qualityProfile,
    kind: 'upscale',
    force: options.force,
    onStatus: options.onStatus,
  });
  if (resolved.action === 'hold') {
    return { ok: true, held: true };
  }
  const qualityProfile = resolved.qualityProfile;
  const vramDowngraded = resolved.vramDowngraded;

  if (!options.force && galleryEntryAlreadyEnrichedForUpscale(entry, qualityProfile)) {
    return {
      ok: false,
      error: 'Already Final/Max enriched — skip re-upscale (use Draft source or a new seed).',
    };
  }

  // Rapid AIO: Lanczos/neural re-amplifies moiré — use the polish chain instead.
  if (isQwenRapidAioModel(model)) {
    options.onStatus?.(`Rapid AIO skips upscale — queueing moiré clean (${qualityProfile})…`);
    return requeueMoireCleanFromGalleryEntry(entry, {
      qualityProfile,
      onStatus: options.onStatus,
      force: options.force,
    });
  }

  if (isQwenLightningModel(model)) {
    return {
      ok: false,
      error:
        'Upscale is disabled for Lightning (pass-through only). Use Re-queue (new seed) with Final/Max quality instead.',
    };
  }

  if (profileSkipsOutputUpscaleForModel(qualityProfile, { model })) {
    if (isFluxFineTuneCheckpointModel(model) && vramDowngraded) {
      return {
        ok: false,
        error:
          'Max → Final (VRAM); UltraReal Final stays native — free VRAM and retry Upscale → Max.',
        vramDowngraded: true,
      };
    }
    return {
      ok: false,
      error: `Upscale → ${qualityProfile} would not enlarge this model’s output (image-space enlarge is skipped).`,
      vramDowngraded,
    };
  }

  const outputUrls = resolveGalleryOutputImageUrls(entry);
  if (outputUrls.length === 0) {
    return { ok: false, error: 'No gallery output image available to upscale.' };
  }

  const shared = loadSettingsCache().shared;
  const settings = mergeLoraLibraryIntoCustomTokens(loadComfyUiSettings(), {
    activeOnly: true,
  });
  const isLightning = isQwenLightningModel(model);
  const mappedUpscale =
    !isLightning && (qualityProfile === 'final' || qualityProfile === 'max')
      ? resolveUpscaleModelFilename(model, {
          upscaleMap: shared.modelUpscaleMap,
          customTokens: settings.customTokens,
        })
      : undefined;

  const objectInfo = await fetchComfyObjectInfoCached({
    comfyUrl: entry.comfyUrl ?? resolveComfyUiRuntime()?.apiUrl,
  });
  const upscaleModelFilename =
    mappedUpscale && isUpscaleModelInstalled(mappedUpscale, objectInfo?.models.upscaleModels)
      ? mappedUpscale
      : undefined;
  if (mappedUpscale && !upscaleModelFilename) {
    options.onStatus?.(
      isFluxFineTuneCheckpointModel(model)
        ? `UltraReal neural “${mappedUpscale}” not installed — using mild Lanczos…`
        : `Neural upscaler “${mappedUpscale}” not installed — using Lanczos…`
    );
  } else if (isFluxFineTuneCheckpointModel(model) && !upscaleModelFilename) {
    options.onStatus?.('UltraReal Max — no neural upscaler mapped; using mild Lanczos…');
  }

  const baseRuntime = resolveRuntimeForQueue(model, entry.tool);
  const enrichOptions = resolveWorkflowGraphEnrichOptions(baseRuntime);

  const queueUpscaleForUrl = async (
    outputUrl: string,
    neuralModel: string | undefined,
    imageIndex: number,
    imageCount: number
  ): Promise<RequeueComfyJobResult> => {
    options.onStatus?.(
      imageCount > 1
        ? `Uploading gallery output ${imageIndex + 1}/${imageCount}…`
        : 'Uploading gallery output…'
    );

    let inputImageFilename: string | undefined;
    try {
      inputImageFilename = await resolveQueueInputImageFilename({
        imageUrl: outputUrl,
        model,
      });
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Could not upload gallery output.',
      };
    }

    if (!inputImageFilename?.trim()) {
      return { ok: false, error: 'Could not upload gallery output to ComfyUI.' };
    }

    let libraryWorkflow =
      shared.useLibraryUpscaleWorkflow === true
        ? findLibraryUpscaleWorkflowForModel(model)
        : undefined;
    let libraryGraph: Record<string, unknown> | undefined;
    if (libraryWorkflow) {
      try {
        libraryGraph = JSON.parse(libraryWorkflow.workflowJson) as Record<string, unknown>;
      } catch {
        libraryGraph = undefined;
      }
      if (!libraryGraph || !libraryUpscaleWorkflowEnlarges(libraryGraph)) {
        options.onStatus?.(
          libraryWorkflow
            ? `Library upscale “${libraryWorkflow.name}” is identity / unwired — using Castcut scaffold…`
            : 'Library upscale workflow invalid — using Castcut scaffold…'
        );
        libraryWorkflow = undefined;
        libraryGraph = undefined;
      }
    }

    let workflow: Record<string, unknown>;
    try {
      workflow =
        libraryGraph ??
        buildGalleryUpscaleWorkflow({
          qualityProfile,
          upscaleModelFilename: neuralModel,
          enrichNeuralPolish: enrichOptions.enrichNeuralPolish,
          enrichSharpen: enrichOptions.enrichSharpen,
          model,
          availableUpscaleModels: objectInfo?.models.upscaleModels,
          supportsNeuralUpscaleTileSize: objectInfo?.supportsNeuralUpscaleTileSize,
        });
    } catch (error) {
      if (error instanceof GalleryUpscaleBuildError) {
        return { ok: false, error: error.message, vramDowngraded };
      }
      throw error;
    }

    const runtime: ComfyUiRuntimeConfig = {
      ...baseRuntime,
      workflowJson: JSON.stringify(workflow),
      workflowQueueOptimize: libraryWorkflow ? true : false,
      workflowGraphEnrich: libraryWorkflow ? baseRuntime.workflowGraphEnrich : false,
      directWorkflowPatching: true,
      queueQualityProfile: qualityProfile,
      ...(libraryWorkflow ? { workflowFileId: libraryWorkflow.id } : {}),
    };

    const params = { inputImageFilename };

    options.onStatus?.(
      libraryWorkflow
        ? `Queueing library upscale workflow “${libraryWorkflow.name}”${
            imageCount > 1 ? ` (${imageIndex + 1}/${imageCount})` : ''
          }…`
        : neuralModel
          ? `Queueing neural upscale${imageCount > 1 ? ` ${imageIndex + 1}/${imageCount}` : ''}…`
          : `Queueing Lanczos upscale${imageCount > 1 ? ` ${imageIndex + 1}/${imageCount}` : ''}…`
    );

    const queued = await getEngineAdapter().postPrompt({
      prompt: entry.prompt.trim() || 'upscale',
      negativePrompt: entry.negativePrompt,
      model,
      params,
      comfy: runtime,
      front: true,
    });

    if (!queued.ok || !queued.promptId) {
      queued.releaseLiveSocket();
      return {
        ok: false,
        error: queued.error ?? 'ComfyUI upscale queue failed.',
        comfyUrl: queued.engineUrl,
      };
    }

    registerComfyGalleryJob({
      promptId: queued.promptId,
      prompt: entry.prompt.trim() || 'upscale',
      negativePrompt: entry.negativePrompt,
      tool: entry.tool,
      model: entry.model,
      comfyUrl: queued.engineUrl ?? entry.comfyUrl ?? 'http://127.0.0.1:8188',
      clientId: queued.clientId,
      queueParams: { inputImageFilename },
      workflowJson: runtime.workflowJson,
      sourceImageUrl: outputUrl,
      queueQualityProfile: qualityProfile,
      parentGalleryEntryId: entry.id,
      derivedKind: 'upscale',
      historyId: entry.historyId,
      ...inheritGallerySessionFields(entry),
    });
    if (options.refineAfterComplete && !isLightning && imageIndex === 0) {
      scheduleRefineAfterUpscaleComplete(queued.promptId, options.refineAfterComplete);
    }
    void scheduleComfyGalleryPoll(queued.promptId, {
      comfyUrl: queued.engineUrl ?? entry.comfyUrl ?? 'http://127.0.0.1:8188',
      clientId: queued.clientId,
      onStatus: options.onStatus,
    });
    queued.releaseLiveSocket();

    return {
      ok: true,
      promptId: queued.promptId,
      comfyUrl: queued.engineUrl ?? entry.comfyUrl,
      vramDowngraded,
    };
  };

  let queuedCount = 0;
  let lastPromptId: string | undefined;
  let lastComfyUrl: string | undefined;
  const errors: string[] = [];

  for (let i = 0; i < outputUrls.length; i += 1) {
    const outputUrl = outputUrls[i]!;
    let result = await queueUpscaleForUrl(outputUrl, upscaleModelFilename, i, outputUrls.length);
    if (!result.ok && upscaleModelFilename) {
      options.onStatus?.(
        `Neural upscale failed (${result.error ?? 'queue error'}) — retrying with Lanczos…`
      );
      result = await queueUpscaleForUrl(outputUrl, undefined, i, outputUrls.length);
    }
    if (result.ok) {
      queuedCount += 1;
      lastPromptId = result.promptId ?? lastPromptId;
      lastComfyUrl = result.comfyUrl ?? lastComfyUrl;
    } else {
      errors.push(result.error ?? 'queue failed');
    }
  }

  if (queuedCount === 0) {
    return {
      ok: false,
      error: errors[0] ?? 'Upscale failed.',
      vramDowngraded,
    };
  }

  if (outputUrls.length > 1) {
    options.onStatus?.(
      `Queued ${queuedCount}/${outputUrls.length} upscale job(s)${
        errors.length ? ` · ${errors.length} failed` : ''
      }`
    );
  }

  return {
    ok: true,
    promptId: lastPromptId,
    comfyUrl: lastComfyUrl,
    vramDowngraded,
  };
}

export async function requeueMoireCleanFromGalleryEntry(
  entry: ComfyGalleryEntry,
  options?: {
    qualityProfile?: Extract<QueueQualityProfile, 'final' | 'max'>;
    onStatus?: (message: string) => void;
    force?: boolean;
  }
): Promise<RequeueComfyJobResult> {
  const requested = options?.qualityProfile ?? 'final';
  const resolved = await resolveEnhanceQualityProfile({
    entry,
    qualityProfile: requested,
    kind: 'moire',
    force: options?.force,
    onStatus: options?.onStatus,
  });
  if (resolved.action === 'hold') {
    return { ok: true, held: true };
  }
  const profile = resolved.qualityProfile;
  if (!options?.force && galleryEntryAlreadyEnrichedForUpscale(entry, profile)) {
    return {
      ok: false,
      error: 'Already Final/Max polished — skip moiré re-clean (use Draft source or a new seed).',
    };
  }

  const outputUrl = resolveGalleryOutputImageUrl(entry);
  if (!outputUrl) {
    return { ok: false, error: 'No gallery output image available to clean.' };
  }

  options?.onStatus?.('Uploading gallery output…');

  const model = (entry.model ?? 'qwen-image-2512') as ComfyImageModel;
  let inputImageFilename: string | undefined;
  try {
    inputImageFilename = await resolveQueueInputImageFilename({
      imageUrl: outputUrl,
      model,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not upload gallery output.',
    };
  }

  if (!inputImageFilename?.trim()) {
    return { ok: false, error: 'Could not upload gallery output to ComfyUI.' };
  }

  const qualityProfile = profile;
  const workflow = buildGalleryMoireCleanWorkflow(qualityProfile);
  const baseRuntime = resolveRuntimeForQueue(model, entry.tool);

  const runtime: ComfyUiRuntimeConfig = {
    ...baseRuntime,
    workflowJson: JSON.stringify(workflow),
    workflowQueueOptimize: false,
    workflowGraphEnrich: false,
    directWorkflowPatching: true,
    queueQualityProfile: qualityProfile,
  };

  options?.onStatus?.(
    qualityProfile === 'max'
      ? 'Queueing moiré clean (Max: blur → bicubic → Lanczos)…'
      : 'Queueing moiré clean (Final: soft blur only)…'
  );

  const queued = await getEngineAdapter().postPrompt({
    prompt: entry.prompt.trim() || 'moire clean',
    negativePrompt: entry.negativePrompt,
    model,
    params: { inputImageFilename },
    comfy: runtime,
    front: true,
  });

  if (!queued.ok || !queued.promptId) {
    queued.releaseLiveSocket();
    return {
      ok: false,
      error: queued.error ?? 'ComfyUI moiré-clean queue failed.',
      comfyUrl: queued.engineUrl,
    };
  }

  registerComfyGalleryJob({
    promptId: queued.promptId,
    prompt: entry.prompt.trim() || 'moire clean',
    negativePrompt: entry.negativePrompt,
    tool: entry.tool,
    model: entry.model,
    comfyUrl: queued.engineUrl ?? entry.comfyUrl ?? 'http://127.0.0.1:8188',
    clientId: queued.clientId,
    queueParams: { inputImageFilename },
    workflowJson: runtime.workflowJson,
    sourceImageUrl: outputUrl,
    queueQualityProfile: qualityProfile,
    parentGalleryEntryId: entry.id,
    derivedKind: 'moire-clean',
    historyId: entry.historyId,
    ...inheritGallerySessionFields(entry),
  });
  void scheduleComfyGalleryPoll(queued.promptId, {
    comfyUrl: queued.engineUrl ?? entry.comfyUrl ?? 'http://127.0.0.1:8188',
    clientId: queued.clientId,
    onStatus: options?.onStatus,
  });
  queued.releaseLiveSocket();

  return {
    ok: true,
    promptId: queued.promptId,
    comfyUrl: queued.engineUrl ?? entry.comfyUrl,
    vramDowngraded: resolved.vramDowngraded,
  };
}

export async function requeueRefineFromGalleryEntry(
  entry: ComfyGalleryEntry,
  options?: {
    qualityProfile?: Extract<QueueQualityProfile, 'final' | 'max'>;
    mode?: GalleryRefineMode;
    onStatus?: (message: string) => void;
    force?: boolean;
  }
): Promise<RequeueComfyJobResult> {
  const outputUrl = resolveGalleryOutputImageUrl(entry);
  if (!outputUrl) {
    return { ok: false, error: 'No gallery output image available to refine.' };
  }

  const mode: GalleryRefineMode = options?.mode === 'soft' ? 'soft' : 'refine';
  const softLabel = mode === 'soft' ? 'soft second pass' : 'low-denoise refine';
  options?.onStatus?.(
    mode === 'soft' ? 'Uploading gallery output for soft second pass…' : 'Uploading gallery output…'
  );

  const model = (entry.model ?? 'qwen-image-2512') as ComfyImageModel;
  if (isQwenLightningModel(model)) {
    return {
      ok: false,
      error:
        mode === 'soft'
          ? 'Soft second pass is disabled for Lightning — requeue a new seed or use Final/Max Lanczos polish instead.'
          : 'Img2img refine is disabled for Lightning models — use Final/Max Lanczos polish (or requeue a new seed) instead.',
    };
  }

  const requested = options?.qualityProfile ?? 'final';
  const resolved = await resolveEnhanceQualityProfile({
    entry,
    qualityProfile: requested,
    kind: 'refine',
    force: options?.force,
    onStatus: options?.onStatus,
  });
  if (resolved.action === 'hold') {
    return { ok: true, held: true };
  }
  const profile = resolved.qualityProfile;

  let inputImageFilename: string | undefined;
  try {
    inputImageFilename = await resolveQueueInputImageFilename({
      imageUrl: outputUrl,
      model,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not upload gallery output.',
    };
  }

  if (!inputImageFilename?.trim()) {
    return { ok: false, error: 'Could not upload gallery output to ComfyUI.' };
  }

  const workflow = buildGalleryRefineWorkflow(model);
  const baseRuntime = resolveRuntimeForQueue(model, 'refine');
  const refineParams = galleryRefineQueueParams({
    inputImageFilename,
    profile,
    prompt: entry.prompt,
    model,
    mode,
    queueParams: entry.queueParams,
  });
  const params = {
    ...resolveQueueParams({
      model,
      tool: 'refine',
      qualityProfile: profile,
      inputImageFilename,
      base: refineParams,
    }),
    ...refineParams,
  };

  const runtime: ComfyUiRuntimeConfig = {
    ...baseRuntime,
    workflowJson: JSON.stringify(workflow),
    workflowQueueOptimize: true,
    workflowGraphEnrich: false,
    directWorkflowPatching: true,
    queueQualityProfile: profile,
  };

  options?.onStatus?.(
    resolved.vramDowngraded
      ? `Max → Final (VRAM) · queueing ${softLabel}…`
      : `Queueing ${softLabel}…`
  );

  const refineNegative = appendPortraitRefineNegative(entry.negativePrompt, entry.prompt);

  const queued = await getEngineAdapter().postPrompt({
    prompt: entry.prompt.trim() || (mode === 'soft' ? 'soft-pass' : 'refine'),
    negativePrompt: refineNegative,
    model,
    params,
    comfy: runtime,
    front: true,
  });

  if (!queued.ok || !queued.promptId) {
    queued.releaseLiveSocket();
    return {
      ok: false,
      error: queued.error ?? 'ComfyUI refine queue failed.',
      comfyUrl: queued.engineUrl,
    };
  }

  registerComfyGalleryJob({
    promptId: queued.promptId,
    prompt: entry.prompt.trim() || (mode === 'soft' ? 'soft-pass' : 'refine'),
    negativePrompt: entry.negativePrompt,
    tool: 'refine',
    model: entry.model,
    comfyUrl: queued.engineUrl ?? entry.comfyUrl ?? 'http://127.0.0.1:8188',
    clientId: queued.clientId,
    queueParams: params,
    workflowJson: runtime.workflowJson,
    sourceImageUrl: outputUrl,
    queueQualityProfile: profile,
    parentGalleryEntryId: entry.id,
    derivedKind: mode === 'soft' ? 'soft-pass' : 'refine',
    ...inheritGallerySessionFields(entry),
  });
  void scheduleComfyGalleryPoll(queued.promptId, {
    comfyUrl: queued.engineUrl ?? entry.comfyUrl ?? 'http://127.0.0.1:8188',
    clientId: queued.clientId,
    onStatus: options?.onStatus,
  });
  queued.releaseLiveSocket();

  return {
    ok: true,
    promptId: queued.promptId,
    comfyUrl: queued.engineUrl ?? entry.comfyUrl,
    vramDowngraded: resolved.vramDowngraded,
  };
}

/** Soft second pass — same path as refine with model-capped gentler denoise. */
export function requeueSoftSecondPassFromGalleryEntry(
  entry: ComfyGalleryEntry,
  options?: {
    qualityProfile?: Extract<QueueQualityProfile, 'final' | 'max'>;
    onStatus?: (message: string) => void;
    force?: boolean;
  }
): Promise<RequeueComfyJobResult> {
  return requeueRefineFromGalleryEntry(entry, {
    ...options,
    mode: 'soft',
  });
}

/**
 * Requeues the gallery output through a face-detailer / ReActor-style workflow.
 *
 * Requires a dedicated library workflow (Settings → workflow library, pinned
 * via `modelWorkflowMap.faceDetailer` or auto-detected by name/node type)
 * containing {{FACE_DETAIL_IMAGE}} / {{FACE_DETAIL_DENOISE}}. Refuses when
 * none is available — never queues the LoadImage→SaveImage pass-through stub.
 */
export async function requeueFaceDetailFromGalleryEntry(
  entry: ComfyGalleryEntry,
  options?: {
    denoise?: number;
    onStatus?: (message: string) => void;
  }
): Promise<RequeueComfyJobResult> {
  const outputUrl = resolveGalleryOutputImageUrl(entry);
  if (!outputUrl) {
    return { ok: false, error: 'No gallery output image available to face-detail.' };
  }

  const model = (entry.model ?? 'qwen-image-2512') as ComfyImageModel;
  if (isQwenLightningModel(model)) {
    return {
      ok: false,
      error:
        'Face detail is disabled for Lightning (img2img pass-through only) — use Refine or Upscale instead.',
    };
  }

  const libraryWorkflow = findLibraryFaceDetailerWorkflow();
  let workflowJson = libraryWorkflow?.workflowJson;
  const workflowFileId = libraryWorkflow?.id;

  if (!workflowJson) {
    const objectInfo = await fetchComfyObjectInfoNodeTypesCached().catch(() => null);
    const auto = buildAutoFaceDetailerWorkflow({
      availableNodeTypes: objectInfo ?? undefined,
      model,
    });
    if (!auto.inserted) {
      return {
        ok: false,
        error:
          auto.reason ??
          'No FaceDetailer/ReActor workflow found. Import one with {{FACE_DETAIL_IMAGE}}, pin faceDetailer=<workflowId> in Settings, or install Impact Pack FaceDetailer for auto-insert.',
      };
    }
    workflowJson = JSON.stringify(auto.workflow);
  }

  options?.onStatus?.('Uploading gallery output…');

  let inputImageFilename: string | undefined;
  try {
    inputImageFilename = await resolveQueueInputImageFilename({
      imageUrl: outputUrl,
      model,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not upload gallery output.',
    };
  }

  if (!inputImageFilename?.trim()) {
    return { ok: false, error: 'Could not upload gallery output to ComfyUI.' };
  }

  const shared = loadSettingsCache().shared;
  const denoise = normalizeFaceDetailDenoise(options?.denoise ?? shared.faceDetailerDenoise);

  const workflow = JSON.parse(workflowJson) as Record<string, unknown>;

  const faceDetailParams = faceDetailQueueParams({
    inputImageFilename,
    denoise,
    queueParams: entry.queueParams,
  });
  const baseRuntime = resolveRuntimeForQueue(model, 'face-detail');
  const runtime: ComfyUiRuntimeConfig = {
    ...baseRuntime,
    workflowJson: JSON.stringify(workflow),
    workflowQueueOptimize: true,
    workflowGraphEnrich: false,
    directWorkflowPatching: true,
    customTokens: faceDetailCustomTokens({ inputImageFilename, denoise }),
    workflowFileId,
  };

  options?.onStatus?.(
    workflowFileId ? `Queueing library face-detail workflow…` : 'Queueing auto FaceDetailer graph…'
  );

  const queued = await getEngineAdapter().postPrompt({
    prompt: entry.prompt.trim() || 'face detail',
    negativePrompt: entry.negativePrompt,
    model,
    params: faceDetailParams,
    comfy: runtime,
    front: true,
  });

  if (!queued.ok || !queued.promptId) {
    queued.releaseLiveSocket();
    return {
      ok: false,
      error: queued.error ?? 'ComfyUI face-detail queue failed.',
      comfyUrl: queued.engineUrl,
    };
  }

  registerComfyGalleryJob({
    promptId: queued.promptId,
    prompt: entry.prompt.trim() || 'face detail',
    negativePrompt: entry.negativePrompt,
    tool: entry.tool,
    model: entry.model,
    comfyUrl: queued.engineUrl ?? entry.comfyUrl ?? 'http://127.0.0.1:8188',
    clientId: queued.clientId,
    queueParams: faceDetailParams,
    workflowJson: runtime.workflowJson,
    sourceImageUrl: outputUrl,
    queueQualityProfile: entry.queueQualityProfile,
    parentGalleryEntryId: entry.id,
    derivedKind: 'face-detail',
    historyId: entry.historyId,
    ...inheritGallerySessionFields(entry),
  });
  void scheduleComfyGalleryPoll(queued.promptId, {
    comfyUrl: queued.engineUrl ?? entry.comfyUrl ?? 'http://127.0.0.1:8188',
    clientId: queued.clientId,
    onStatus: options?.onStatus,
  });
  queued.releaseLiveSocket();

  return {
    ok: true,
    promptId: queued.promptId,
    comfyUrl: queued.engineUrl ?? entry.comfyUrl,
  };
}

export type BulkUpscaleGalleryResult = {
  queued: number;
  failed: number;
  skipped: number;
  errors: string[];
};

function summarizeBulkUpscaleLabel(entry: ComfyGalleryEntry): string {
  return entry.model ?? entry.tool ?? entry.id.slice(0, 8);
}

export async function bulkUpscaleGalleryEntries(
  entries: ComfyGalleryEntry[],
  qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'>,
  onStatus?: (message: string) => void
): Promise<BulkUpscaleGalleryResult> {
  let queued = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, entry] of entries.entries()) {
    if (!canUpscaleGalleryEntry(entry, qualityProfile)) {
      skipped += 1;
      const reason = galleryEntryAlreadyEnrichedForUpscale(entry, qualityProfile)
        ? 'already Final/Max enriched'
        : 'not completed or no output image';
      errors.push(`${summarizeBulkUpscaleLabel(entry)}: skipped (${reason})`);
      continue;
    }

    onStatus?.(`Upscaling ${index + 1}/${entries.length}…`);
    const result = await requeueUpscaleFromGalleryEntry(entry, {
      qualityProfile,
      onStatus: undefined,
    });
    if (result.ok) {
      queued += 1;
    } else {
      failed += 1;
      errors.push(`${summarizeBulkUpscaleLabel(entry)}: ${result.error ?? 'queue failed'}`);
    }
  }

  const detail = errors.length > 0 ? ` · ${errors.slice(0, 3).join(' · ')}` : '';
  onStatus?.(
    `Bulk upscale finished · ${queued} queued · ${skipped} skipped · ${failed} failed${detail}`
  );

  return { queued, failed, skipped, errors };
}

export async function bulkMoireCleanGalleryEntries(
  entries: ComfyGalleryEntry[],
  qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'> = 'final',
  onStatus?: (message: string) => void
): Promise<BulkUpscaleGalleryResult> {
  let queued = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, entry] of entries.entries()) {
    if (!canMoireCleanGalleryEntry(entry, qualityProfile)) {
      skipped += 1;
      const reason = galleryEntryAlreadyEnrichedForUpscale(entry, qualityProfile)
        ? 'already Final/Max polished'
        : 'not completed or no output image';
      errors.push(`${summarizeBulkUpscaleLabel(entry)}: skipped (${reason})`);
      continue;
    }

    onStatus?.(`Moiré clean ${index + 1}/${entries.length}…`);
    const result = await requeueMoireCleanFromGalleryEntry(entry, {
      qualityProfile,
      onStatus: undefined,
    });
    if (result.ok) {
      queued += 1;
    } else {
      failed += 1;
      errors.push(`${summarizeBulkUpscaleLabel(entry)}: ${result.error ?? 'queue failed'}`);
    }
  }

  const detail = errors.length > 0 ? ` · ${errors.slice(0, 3).join(' · ')}` : '';
  onStatus?.(
    `Bulk moiré clean finished · ${queued} queued · ${skipped} skipped · ${failed} failed${detail}`
  );

  return { queued, failed, skipped, errors };
}

export async function bulkRefineGalleryEntries(
  entries: ComfyGalleryEntry[],
  qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'> = 'final',
  onStatus?: (message: string) => void
): Promise<BulkUpscaleGalleryResult> {
  let queued = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, entry] of entries.entries()) {
    if (!canRefineGalleryEntry(entry)) {
      skipped += 1;
      errors.push(
        `${summarizeBulkUpscaleLabel(entry)}: skipped (not completed or no output image)`
      );
      continue;
    }

    onStatus?.(`Refining ${index + 1}/${entries.length}…`);
    const result = await requeueRefineFromGalleryEntry(entry, {
      qualityProfile,
      onStatus: undefined,
    });
    if (result.ok) {
      queued += 1;
    } else {
      failed += 1;
      errors.push(`${summarizeBulkUpscaleLabel(entry)}: ${result.error ?? 'queue failed'}`);
    }
  }

  const detail = errors.length > 0 ? ` · ${errors.slice(0, 3).join(' · ')}` : '';
  onStatus?.(
    `Bulk refine finished · ${queued} queued · ${skipped} skipped · ${failed} failed${detail}`
  );

  return { queued, failed, skipped, errors };
}

async function requeueCloudJobFromEntry(
  entry: ComfyGalleryEntry,
  options?: {
    newSeed?: boolean;
    onStatus?: (message: string) => void;
    seedOverride?: string | number;
  }
): Promise<RequeueComfyJobResult> {
  const engineId = isCloudEngine(entry.engineId) ? entry.engineId : 'fal';
  const prompt = entry.prompt?.trim();
  if (!prompt) {
    return { ok: false, error: 'Prompt is required.' };
  }
  const label = engineDisplayName(engineId);
  options?.onStatus?.(`Queueing ${label}…`);
  const adapter = getEngineAdapterById(engineId);
  const host = cloudEngineHost(engineId);
  const hasInputImage = Boolean(
    entry.queueParams?.inputImageFilename || loadSettingsCache().shared.ipAdapterImageFilename
  );
  const clipMode =
    entry.tool === 'video'
      ? inferVideoClipMode({
          clipMode:
            entry.derivedKind === 't2v' || entry.derivedKind === 'i2v'
              ? entry.derivedKind
              : undefined,
          hasInitImage: hasInputImage,
        })
      : undefined;
  const model = resolveCloudQueueModel(engineId, entry.tool, {
    hasInputImage,
    clipMode,
  });
  const seed =
    options?.seedOverride != null
      ? String(options.seedOverride)
      : options?.newSeed
        ? String(Math.floor(Math.random() * 2 ** 32))
        : entry.queueParams?.seed;
  const queued = await adapter.postPrompt({
    prompt,
    negativePrompt: entry.negativePrompt,
    model,
    params: {
      ...entry.queueParams,
      ...(seed != null ? { seed } : {}),
    },
    ...resolveCloudQueueExtras(engineId, {
      hasInputImage,
      inputImageFilename:
        entry.queueParams?.inputImageFilename || loadSettingsCache().shared.ipAdapterImageFilename,
      tool: entry.tool,
      clipMode,
    }),
  });
  if (!queued.ok || !queued.promptId) {
    queued.releaseLiveSocket();
    return {
      ok: false,
      error: queued.error ?? `${label} queue failed.`,
      comfyUrl: queued.engineUrl,
    };
  }
  registerComfyGalleryJob({
    promptId: queued.promptId,
    prompt,
    negativePrompt: entry.negativePrompt,
    tool: entry.tool,
    model,
    comfyUrl: queued.engineUrl ?? host,
    clientId: queued.clientId,
    queueParams: { ...entry.queueParams, ...(seed != null ? { seed } : {}) },
    parentGalleryEntryId: options?.newSeed || options?.seedOverride != null ? entry.id : undefined,
    derivedKind: options?.newSeed || options?.seedOverride != null ? 'variation' : undefined,
    historyId: entry.historyId,
    engineId,
    ...inheritGallerySessionFields(entry),
  });
  void scheduleComfyGalleryPoll(queued.promptId, {
    comfyUrl: queued.engineUrl ?? host,
    clientId: queued.clientId,
    onStatus: options?.onStatus,
  });
  queued.releaseLiveSocket();
  return { ok: true, promptId: queued.promptId, comfyUrl: queued.engineUrl ?? host };
}

export async function requeueComfyJobFromEntry(
  entry: ComfyGalleryEntry,
  options?: Pick<
    RequeueComfyJobInput,
    | 'newSeed'
    | 'onStatus'
    | 'hints'
    | 'qualityProfile'
    | 'comfyUrlOverride'
    | 'workflowJson'
    | 'sessionActiveLoraIds'
  > & {
    /** When true (default), prefer the exact Comfy history graph for this promptId. */
    exactGraph?: boolean;
    /** Force a specific seed (e.g. seed+1). Marks the job as a variation. */
    seedOverride?: string | number;
  }
): Promise<RequeueComfyJobResult> {
  if (isCloudEngine(entry.engineId)) {
    return requeueCloudJobFromEntry(entry, options);
  }
  const urls = resolveRequeueImageUrlsFromEntry(entry);
  const seedOverride =
    options?.seedOverride === undefined || options?.seedOverride === null
      ? undefined
      : String(options.seedOverride);
  const isVariation = Boolean(options?.newSeed || options?.qualityProfile || seedOverride != null);

  const storedEntry =
    options?.exactGraph === false
      ? undefined
      : !options?.workflowJson?.trim() && !entry.workflowJson?.trim()
        ? (await import('./gallery-db-store')).getGalleryEntryById(entry.id)
        : undefined;
  let workflowJson =
    options?.exactGraph === false
      ? options?.workflowJson?.trim() || undefined
      : options?.workflowJson?.trim() ||
        entry.workflowJson?.trim() ||
        storedEntry?.workflowJson?.trim() ||
        undefined;
  if (
    workflowJson &&
    !options?.workflowJson?.trim() &&
    (entry.workflowJson?.trim() || storedEntry?.workflowJson?.trim())
  ) {
    options?.onStatus?.('Replaying stored gallery workflow graph.');
    void import('./local-observability').then(({ noteExactReplayMetric }) => {
      noteExactReplayMetric();
    });
  }
  if (!workflowJson && options?.exactGraph !== false && entry.promptId?.trim()) {
    try {
      // Use the API route — never import comfyui-history-workflow on the client
      // (it pulls comfyui-client → node:crypto / node:fs).
      const params = new URLSearchParams({ promptId: entry.promptId.trim() });
      const comfyUrl = options?.comfyUrlOverride?.trim() || entry.comfyUrl?.trim();
      if (comfyUrl) {
        params.set('comfyUrl', comfyUrl);
      }
      const response = await fetch(`/api/comfyui/history/workflow?${params.toString()}`);
      if (response.ok) {
        const history = (await response.json()) as {
          ok?: boolean;
          workflow?: Record<string, unknown>;
        };
        if (history.workflow && typeof history.workflow === 'object') {
          workflowJson = JSON.stringify(history.workflow);
          options?.onStatus?.('Replaying exact graph from ComfyUI history.');
          void import('./comfyui-gallery').then(({ updateComfyGalleryEntryById }) => {
            updateComfyGalleryEntryById(entry.id, {
              workflowJson,
              hasStoredWorkflow: true,
              workflowJsonOmitted: false,
            });
          });
          void import('./local-observability').then(({ noteExactReplayMetric }) => {
            noteExactReplayMetric();
          });
        }
      }
    } catch {
      // Fall back to library/scaffold rebuild.
    }
  }

  return requeueComfyJob({
    prompt: entry.prompt,
    negativePrompt: entry.negativePrompt,
    tool: entry.tool,
    model: entry.model,
    queueParams:
      seedOverride != null ? { ...entry.queueParams, seed: seedOverride } : entry.queueParams,
    sourceImageUrl: urls.sourceImageUrl,
    maskImageUrl: urls.maskImageUrl,
    storedQualityProfile: entry.queueQualityProfile,
    sessionActiveLoraIds: options?.sessionActiveLoraIds ?? resolveRequeueSessionLoraIds(entry),
    // seedOverride already applied — don't randomize on top of it.
    newSeed: seedOverride != null ? false : options?.newSeed,
    hints: options?.hints,
    qualityProfile: options?.qualityProfile,
    comfyUrlOverride: options?.comfyUrlOverride,
    workflowJson,
    parentGalleryEntryId: isVariation ? entry.id : undefined,
    derivedKind: isVariation ? 'variation' : undefined,
    onStatus: options?.onStatus,
  });
}

/** Fetch Comfy history graph for an entry and persist it for later exact replay. */
export async function restoreExactGraphFromComfyHistory(
  entry: Pick<ComfyGalleryEntry, 'id' | 'promptId' | 'comfyUrl'>,
  options?: { onStatus?: (message: string) => void; comfyUrlOverride?: string }
): Promise<{ ok: boolean; message: string; workflowJson?: string }> {
  const promptId = entry.promptId?.trim();
  if (!promptId) {
    return { ok: false, message: 'No Comfy prompt id — cannot fetch history graph.' };
  }
  try {
    const params = new URLSearchParams({ promptId });
    const comfyUrl = options?.comfyUrlOverride?.trim() || entry.comfyUrl?.trim();
    if (comfyUrl) {
      params.set('comfyUrl', comfyUrl);
    }
    options?.onStatus?.('Fetching exact graph from ComfyUI history…');
    const response = await fetch(`/api/comfyui/history/workflow?${params.toString()}`);
    if (!response.ok) {
      return {
        ok: false,
        message: `Comfy history fetch failed (${response.status}).`,
      };
    }
    const history = (await response.json()) as {
      ok?: boolean;
      workflow?: Record<string, unknown>;
      error?: string;
    };
    if (!history.workflow || typeof history.workflow !== 'object') {
      return {
        ok: false,
        message: history.error?.trim() || 'No workflow in ComfyUI history for this prompt id.',
      };
    }
    const workflowJson = JSON.stringify(history.workflow);
    const { updateComfyGalleryEntryById } = await import('./comfyui-gallery');
    updateComfyGalleryEntryById(entry.id, {
      workflowJson,
      hasStoredWorkflow: true,
      workflowJsonOmitted: false,
    });
    void import('./local-observability').then(({ noteExactReplayMetric }) => {
      noteExactReplayMetric();
    });
    options?.onStatus?.('Exact graph restored to gallery entry.');
    return { ok: true, message: 'Exact graph restored from ComfyUI history.', workflowJson };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to restore graph from history.',
    };
  }
}

export function requeueComfyJobFromHistory(
  entry: {
    id: string;
    prompt: string;
    model?: string;
    tool?: string;
    hints?: string;
    negativePrompt?: string;
    metadata?: Record<string, unknown>;
  },
  options?: Pick<RequeueComfyJobInput, 'newSeed' | 'onStatus' | 'hints'>
): Promise<RequeueComfyJobResult> {
  const galleryEntry = findGalleryEntryForHistory(entry);
  if (galleryEntry) {
    return requeueComfyJobFromEntry(galleryEntry, {
      newSeed: options?.newSeed,
      onStatus: options?.onStatus,
      hints: options?.hints ?? entry.hints,
    });
  }

  return requeueComfyJob({
    prompt: entry.prompt,
    negativePrompt: entry.negativePrompt,
    tool: entry.tool,
    model: entry.model,
    hints: options?.hints ?? entry.hints,
    newSeed: options?.newSeed,
    onStatus: options?.onStatus,
  });
}

export async function requeueComfyJob(input: RequeueComfyJobInput): Promise<RequeueComfyJobResult> {
  if (!input.prompt.trim()) {
    return { ok: false, error: 'Prompt is required.' };
  }

  input.onStatus?.('Queueing…');

  let negativePrompt = input.negativePrompt?.trim() || undefined;
  const model = (input.model ?? 'qwen-image-2512') as ComfyImageModel;

  if (!negativePrompt) {
    negativePrompt = await resolveQueueNegativePrompt({
      model,
      hints: input.hints?.trim() || input.prompt.slice(0, 200),
    });
  }

  const baseParams = input.newSeed
    ? {
        ...input.queueParams,
        seed: String(Math.floor(Math.random() * 2 ** 32)),
      }
    : input.queueParams;

  if (input.sourceImageUrl?.trim() || input.maskImageUrl?.trim()) {
    input.onStatus?.('Refreshing queue images for ComfyUI…');
  }

  const refreshed = await refreshQueueImageParamsForRequeue({
    model,
    tool: input.tool,
    queueParams: baseParams,
    sourceImageUrl: input.sourceImageUrl,
    maskImageUrl: input.maskImageUrl,
    forceInputImage: input.forceInputImage,
  });
  const refreshedParams = refreshed.params;

  const requestedProfile = input.qualityProfile ?? input.storedQualityProfile ?? undefined;
  const sessionActiveLoraIds =
    input.sessionActiveLoraIds !== undefined
      ? input.sessionActiveLoraIds
      : resolveSharedEffectiveSessionLoraIds(model);
  const baseRuntime = resolveRuntimeForQueue(model, input.tool, {
    sessionActiveLoraIds,
  });
  const withRequested = baseRuntime
    ? {
        ...baseRuntime,
        queueQualityProfile: requestedProfile ?? baseRuntime.queueQualityProfile,
      }
    : undefined;
  const vramGuard = await guardQueueQualityForVram({
    profile: requestedProfile ?? withRequested?.queueQualityProfile,
    runtime: withRequested,
  });
  const effectiveQualityProfile = vramGuard.profile;
  const comfyRuntime = input.comfyUrlOverride?.trim()
    ? { ...vramGuard.runtime, apiUrl: input.comfyUrlOverride.trim() }
    : vramGuard.runtime;
  if (vramGuard.downgraded) {
    input.onStatus?.('Max → Final (VRAM) — free VRAM under 6 GB.');
  }

  const params = resolveQueueParams({
    model,
    tool: input.tool,
    base: refreshedParams,
    qualityProfile: effectiveQualityProfile,
    figurePixelSize: refreshed.figurePixelSize,
    inputImageFilename: refreshedParams?.inputImageFilename,
  });

  input.onStatus?.('Validating workflow…');
  const preflight = await runWorkflowPreflight({
    model,
    prompts: [input.prompt.trim()],
    negativePrompt,
    tool: input.tool,
    queueParams: params,
    hasInputImage: Boolean(params.inputImageFilename || input.sourceImageUrl?.trim()),
    hasMaskImage: Boolean(params.maskImageFilename || input.maskImageUrl?.trim()),
    qualityProfile: effectiveQualityProfile,
    comfy: comfyRuntime,
  });
  if (!preflight.ok) {
    return {
      ok: false,
      error:
        preflight.issues
          .filter(issue => issue.severity === 'error')
          .map(issue => issue.message)
          .join(' · ') || 'Workflow pre-flight failed.',
    };
  }

  const requeueImageIssues = auditRequeueImageReadiness({
    model,
    tool: input.tool,
    queueParams: params,
    sourceImageUrl: input.sourceImageUrl,
    maskImageUrl: input.maskImageUrl,
    forceInputImage: input.forceInputImage,
  });
  const requeueImageError = requeueImageIssues.find(issue => issue.severity === 'error');
  if (requeueImageError) {
    return { ok: false, error: requeueImageError.message };
  }

  if (effectiveQualityProfile === 'max' && (await shouldHoldMaxUntilIdle())) {
    holdMaxGenerateJob({
      prompt: input.prompt.trim(),
      negativePrompt,
      model: String(model),
      tool: input.tool,
      params,
      comfy: comfyRuntime,
      qualityProfile: 'max',
    });
    input.onStatus?.('Max held until ComfyUI queue is idle (Queue → Orchestration).');
    return { ok: true, held: true, vramDowngraded: vramGuard.downgraded };
  }

  const workflowJson = input.workflowJson?.trim();
  const comfyPayload = workflowJson
    ? {
        ...comfyRuntime,
        workflowJson,
        directWorkflowPatching: true,
        workflowQueueOptimize: true,
      }
    : comfyRuntime;

  const queued = await getEngineAdapter().postPrompt({
    prompt: input.prompt.trim(),
    negativePrompt,
    model,
    ...(params ? { params } : {}),
    ...(comfyPayload ? { comfy: comfyPayload } : {}),
    front: true,
    // Native Diffusers path (no workflow) applies Comfy-parity Lanczos post.
    qualityProfile: effectiveQualityProfile,
    hasInputImage: Boolean(params.inputImageFilename || input.sourceImageUrl?.trim()),
  });

  if (!queued.ok || !queued.promptId) {
    queued.releaseLiveSocket();
    return {
      ok: false,
      error: queued.error ?? 'ComfyUI queue failed.',
      comfyUrl: queued.engineUrl,
    };
  }

  registerComfyGalleryJob({
    promptId: queued.promptId,
    prompt: input.prompt.trim(),
    negativePrompt,
    tool: input.tool,
    model: input.model,
    comfyUrl: queued.engineUrl ?? 'http://127.0.0.1:8188',
    clientId: queued.clientId,
    engineId: queued.engineId,
    queueParams: params,
    workflowJson,
    sourceImageUrl: input.sourceImageUrl,
    maskImageUrl: input.maskImageUrl,
    queueQualityProfile: effectiveQualityProfile,
    sessionActiveLoraIds,
    parentGalleryEntryId: input.parentGalleryEntryId,
    derivedKind: input.derivedKind,
  });
  void scheduleComfyGalleryPoll(queued.promptId, {
    comfyUrl: queued.engineUrl ?? 'http://127.0.0.1:8188',
    clientId: queued.clientId,
    onStatus: input.onStatus,
  });
  queued.releaseLiveSocket();

  const warnMessages = requeueImageIssues
    .filter(issue => issue.severity === 'warn')
    .map(issue => issue.message);
  if (warnMessages.length > 0) {
    input.onStatus?.(`Queued · ${warnMessages.join(' · ')}`);
  }

  return {
    ok: true,
    promptId: queued.promptId,
    comfyUrl: queued.engineUrl,
    vramDowngraded: vramGuard.downgraded,
  };
}

export async function fetchWorkflowPreview(input: {
  prompt: string;
  negativePrompt?: string;
  newSeed?: boolean;
  params?: WorkflowParamValues;
  model?: ComfyImageModel | string;
  comfy?: ComfyUiRuntimeConfig;
  hasInputImage?: boolean;
  hasMaskImage?: boolean;
}): Promise<{
  ok?: boolean;
  error?: string;
  workflowSource?: string;
  replacements?: WorkflowPreviewResponse['replacements'];
  resolvedParams?: WorkflowPreviewResponse['resolvedParams'];
  snippets?: WorkflowPreviewResponse['snippets'];
  workflowJson?: string;
  truncated?: boolean;
  preflightIssues?: WorkflowPreviewResponse['preflightIssues'];
}> {
  const runtime =
    input.comfy ??
    (input.model ? resolveRuntimeForQueue(input.model as ComfyImageModel) : undefined) ??
    resolveComfyUiRuntime();
  const params: WorkflowParamValues | undefined = input.newSeed
    ? {
        ...input.params,
        seed: String(Math.floor(Math.random() * 2 ** 32)),
      }
    : input.params;
  const response = await fetch('/api/comfyui/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      params,
      model: input.model,
      hasInputImage: input.hasInputImage,
      hasMaskImage: input.hasMaskImage,
      ...(runtime ? { comfy: runtime } : {}),
    }),
  });

  const data = (await response.json()) as WorkflowPreviewResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? 'Workflow preview failed.');
  }

  return data;
}

export async function requeueComfyJobs(
  inputs: RequeueComfyJobInput[],
  onStatus?: (message: string) => void
): Promise<{ queued: number; failed: number }> {
  let queued = 0;
  let failed = 0;

  for (const [index, input] of inputs.entries()) {
    onStatus?.(`Re-queueing ${index + 1}/${inputs.length}…`);
    const result = await requeueComfyJob({ ...input, onStatus: undefined });
    if (result.ok) {
      queued += 1;
    } else {
      failed += 1;
    }
  }

  onStatus?.(`Bulk re-queue finished · ${queued} queued · ${failed} failed`);
  return { queued, failed };
}
