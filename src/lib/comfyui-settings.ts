import {
  type ComfyUiRuntimeConfig,
  stripEmptyComfyUiRuntime,
  DEFAULT_CFG_TOKEN,
  DEFAULT_DENOISE_TOKEN,
  DEFAULT_FLUX_BASE_SHIFT_TOKEN,
  DEFAULT_FLUX_MAX_SHIFT_TOKEN,
  DEFAULT_HEIGHT_TOKEN,
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_MASK_IMAGE_TOKEN,
  DEFAULT_INIT_IMAGE_TOKEN,
  DEFAULT_VIDEO_FRAMES_TOKEN,
  DEFAULT_VIDEO_FPS_TOKEN,
  DEFAULT_NEGATIVE_TOKEN,
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_SAMPLER_TOKEN,
  DEFAULT_SCHEDULER_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_SHIFT_TOKEN,
  DEFAULT_STEPS_TOKEN,
  DEFAULT_WIDTH_TOKEN,
  type CustomWorkflowToken,
  type WorkflowParamValues,
  type WorkflowPlaceholderTokens,
} from './comfyui-config';
import { readBrowserValue, removeBrowserKey, writeBrowserValue } from './browser-storage';
import {
  applySessionLoraSelection,
  applySessionLoraStrengthOverrides,
  isLightningLibraryEntry,
  normalizeLoraLibrary,
  type LoraLibraryEntry,
  type SessionLoraStrengthOverrides,
} from './lora-stack';
import {
  resolveEffectiveSessionLoraIds,
  resolveEffectiveSessionLoraStrengthOverrides,
} from './model-lora-map';
import { loadSettingsCache } from './settings-cache';

/**
 * Per-model session → model LoRA map → library enabled flags.
 * Pass `model` to resolve the stack for a gallery/history entry rather than
 * whatever model is currently selected in Shared settings.
 */
export function resolveSharedEffectiveSessionLoraIds(model?: string): string[] | undefined {
  const shared = loadSettingsCache().shared;
  return resolveEffectiveSessionLoraIds(
    shared.sessionActiveLoraIds,
    model?.trim() || shared.model,
    shared.modelLoraMap,
    shared.sessionActiveLoraIdsByModel
  );
}

export function resolveSharedEffectiveSessionLoraStrengthOverrides(
  model?: string
): SessionLoraStrengthOverrides {
  const shared = loadSettingsCache().shared;
  return resolveEffectiveSessionLoraStrengthOverrides(
    model?.trim() || shared.model,
    shared.sessionLoraStrengthOverrides,
    shared.sessionLoraStrengthOverridesByModel
  );
}

export const COMFYUI_SETTINGS_KEY = 'comfyui-settings-v4';

export type { LoraLibraryEntry };

export type ComfyUiSettings = {
  useServerDefaults: boolean;
  apiUrl?: string;
  positiveToken?: string;
  negativeToken?: string;
  workflowJson?: string;
  queueParams?: WorkflowParamValues;
  customTokens?: CustomWorkflowToken[];
  loraLibrary?: LoraLibraryEntry[];
  notifyOnComplete?: boolean;
  /** Auto-tag completed gallery entries with vision LLM tags. */
  autoVisionTags?: boolean;
  /** Auto-fetch negative prompt when queueing SD-family models. */
  autoNegativeOnQueue?: boolean;
  /** Save to Studio history when queueing from a result panel (skips if already saved). */
  autoSaveHistoryOnQueue?: boolean;
  /** Open Refine with corrective intent when a gallery output is rated 1–2★. */
  autoRefineOnLowRating?: boolean;
  /** Queue mutations when a gallery output is rated 4–5★. */
  autoMutateOnHighRating?: boolean;
  /** Queue seed experiments when a gallery output is rated 4–5★. */
  autoSeedExperimentOnHighRating?: boolean;
  /** Queue seed experiments when an output is favorited. */
  autoSeedExperimentOnFavorite?: boolean;
  /** Upscale 4–5★ gallery outputs at Final quality (same image). */
  autoRequeueFinalOnHighRating?: boolean;
  /** Upscale 5★ gallery outputs at Max quality (same image). */
  autoRequeueMaxOnFiveStar?: boolean;
  /** After 5★ upscale, also queue a low-denoise img2img refine (experimental). */
  autoImg2imgRefineOnFiveStar?: boolean;
  /**
   * @deprecated Auto-after-still skin refine removed — Gallery Skin refine only.
   * Kept so older localStorage settings still parse.
   */
  autoSkinRefineOnPlayStill?: boolean;
  /** Model used when queueing Skin refine from Gallery (default Klein 9B Base). */
  autoSkinRefineModel?: string;
  /** Prefer ComfyUI WebSocket progress updates over polling-only status. */
  useWebSocketProgress?: boolean;
  /** Saved negative presets for queue / copy pair. */
  negativeProfiles?: import('./negative-profiles').NegativeProfile[];
  selectedNegativeProfileId?: string;
};

