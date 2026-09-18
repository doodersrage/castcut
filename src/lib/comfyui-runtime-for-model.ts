'use client';

import type { ComfyImageModel } from './comfy-models/client';
import {
  loadComfyWorkflowFiles,
  mergeCustomWorkflowTokens,
  collectLightningLoraTokenFromWorkflowLibrary,
} from './comfyui-workflow-files';
import {
  syncLightningLoraLibraryEntry,
  comfyUiSettingsToRuntime,
  loadComfyUiSettings,
} from './comfyui-settings';
import { enrichLoraLibraryForUltraRealModel } from './ultrareal-amplifier-lora';
import { enrichLoraLibraryForKleinBaseModel } from './klein-realistic-detail-lora';
import type { ComfyUiSettings } from './comfyui-settings';
import { loadSettingsCache, saveSharedSettings } from './settings-cache';
import type { ComfyUiModelLists } from './comfyui-object-info';
import {
  fetchComfyObjectInfoCached,
  readCachedComfyObjectInfoModels,
} from './comfyui-object-info-cache';
import { loaderMapsChanged, syncLoaderMapsFromInventory } from './loader-map-inventory-sync';
import { resolveWorkflowForModel, resolveWorkflowForModelSelection } from './model-workflow-map';
import { resolveSelectedWorkflowRuntime, getSelectedWorkflowFileId } from './comfyui-runtime';
import type { ComfyUiRuntimeConfig } from './comfyui-config';
import { resolveQueueQualityProfile, normalizeQueueQualityProfile } from './queue-quality-profile';
import { isVideoModel, resolveModelForQueueTool } from './queue-tool-model';
import { workflowGraphIsVideo } from './workflow-graph-kind';
import { rankWorkflowFilesForModel } from './workflow-category-defaults';
import {
  extractWorkflowStackFingerprint,
  workflowStackMatchesModel,
} from './workflow-stack-fingerprint';
import { isQwenLightningModel } from './model-sampling-patch';
import { workflowHasLoraLoader } from './workflow-lightning-queue';
import { applySystemWorkflowToRuntime, usesSystemWorkflowPath } from './system-workflow-runtime';
import { resolveIdentityLockApiUrl } from './identity-lock-host';

export { resolveIdentityLockApiUrl } from './identity-lock-host';

// Cache for parsed workflow JSON — avoids redundant parse on same string across model checks.
const _workflowParseCache = new Map<string, Record<string, unknown>>();
function getWorkflowParsed(workflowJson: string): Record<string, unknown> | null {
  if (!workflowJson || typeof workflowJson !== 'string') return null;

  const key = workflowJson.length < 120 ? workflowJson : workflowJson.slice(0, 80);
  let cached = _workflowParseCache.get(key);

  // Verify the cached value came from the full string (key was a prefix).
  if (!cached) {
    try {
      cached = JSON.parse(workflowJson) as Record<string, unknown>;
      _workflowParseCache.set(key, cached);
    } catch {
      return null;
    }
  } else if (key !== workflowJson && workflowJson.length > 120) {
    // Key was a prefix — re-parse to verify content matches the full string.
    try {
      const full = JSON.parse(workflowJson) as Record<string, unknown>;
      _workflowParseCache.set(key, full);
      cached = full;
    } catch {
      return null;
    }
  }

  return cached ?? null;
}

export type ResolveRuntimeOptions = {
  ignoreManualWorkflow?: boolean;
  /** Live ComfyUI inventory — when set, system scaffolds/maps adapt to it. */
  inventory?: ComfyUiModelLists | null;
  /**
   * Override the Shared session LoRA stack (e.g. gallery re-queue restoring the
   * stack recorded on the original entry).
   */
  sessionActiveLoraIds?: string[];
  /** Job-pinned strength tweaks (e.g. Story dips SNOFS when Image 3 pose must win). */
  sessionLoraStrengthOverrides?: import('./lora-stack').SessionLoraStrengthOverrides;
};

/**
 * Scan ComfyUI inventory and persist healed loader maps when system workflows
 * are enabled. Returns the models list (or null if unreachable).
 */