export const DEFAULT_COMFYUI_SETTINGS: ComfyUiSettings = {
  useServerDefaults: true,
  apiUrl: '',
  positiveToken: DEFAULT_POSITIVE_TOKEN,
  negativeToken: DEFAULT_NEGATIVE_TOKEN,
  workflowJson: '',
  queueParams: {
    width: '1328',
    height: '1328',
    cfg: '',
    steps: '',
  },
  customTokens: [],
  loraLibrary: [],
  notifyOnComplete: false,
  autoVisionTags: true,
  autoNegativeOnQueue: true,
  autoSaveHistoryOnQueue: true,
  autoRefineOnLowRating: true,
  autoMutateOnHighRating: false,
  autoSeedExperimentOnHighRating: false,
  autoSeedExperimentOnFavorite: false,
  autoRequeueFinalOnHighRating: true,
  autoRequeueMaxOnFiveStar: true,
  autoImg2imgRefineOnFiveStar: false,
  autoSkinRefineOnPlayStill: false,
  autoSkinRefineModel: 'flux-2-klein-9b',
  useWebSocketProgress: true,
  negativeProfiles: [],
  selectedNegativeProfileId: 'general-sd',
};

const LORA_TOKEN_PREFIX = '{{LORA_';

function parseLoraTokenId(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed.startsWith(LORA_TOKEN_PREFIX) || !trimmed.endsWith('}}')) {
    return null;
  }
  const id = trimmed.slice(LORA_TOKEN_PREFIX.length, -2).trim();
  return id || null;
}

/** Move legacy {{LORA_*}} custom tokens into loraLibrary so Save does not drop them. */
export function migrateOrphanLoraTokensToLibrary(settings: ComfyUiSettings): ComfyUiSettings {
  const library = [...(settings.loraLibrary ?? [])];
  const knownIds = new Set(library.map(entry => entry.id.trim()).filter(Boolean));
  const manualTokens: CustomWorkflowToken[] = [];
  let changed = false;

  for (const entry of settings.customTokens ?? []) {
    const loraId = parseLoraTokenId(entry.token);
    const filename = entry.value?.trim() ?? '';
    if (loraId && filename && !knownIds.has(loraId)) {
      library.push({
        id: loraId,
        label: loraId,
        triggerPhrase: '',
        tokenValue: filename,
        strengthModel: 1,
        strengthClip: 1,
        enabled: true,
      });
      knownIds.add(loraId);
      changed = true;
      continue;
    }
    if (!loraId) {
      manualTokens.push(entry);
    }
  }

  if (!changed) {
    return settings;
  }

  return {
    ...settings,
    loraLibrary: normalizeLoraLibrary(library),
    customTokens: manualTokens,
  };
}

export function mergeLoraLibraryIntoCustomTokens(
  settings: ComfyUiSettings,
  options?: {
    /**
     * When true, only session-active (or Settings-enabled) LoRAs become `{{LORA_*}}`
     * substitutions — except Lightning, which always ships for Lightning workflows.
     * Use at queue/preview time so deselected catalog entries cannot still resolve.
     */
    activeOnly?: boolean;
    /**
     * Override shared session picks (gallery re-queue / same-stack restore).
     * When omitted, uses the current Shared settings stack for the active model.
     */
    sessionActiveLoraIds?: string[];
    /** Model used when resolving the shared stack (defaults to Shared settings model). */
    model?: string;
  }
): ComfyUiSettings {
  const normalized = migrateOrphanLoraTokensToLibrary(settings);
  let library = normalizeLoraLibrary(normalized.loraLibrary);
  if (options?.activeOnly) {
    const sessionIds =
      options.sessionActiveLoraIds !== undefined
        ? options.sessionActiveLoraIds
        : resolveSharedEffectiveSessionLoraIds(options.model);
    library = applySessionLoraSelection(library, sessionIds).filter(
      entry => entry.enabled !== false || isLightningLibraryEntry(entry)
    );
  }
  const manualTokens = (normalized.customTokens ?? []).filter(
    entry => !parseLoraTokenId(entry.token)
  );
  const loraTokens: CustomWorkflowToken[] = library
    .filter(entry => entry.id.trim())
    .map(entry => ({
      token: `{{LORA_${entry.id.trim()}}}`,
      value: entry.tokenValue,
    }));

  return {
    ...normalized,
    loraLibrary: normalizeLoraLibrary(normalized.loraLibrary),
    customTokens: [...manualTokens, ...loraTokens],
  };
}

/** Keep Settings → LoRA library in sync when a workflow sets {{LORA_LIGHTNING}}. */
export function syncLightningLoraLibraryEntry(filename: string): void {
  const trimmed = filename.trim();
  if (!trimmed || typeof window === 'undefined') {
    return;
  }

  const settings = loadComfyUiSettings();
  const library = [...(settings.loraLibrary ?? [])];
  const existingIndex = library.findIndex(entry => entry.id.trim().toUpperCase() === 'LIGHTNING');
  if (existingIndex >= 0) {
    if (library[existingIndex]!.tokenValue.trim() === trimmed) {
      return;
    }
    library[existingIndex] = {
      ...library[existingIndex]!,
      tokenValue: trimmed,
      label: library[existingIndex]!.label.trim() || 'Lightning',
    };
  } else {
    library.push({
      id: 'LIGHTNING',
      label: 'Lightning',
      triggerPhrase: '',
      tokenValue: trimmed,
      strengthModel: 1,
      strengthClip: 1,
      enabled: true,
    });
  }
  saveComfyUiSettings({
    ...settings,
    loraLibrary: library,
  });
}

const LEGACY_SETTINGS_KEYS = ['comfyui-settings-v3', 'comfyui-settings-v2', 'comfyui-settings-v1'];

function migrateLegacySettings(
  parsed: Partial<ComfyUiSettings & { positiveNodeId?: string; negativeNodeId?: string }>
): ComfyUiSettings {
  try {
    return {
      ...DEFAULT_COMFYUI_SETTINGS,
      useServerDefaults: parsed.useServerDefaults ?? true,
      apiUrl: parsed.apiUrl ?? '',
      positiveToken: parsed.positiveToken ?? DEFAULT_POSITIVE_TOKEN,
      negativeToken: parsed.negativeToken ?? DEFAULT_NEGATIVE_TOKEN,
      workflowJson: parsed.workflowJson ?? '',
      queueParams: parsed.queueParams ?? DEFAULT_COMFYUI_SETTINGS.queueParams,
      customTokens: parsed.customTokens ?? [],
      loraLibrary: normalizeLoraLibrary(parsed.loraLibrary),
      notifyOnComplete: parsed.notifyOnComplete ?? false,
      autoVisionTags: parsed.autoVisionTags ?? true,
    };
  } catch {
    return DEFAULT_COMFYUI_SETTINGS;
  }
}

export function loadComfyUiSettings(): ComfyUiSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_COMFYUI_SETTINGS;
  }

  try {
    const current = readBrowserValue<Partial<ComfyUiSettings>>(COMFYUI_SETTINGS_KEY);
    if (current) {
      const migrated = migrateOrphanLoraTokensToLibrary({
        ...DEFAULT_COMFYUI_SETTINGS,
        ...current,
      });
      return {
        ...migrated,
        loraLibrary: normalizeLoraLibrary(migrated.loraLibrary),
      };
    }

    for (const legacyKey of LEGACY_SETTINGS_KEYS) {
      const legacy =
        readBrowserValue<
          Partial<ComfyUiSettings & { positiveNodeId?: string; negativeNodeId?: string }>
        >(legacyKey);
      if (legacy) {
        const migrated = migrateLegacySettings(legacy);
        saveComfyUiSettings(migrated);
        return migrated;
      }
    }

    return DEFAULT_COMFYUI_SETTINGS;
  } catch {
    return DEFAULT_COMFYUI_SETTINGS;
  }
}