export async function scanAndAdaptSystemWorkflowInventory(input?: {
  comfyUrl?: string;
  persist?: boolean;
}): Promise<ComfyUiModelLists | null> {
  let models: ComfyUiModelLists | null = null;
  try {
    const payload = await fetchComfyObjectInfoCached({
      comfyUrl: input?.comfyUrl,
    });
    models = payload?.models ?? null;
  } catch {
    return null;
  }
  if (!models) {
    return null;
  }

  const shared = loadSettingsCache().shared;
  if (shared.useSystemWorkflows !== true) {
    return models;
  }

  const synced = syncLoaderMapsFromInventory({
    models,
    checkpointMap: shared.modelCheckpointMap,
    vaeMap: shared.modelVaeMap,
    upscaleMap: shared.modelUpscaleMap,
    controlNetMap: shared.modelControlNetMap,
    healMissing: true,
  });

  if (
    input?.persist !== false &&
    loaderMapsChanged(
      {
        checkpointMap: shared.modelCheckpointMap,
        vaeMap: shared.modelVaeMap,
        upscaleMap: shared.modelUpscaleMap,
        controlNetMap: shared.modelControlNetMap,
      },
      synced
    )
  ) {
    saveSharedSettings({
      ...shared,
      modelCheckpointMap: synced.modelCheckpointMap,
      modelVaeMap: synced.modelVaeMap,
      modelUpscaleMap: synced.modelUpscaleMap,
      modelControlNetMap: synced.modelControlNetMap,
    });
  }

  return models;
}
function resolveStackCompatibleWorkflowRuntime(
  model: ComfyImageModel,
  base: ComfyUiRuntimeConfig | undefined,
  workflowFiles: ReturnType<typeof loadComfyWorkflowFiles>
): ComfyUiRuntimeConfig | undefined {
  if (!base?.workflowJson?.trim() || base.syncWorkflowLoadersToModel) {
    return base;
  }

  const fingerprint = extractWorkflowStackFingerprint(base.workflowJson);
  if (!fingerprint.isMixed && workflowStackMatchesModel(fingerprint, model)) {
    if (isQwenLightningModel(model)) {
      try {
        const parsed = getWorkflowParsed(base.workflowJson);
        if (parsed && workflowHasLoraLoader(parsed)) {
          return base;
        }
        // Queue prep inserts Lightning LoRA when the token is mapped on this file.
        const hasLightningToken =
          Boolean(
            [...(base.customTokens ?? []), ...(base.workflowCustomTokens ?? [])].some(
              entry => entry.token.trim() === '{{LORA_LIGHTNING}}' && entry.value.trim()
            )
          ) || base.workflowJson.includes('{{LORA_LIGHTNING}}');
        if (hasLightningToken) {
          return base;
        }
      } catch {
        return base;
      }
    } else {
      return base;
    }
  }

  const ranked = rankWorkflowFilesForModel(model, workflowFiles);
  const replacement = ranked.find(entry => {
    try {
      const candidate = extractWorkflowStackFingerprint(entry.file.workflowJson);
      if (candidate.isMixed || !workflowStackMatchesModel(candidate, model)) {
        return false;
      }
      if (isQwenLightningModel(model)) {
        const parsed = getWorkflowParsed(entry.file.workflowJson);
        if (!parsed) return false;
        return workflowHasLoraLoader(parsed);
      }
      return true;
    } catch {
      return false;
    }
  });
  if (!replacement) {
    return base;
  }

  const swapped = resolveSelectedWorkflowRuntime(replacement.file.id);
  if (!swapped?.workflowJson?.trim()) {
    return base;
  }

  return {
    ...base,
    ...swapped,
    workflowJson: swapped.workflowJson,
    workflowOptimizedHash: swapped.workflowOptimizedHash,
    workflowOptimizedModel: swapped.workflowOptimizedModel,
    workflowOptimizedProfile: swapped.workflowOptimizedProfile,
  };
}

function attachLightningTokens(
  model: ComfyImageModel,
  customTokens: ComfyUiRuntimeConfig['customTokens'],
  workflowCustomTokens: ComfyUiRuntimeConfig['workflowCustomTokens']
): {
  customTokens: ComfyUiRuntimeConfig['customTokens'];
  workflowCustomTokens: ComfyUiRuntimeConfig['workflowCustomTokens'];
} {
  if (!isQwenLightningModel(model)) {
    return { customTokens, workflowCustomTokens };
  }
  const hasLightning = [...(customTokens ?? []), ...(workflowCustomTokens ?? [])].some(
    entry => entry.token.trim() === '{{LORA_LIGHTNING}}' && entry.value.trim()
  );
  if (hasLightning) {
    return { customTokens, workflowCustomTokens };
  }
  const fallback = collectLightningLoraTokenFromWorkflowLibrary(model);
  if (!fallback) {
    return { customTokens, workflowCustomTokens };
  }
  syncLightningLoraLibraryEntry(fallback.value);
  return {
    customTokens: mergeCustomWorkflowTokens(customTokens, [fallback]),
    workflowCustomTokens: mergeCustomWorkflowTokens(workflowCustomTokens, [fallback]),
  };
}

function loadComfyUiSettingsForModel(
  model: ComfyImageModel,
  inventory?: ComfyUiModelLists | null
): ComfyUiSettings {
  const settings = loadComfyUiSettings();
  return {
    ...settings,
    loraLibrary: enrichLoraLibraryForKleinBaseModel(
      model,
      enrichLoraLibraryForUltraRealModel(model, settings.loraLibrary, inventory?.loras),
      inventory?.loras
    ),
  };
}

function sharedQueueFlags(
  shared: ReturnType<typeof loadSettingsCache>['shared'],
  model: ComfyImageModel,
  overrides?: Partial<ComfyUiRuntimeConfig>
): ComfyUiRuntimeConfig {
  const profile = normalizeQueueQualityProfile(shared.queueQualityProfile);
  const isMax = profile === 'max';
  const preferredComfyHost = shared.preferredComfyHost?.trim() || undefined;
  const comfyPoolBusyThreshold =
    typeof shared.comfyPoolBusyThreshold === 'number' &&
    Number.isFinite(shared.comfyPoolBusyThreshold) &&
    shared.comfyPoolBusyThreshold >= 0
      ? shared.comfyPoolBusyThreshold
      : undefined;
  const identityUrl = resolveIdentityLockApiUrl(shared);
  return {
    directWorkflowPatching: shared.directWorkflowPatching !== false,
    syncWorkflowLoadersToModel: shared.syncWorkflowLoadersToModel === true,
    workflowQueueOptimize: shared.workflowQueueOptimize !== false,
    workflowGraphEnrich: shared.workflowGraphEnrich !== false,
    workflowSdxlRefinerEnrich: shared.workflowSdxlRefinerEnrich !== false,
    workflowNeuralUpscalePolish: isMax || shared.workflowNeuralUpscalePolish !== false,
    workflowSharpenAfterUpscale: isMax
      ? shared.workflowSharpenAfterUpscale !== false
      : shared.workflowSharpenAfterUpscale === true,
    compactDraftSaves: shared.compactDraftSaves !== false,
    kleinEnhancerEnabled: shared.kleinEnhancerEnabled !== false,
    kleinEnhancerIdentityPreset: shared.kleinEnhancerIdentityPreset,
    kleinEnhancerTextEnabled: shared.kleinEnhancerTextEnabled !== false,
    kleinEnhancerColorAnchorEnabled: shared.kleinEnhancerColorAnchorEnabled !== false,
    kleinEnhancerColorAnchorStrength: shared.kleinEnhancerColorAnchorStrength,
    queueTargetModel: model,
    queueQualityProfile: profile,
    modelCheckpointMap: shared.modelCheckpointMap,
    modelVaeMap: shared.modelVaeMap,
    modelRefinerMap: shared.modelRefinerMap,
    modelUpscaleMap: shared.modelUpscaleMap,
    ...(preferredComfyHost ? { preferredComfyHost } : {}),
    comfyPoolLoadBalance: shared.comfyPoolLoadBalance !== false,
    ...(comfyPoolBusyThreshold != null ? { comfyPoolBusyThreshold } : {}),
    ...(Array.isArray(shared.comfyPoolUrls) && shared.comfyPoolUrls.length > 0
      ? { comfyPoolUrls: shared.comfyPoolUrls }
      : {}),
    ...overrides,
    ...(identityUrl ? { apiUrl: identityUrl } : {}),
  };
}