export function saveComfyUiSettings(settings: ComfyUiSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized: ComfyUiSettings = {
    ...settings,
    loraLibrary: normalizeLoraLibrary(settings.loraLibrary),
  };
  writeBrowserValue(COMFYUI_SETTINGS_KEY, normalized);
  for (const legacyKey of LEGACY_SETTINGS_KEYS) {
    removeBrowserKey(legacyKey);
  }
}

export function resetComfyUiSettings(): void {
  if (typeof window === 'undefined') {
    return;
  }

  removeBrowserKey(COMFYUI_SETTINGS_KEY);
  for (const legacyKey of LEGACY_SETTINGS_KEYS) {
    removeBrowserKey(legacyKey);
  }
}

export function comfyUiSettingsToRuntime(
  settings: ComfyUiSettings,
  options?: {
    sessionActiveLoraIds?: string[];
    sessionLoraStrengthOverrides?: import('./lora-stack').SessionLoraStrengthOverrides;
    model?: string;
  }
): ComfyUiRuntimeConfig | undefined {
  // LoRA library lives in browser settings — always merge into custom tokens so
  // server preview/queue can resolve {{LORA_LIGHTNING}} even with useServerDefaults.
  // Queue/preview only substitute session-active (or Settings-enabled) LoRAs so
  // deselected catalog entries cannot still resolve into the graph.
  const sessionActiveLoraIds =
    options?.sessionActiveLoraIds !== undefined
      ? options.sessionActiveLoraIds
      : resolveSharedEffectiveSessionLoraIds(options?.model);
  const merged = mergeLoraLibraryIntoCustomTokens(settings, {
    activeOnly: true,
    sessionActiveLoraIds,
    model: options?.model,
  });
  const customTokens = merged.customTokens?.length ? merged.customTokens : undefined;
  // Strengths/enabled/order can't be encoded as {{LORA_*}} custom tokens — forward the
  // normalized library itself so queue-time LoRA stacking survives the client→server hop.
  // Session sidebar picks override Settings enabled flags when set;
  // otherwise the per-model LoRA map applies when present.
  const loraLibrary = applySessionLoraStrengthOverrides(
    applySessionLoraSelection(settings.loraLibrary, sessionActiveLoraIds),
    options?.sessionLoraStrengthOverrides ??
      resolveSharedEffectiveSessionLoraStrengthOverrides(options?.model)
  );

  if (settings.useServerDefaults) {
    return stripEmptyComfyUiRuntime({
      customTokens,
      queueParams: settings.queueParams,
      loraLibrary,
    });
  }

  return stripEmptyComfyUiRuntime({
    apiUrl: settings.apiUrl,
    workflowJson: settings.workflowJson,
    loraLibrary,
    positiveToken:
      settings.positiveToken === DEFAULT_POSITIVE_TOKEN ? undefined : settings.positiveToken,
    negativeToken:
      settings.negativeToken === DEFAULT_NEGATIVE_TOKEN ? undefined : settings.negativeToken,
    queueParams: settings.queueParams,
    customTokens,
  });
}

export function placeholderTokensFromSettings(
  settings: ComfyUiSettings
): WorkflowPlaceholderTokens {
  return {
    positive: settings.positiveToken?.trim() || DEFAULT_POSITIVE_TOKEN,
    negative: settings.negativeToken?.trim() || DEFAULT_NEGATIVE_TOKEN,
    seed: DEFAULT_SEED_TOKEN,
    width: DEFAULT_WIDTH_TOKEN,
    height: DEFAULT_HEIGHT_TOKEN,
    cfg: DEFAULT_CFG_TOKEN,
    steps: DEFAULT_STEPS_TOKEN,
    sampler: DEFAULT_SAMPLER_TOKEN,
    scheduler: DEFAULT_SCHEDULER_TOKEN,
    shift: DEFAULT_SHIFT_TOKEN,
    fluxMaxShift: DEFAULT_FLUX_MAX_SHIFT_TOKEN,
    fluxBaseShift: DEFAULT_FLUX_BASE_SHIFT_TOKEN,
    denoise: DEFAULT_DENOISE_TOKEN,
    inputImage: DEFAULT_INPUT_IMAGE_TOKEN,
    maskImage: DEFAULT_MASK_IMAGE_TOKEN,
    initImage: DEFAULT_INIT_IMAGE_TOKEN,
    videoFrames: DEFAULT_VIDEO_FRAMES_TOKEN,
    videoFps: DEFAULT_VIDEO_FPS_TOKEN,
  };
}