export function resolveRuntimeForModel(
  model: ComfyImageModel,
  tool?: string,
  options?: ResolveRuntimeOptions
): ComfyUiRuntimeConfig {
  const shared = loadSettingsCache().shared;
  const inventory =
    options?.inventory !== undefined ? options.inventory : readCachedComfyObjectInfoModels();
  const videoRequest = tool === 'video' || isVideoModel(model);

  const resolveViaSystemPath = (): ComfyUiRuntimeConfig => {
    const workflowFiles = loadComfyWorkflowFiles();
    // System packs replace workflow JSON / loader maps but must keep the session
    // LoRA stack from Settings — otherwise Lightning neutralize leaves style LoRAs
    // at 0 and sidebar picks never re-apply.
    const settingsRuntime = comfyUiSettingsToRuntime(
      loadComfyUiSettingsForModel(model, inventory),
      {
        sessionActiveLoraIds: options?.sessionActiveLoraIds,
        sessionLoraStrengthOverrides: options?.sessionLoraStrengthOverrides,
        model,
      }
    );
    const base = applySystemWorkflowToRuntime(
      model,
      shared,
      workflowFiles,
      sharedQueueFlags(shared, model, {
        loraLibrary: settingsRuntime?.loraLibrary,
        apiUrl: settingsRuntime?.apiUrl,
        ...(settingsRuntime?.customTokens?.length
          ? { customTokens: settingsRuntime.customTokens }
          : {}),
      }),
      inventory,
      { tool: videoRequest ? (tool ?? 'video') : tool }
    );
    const lightning = attachLightningTokens(model, base.customTokens, base.workflowCustomTokens);
    return {
      ...base,
      ...(lightning.customTokens?.length ? { customTokens: lightning.customTokens } : {}),
      ...(lightning.workflowCustomTokens?.length
        ? { workflowCustomTokens: lightning.workflowCustomTokens }
        : {}),
    };
  };

  // System workflows for FLUX/Qwen/video: scored pack → scaffold. Unsupported
  // families (hybrid mode) fall through to mapped/manual resolution below.
  if (usesSystemWorkflowPath(shared, model)) {
    return resolveViaSystemPath();
  }

  const workflowFiles = loadComfyWorkflowFiles();
  const selectionTool = videoRequest ? (tool ?? 'video') : tool;
  const manualId = options?.ignoreManualWorkflow ? undefined : getSelectedWorkflowFileId();
  const mappedId = resolveWorkflowForModel(model, shared.modelWorkflowMap);
  const autoId =
    shared.autoSelectWorkflowForModel !== false
      ? resolveWorkflowForModelSelection(model, {
          map: shared.modelWorkflowMap,
          workflowFiles,
          tool: selectionTool,
        })
      : undefined;
  const acceptWorkflowId = (id?: string): string | undefined => {
    const trimmed = id?.trim();
    if (!trimmed) {
      return undefined;
    }
    if (!videoRequest) {
      return trimmed;
    }
    return workflowGraphIsVideo(resolveSelectedWorkflowRuntime(trimmed)?.workflowJson)
      ? trimmed
      : undefined;
  };
  // Explicit map assignment, then the workflow picker selection, then auto-ranked default.
  // Clip queues skip still-image graphs so Roleplay/Video cannot finish as a PNG.
  const workflowId =
    acceptWorkflowId(mappedId) ?? acceptWorkflowId(manualId) ?? acceptWorkflowId(autoId);
  if (videoRequest && !workflowId) {
    return resolveViaSystemPath();
  }
  const base = workflowId ? resolveSelectedWorkflowRuntime(workflowId) : undefined;
  // Never stack-swap away from an explicit model→workflow map or the picker
  // selection — that dropped per-workflow {{LORA_LIGHTNING}} overrides.
  // Clip graphs must also stay video: stack ranking can prefer a Hunyuan still.
  const trustExplicitWorkflow = Boolean(
    videoRequest ||
    (mappedId?.trim() && workflowId === mappedId) ||
    (manualId?.trim() && workflowId === manualId)
  );
  const stackCompatible = trustExplicitWorkflow
    ? base
    : resolveStackCompatibleWorkflowRuntime(model, base, workflowFiles);
  if (videoRequest && !workflowGraphIsVideo(stackCompatible?.workflowJson ?? base?.workflowJson)) {
    return resolveViaSystemPath();
  }

  const lightning = attachLightningTokens(
    model,
    stackCompatible?.customTokens,
    stackCompatible?.workflowCustomTokens
  );
  // Same as the system-workflow path: always forward the session-filtered LoRA
  // library. Mapped/manual graphs may omit it when no workflow file resolves,
  // and Lightning cannot fall back to {{LORA_*}} custom-token injection.
  const settingsRuntime = comfyUiSettingsToRuntime(loadComfyUiSettingsForModel(model, inventory), {
    sessionActiveLoraIds: options?.sessionActiveLoraIds,
    sessionLoraStrengthOverrides: options?.sessionLoraStrengthOverrides,
    model,
  });

  return {
    ...(stackCompatible ?? {}),
    ...sharedQueueFlags(shared, model, {
      loraLibrary: settingsRuntime?.loraLibrary ?? stackCompatible?.loraLibrary,
      apiUrl: settingsRuntime?.apiUrl ?? stackCompatible?.apiUrl,
      ...(lightning.customTokens?.length ? { customTokens: lightning.customTokens } : {}),
      ...(lightning.workflowCustomTokens?.length
        ? { workflowCustomTokens: lightning.workflowCustomTokens }
        : {}),
    }),
  };
}

export function resolveRuntimeForQueue(
  model: ComfyImageModel,
  tool?: string,
  options?: ResolveRuntimeOptions
): ComfyUiRuntimeConfig {
  const queueModel = resolveModelForQueueTool(model, tool);
  const remapped = queueModel !== model;
  const videoQueue = tool === 'video' || isVideoModel(queueModel);
  // When Generate remaps Edit Lightning → 2512 Lightning, resolve the T2I
  // counterpart's mapped workflow — never keep the Edit graph from the picker.
  let base = resolveRuntimeForModel(queueModel, tool, {
    ...options,
    ignoreManualWorkflow: remapped || options?.ignoreManualWorkflow,
  });
  if (videoQueue && !workflowGraphIsVideo(base.workflowJson)) {
    base = resolveRuntimeForModel(queueModel, 'video', {
      ...options,
      ignoreManualWorkflow: true,
    });
  }
  const shared = loadSettingsCache().shared;
  const resolvedProfile = resolveQueueQualityProfile({
    tool,
    global: shared.queueQualityProfile,
    toolProfiles: shared.toolQueueQualityProfiles,
    model: queueModel,
  });
  const withProfile: ComfyUiRuntimeConfig = {
    ...base,
    queueQualityProfile: resolvedProfile,
    modelSamplerOverrides: shared.modelSamplerOverrides,
    // System packs may disable enrich when the *global* profile is Draft. Tool-level
    // Final/Max (e.g. Compose) must still get Lanczos / polish enrich.
    ...(resolvedProfile === 'final' || resolvedProfile === 'max'
      ? {
          workflowGraphEnrich: shared.workflowGraphEnrich !== false ? true : false,
        }
      : {}),
  };

  if (!remapped) {
    return withProfile;
  }

  // Keep {{LORA_LIGHTNING}} (and other) overrides from the Edit workflow the user
  // already configured — the remapped 2512 file often has the placeholder but no
  // per-workflow token value, which false-fails preflight as "Unresolved".
  const source = resolveRuntimeForModel(model, tool, options);
  const customTokens = mergeCustomWorkflowTokens(source.customTokens, withProfile.customTokens);
  const workflowCustomTokens = mergeCustomWorkflowTokens(
    source.workflowCustomTokens,
    withProfile.workflowCustomTokens
  );

  return {
    ...withProfile,
    customTokens: customTokens.length > 0 ? customTokens : undefined,
    workflowCustomTokens: workflowCustomTokens.length > 0 ? workflowCustomTokens : undefined,
  };
}

/**
 * Queue resolve that scans ComfyUI inventory first when system workflows are on,
 * so scaffolds and loader maps match installed files before preflight/queue.
 */
export async function resolveRuntimeForQueueAsync(
  model: ComfyImageModel,
  tool?: string,
  options?: ResolveRuntimeOptions & { comfyUrl?: string }
): Promise<ComfyUiRuntimeConfig> {
  const shared = loadSettingsCache().shared;
  let inventory = options?.inventory;
  if (shared.useSystemWorkflows === true && inventory === undefined) {
    inventory = await scanAndAdaptSystemWorkflowInventory({
      comfyUrl: options?.comfyUrl,
      persist: true,
    });
  }
  return resolveRuntimeForQueue(model, tool, {
    ...options,
    inventory: inventory ?? readCachedComfyObjectInfoModels(),
  });
}
