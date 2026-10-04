import { readBrowserValue, writeBrowserValue } from './browser-storage';
import { type ComfyImageModel } from './comfy-models/client';
import {
  normalizeModelSamplerPresetTier,
  pickModelSamplerOverrideFields,
  type ModelSamplerOverrideFields,
  type ModelSamplerPresetTier,
} from './model-sampler-defaults';
import {
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  type ResolutionOrientation,
  type ResolutionSizeTier,
} from './model-resolution-defaults';
import {
  normalizeSessionLoraStrengthOverrides,
  type SessionLoraStrengthOverrides,
} from './lora-stack';
import {
  resolveEffectiveSessionLoraStrengthOverrides,
  setSessionLoraIdsForModel,
  setSessionLoraStrengthOverridesForModel,
} from './model-lora-map';
import { normalizeQueueQualityProfile, type QueueQualityProfile } from './queue-quality-profile';
import {
  normalizeComposeIdentityKind,
  normalizeComposeIdentityLockStrength,
  type ComposeIdentityKind,
} from './compose-identity-lock';
import { embeddingStem } from './textual-inversion';

export const SESSION_RECIPES_KEY = 'comfy-prompt-session-recipes-v1';
export const SESSION_RECIPES_UPDATED_EVENT = 'session-recipes-updated';
export const MAX_SESSION_RECIPES = 20;

export type SessionRecipeShared = {
  model: ComfyImageModel;
  queueQualityProfile?: QueueQualityProfile;
  sessionQueueMode?: 'iterate' | 'keeper' | 'off';
  sessionActiveLoraIds?: string[];
  sessionLoraStrengthOverrides?: SessionLoraStrengthOverrides;
  modelSamplerPreset?: ModelSamplerPresetTier;
  modelSamplerOverrides?: ModelSamplerOverrideFields;
  modelResolutionOrientation?: ResolutionOrientation;
  modelResolutionSizeTier?: ResolutionSizeTier;
  editDenoiseStrength?: number;
  sessionEmbeddingTokens?: string[];
  ipAdapterImageFilename?: string;
  ipAdapterImageFilenames?: string[];
  ipAdapterComfyUrl?: string;
  ipAdapterStrength?: number;
  identityKind?: ComposeIdentityKind;
};

export type SessionRecipe = {
  id: string;
  label: string;
  savedAt: number;
  toolId?: string;
  shared: SessionRecipeShared;
};

function normalizeSessionMode(value: unknown): 'iterate' | 'keeper' | 'off' | undefined {
  if (value === 'iterate' || value === 'keeper' || value === 'off') {
    return value;
  }
  return undefined;
}

function pickSessionLookFields(
  sharedRaw: Record<string, unknown>
): Pick<
  SessionRecipeShared,
  | 'sessionEmbeddingTokens'
  | 'ipAdapterImageFilename'
  | 'ipAdapterImageFilenames'
  | 'ipAdapterComfyUrl'
  | 'ipAdapterStrength'
  | 'identityKind'
> {
  const tokens = Array.isArray(sharedRaw.sessionEmbeddingTokens)
    ? sharedRaw.sessionEmbeddingTokens
        .map(entry => (typeof entry === 'string' ? embeddingStem(entry) : ''))
        .filter(Boolean)
        .slice(0, 32)
    : undefined;
  const filename =
    typeof sharedRaw.ipAdapterImageFilename === 'string'
      ? sharedRaw.ipAdapterImageFilename.trim()
      : '';
  const stack = Array.isArray(sharedRaw.ipAdapterImageFilenames)
    ? sharedRaw.ipAdapterImageFilenames
        .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
        .slice(0, 4)
    : undefined;
  return {
    ...(tokens?.length ? { sessionEmbeddingTokens: tokens } : {}),
    ...(filename ? { ipAdapterImageFilename: filename } : {}),
    ...(stack?.length ? { ipAdapterImageFilenames: stack } : {}),
    ...(typeof sharedRaw.ipAdapterComfyUrl === 'string' && sharedRaw.ipAdapterComfyUrl.trim()
      ? { ipAdapterComfyUrl: sharedRaw.ipAdapterComfyUrl.trim() }
      : {}),
    ...(sharedRaw.ipAdapterStrength != null
      ? { ipAdapterStrength: normalizeComposeIdentityLockStrength(sharedRaw.ipAdapterStrength) }
      : {}),
    ...(sharedRaw.identityKind
      ? { identityKind: normalizeComposeIdentityKind(sharedRaw.identityKind) }
      : {}),
  };
}

export function normalizeSessionRecipe(value: unknown): SessionRecipe | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim().slice(0, 64) : '';
  if (!id) {
    return null;
  }
  const sharedRaw =
    record.shared && typeof record.shared === 'object'
      ? (record.shared as Record<string, unknown>)
      : null;
  if (!sharedRaw) {
    return null;
  }
  const modelRaw = typeof sharedRaw.model === 'string' ? sharedRaw.model.trim() : '';
  if (!modelRaw || modelRaw.length > 64) {
    return null;
  }
  const label =
    typeof record.label === 'string' && record.label.trim()
      ? record.label.trim().slice(0, 48)
      : 'Session';
  const savedAt = Number(record.savedAt);
  const loraIds = Array.isArray(sharedRaw.sessionActiveLoraIds)
    ? sharedRaw.sessionActiveLoraIds
        .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
        .slice(0, 32)
    : undefined;
  const denoise = Number(sharedRaw.editDenoiseStrength);
  const loraOverrides = resolveEffectiveSessionLoraStrengthOverrides(
    modelRaw,
    sharedRaw.sessionLoraStrengthOverrides as SessionLoraStrengthOverrides | undefined,
    sharedRaw.sessionLoraStrengthOverridesByModel as
      import('./model-lora-map').SessionLoraStrengthOverridesByModel | undefined
  );
  return {
    id,
    label,
    savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
    toolId:
      typeof record.toolId === 'string' && record.toolId.trim()
        ? record.toolId.trim().slice(0, 32)
        : undefined,
    shared: {
      model: modelRaw as ComfyImageModel,
      queueQualityProfile: sharedRaw.queueQualityProfile
        ? normalizeQueueQualityProfile(sharedRaw.queueQualityProfile)
        : undefined,
      sessionQueueMode: normalizeSessionMode(sharedRaw.sessionQueueMode),
      sessionActiveLoraIds: loraIds,
      ...(Object.keys(loraOverrides).length > 0
        ? { sessionLoraStrengthOverrides: loraOverrides }
        : {}),
      modelSamplerPreset: sharedRaw.modelSamplerPreset
        ? normalizeModelSamplerPresetTier(sharedRaw.modelSamplerPreset)
        : undefined,
      ...(Object.keys(
        pickModelSamplerOverrideFields(
          sharedRaw.modelSamplerOverrides as ModelSamplerOverrideFields | undefined
        )
      ).length > 0
        ? {
            modelSamplerOverrides: pickModelSamplerOverrideFields(
              sharedRaw.modelSamplerOverrides as ModelSamplerOverrideFields | undefined
            ),
          }
        : {}),
      modelResolutionOrientation: sharedRaw.modelResolutionOrientation
        ? normalizeResolutionOrientation(sharedRaw.modelResolutionOrientation)
        : undefined,
      modelResolutionSizeTier: sharedRaw.modelResolutionSizeTier
        ? normalizeResolutionSizeTier(sharedRaw.modelResolutionSizeTier)
        : undefined,
      editDenoiseStrength:
        Number.isFinite(denoise) && denoise >= 0.05 && denoise <= 1
          ? Math.round(denoise * 100) / 100
          : undefined,
      ...pickSessionLookFields(sharedRaw),
    },
  };
}

export function loadSessionRecipes(): SessionRecipe[] {
  const raw = readBrowserValue<unknown>(SESSION_RECIPES_KEY) ?? [];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map(entry => normalizeSessionRecipe(entry))
    .filter((entry): entry is SessionRecipe => Boolean(entry))
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_SESSION_RECIPES);
}

export function saveSessionRecipes(recipes: SessionRecipe[]): void {
  writeBrowserValue(
    SESSION_RECIPES_KEY,
    recipes
      .map(entry => normalizeSessionRecipe(entry))
      .filter((entry): entry is SessionRecipe => Boolean(entry))
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, MAX_SESSION_RECIPES)
  );
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_RECIPES_UPDATED_EVENT));
  }
}

export function buildSessionRecipeFromShared(input: {
  shared: SessionRecipeShared & Record<string, unknown>;
  toolId?: string;
  label?: string;
}): SessionRecipe {
  const stamp = Date.now();
  const tool = input.toolId?.trim();
  const label = input.label?.trim() || (tool ? `Session · ${tool}` : 'Session snapshot');
  const loraOverrides = resolveEffectiveSessionLoraStrengthOverrides(
    input.shared.model,
    input.shared.sessionLoraStrengthOverrides,
    input.shared.sessionLoraStrengthOverridesByModel as
      import('./model-lora-map').SessionLoraStrengthOverridesByModel | undefined
  );
  return {
    id: `session-${stamp.toString(36)}`,
    label: label.slice(0, 48),
    savedAt: stamp,
    toolId: tool || undefined,
    shared: {
      model: input.shared.model,
      queueQualityProfile: input.shared.queueQualityProfile
        ? normalizeQueueQualityProfile(input.shared.queueQualityProfile)
        : undefined,
      sessionQueueMode: normalizeSessionMode(input.shared.sessionQueueMode),
      sessionActiveLoraIds: Array.isArray(input.shared.sessionActiveLoraIds)
        ? input.shared.sessionActiveLoraIds
            .map(id => id.trim())
            .filter(Boolean)
            .slice(0, 32)
        : undefined,
      ...(Object.keys(loraOverrides).length > 0
        ? { sessionLoraStrengthOverrides: loraOverrides }
        : {}),
      modelSamplerPreset: input.shared.modelSamplerPreset
        ? normalizeModelSamplerPresetTier(input.shared.modelSamplerPreset)
        : undefined,
      ...(Object.keys(pickModelSamplerOverrideFields(input.shared.modelSamplerOverrides)).length > 0
        ? {
            modelSamplerOverrides: pickModelSamplerOverrideFields(
              input.shared.modelSamplerOverrides
            ),
          }
        : {}),
      modelResolutionOrientation: input.shared.modelResolutionOrientation
        ? normalizeResolutionOrientation(input.shared.modelResolutionOrientation)
        : undefined,
      modelResolutionSizeTier: input.shared.modelResolutionSizeTier
        ? normalizeResolutionSizeTier(input.shared.modelResolutionSizeTier)
        : undefined,
      editDenoiseStrength:
        typeof input.shared.editDenoiseStrength === 'number' &&
        Number.isFinite(input.shared.editDenoiseStrength)
          ? input.shared.editDenoiseStrength
          : undefined,
      ...pickSessionLookFields(input.shared),
    },
  };
}

/** Prepend a snapshot; drops oldest past the cap. */
export function pushSessionRecipe(recipe: SessionRecipe): SessionRecipe[] {
  const next = [recipe, ...loadSessionRecipes().filter(entry => entry.id !== recipe.id)].slice(
    0,
    MAX_SESSION_RECIPES
  );
  saveSessionRecipes(next);
  if (typeof window !== 'undefined') {
    void import('./webhook-settings').then(({ dispatchWebhook }) => {
      void dispatchWebhook({
        event: 'session.recipe.saved',
        tool: recipe.toolId,
        model: recipe.shared.model,
        completedAt: Date.now(),
        message: recipe.label,
      });
    });
  }
  return next;
}

export function deleteSessionRecipe(id: string): SessionRecipe[] {
  const next = loadSessionRecipes().filter(entry => entry.id !== id);
  saveSessionRecipes(next);
  return next;
}

/** Merge session snapshot fields onto shared settings. */
export function applySessionRecipeShared<T extends SessionRecipeShared>(
  shared: T,
  recipe: SessionRecipe
): T {
  const snap = recipe.shared;
  let next: T = {
    ...shared,
    model: snap.model,
    ...(snap.queueQualityProfile ? { queueQualityProfile: snap.queueQualityProfile } : {}),
    ...(snap.sessionQueueMode ? { sessionQueueMode: snap.sessionQueueMode } : {}),
    ...(snap.modelSamplerPreset ? { modelSamplerPreset: snap.modelSamplerPreset } : {}),
    ...(Object.keys(pickModelSamplerOverrideFields(snap.modelSamplerOverrides)).length > 0
      ? { modelSamplerOverrides: pickModelSamplerOverrideFields(snap.modelSamplerOverrides) }
      : {}),
    ...(snap.modelResolutionOrientation
      ? { modelResolutionOrientation: snap.modelResolutionOrientation }
      : {}),
    ...(snap.modelResolutionSizeTier
      ? { modelResolutionSizeTier: snap.modelResolutionSizeTier }
      : {}),
    ...(snap.editDenoiseStrength != null ? { editDenoiseStrength: snap.editDenoiseStrength } : {}),
  };
  if (snap.sessionActiveLoraIds) {
    next = {
      ...next,
      sessionActiveLoraIds: snap.sessionActiveLoraIds,
      sessionActiveLoraIdsByModel: setSessionLoraIdsForModel(
        (
          shared as {
            sessionActiveLoraIdsByModel?: import('./model-lora-map').SessionActiveLoraIdsByModel;
          }
        ).sessionActiveLoraIdsByModel,
        snap.model,
        snap.sessionActiveLoraIds
      ),
    };
  }
  if (snap.sessionLoraStrengthOverrides) {
    const normalized = normalizeSessionLoraStrengthOverrides(snap.sessionLoraStrengthOverrides);
    next = {
      ...next,
      sessionLoraStrengthOverrides: normalized,
      sessionLoraStrengthOverridesByModel: setSessionLoraStrengthOverridesForModel(
        (
          shared as {
            sessionLoraStrengthOverridesByModel?: import('./model-lora-map').SessionLoraStrengthOverridesByModel;
          }
        ).sessionLoraStrengthOverridesByModel,
        snap.model,
        normalized
      ),
    };
  }
  if (snap.sessionEmbeddingTokens) {
    next = { ...next, sessionEmbeddingTokens: snap.sessionEmbeddingTokens };
  }
  if (snap.ipAdapterImageFilename) {
    next = {
      ...next,
      ipAdapterImageFilename: snap.ipAdapterImageFilename,
      ipAdapterImageFilenames: snap.ipAdapterImageFilenames?.length
        ? snap.ipAdapterImageFilenames
        : [snap.ipAdapterImageFilename],
      // Restored, not picked: from the look when it shows one (identity-lock-look.ts).
      ipAdapterSource: undefined,
      ...(snap.ipAdapterComfyUrl ? { ipAdapterComfyUrl: snap.ipAdapterComfyUrl } : {}),
      ...(snap.ipAdapterStrength != null ? { ipAdapterStrength: snap.ipAdapterStrength } : {}),
      ...(snap.identityKind ? { identityKind: snap.identityKind } : {}),
    };
  }
  return next;
}

export function formatSessionRecipeSubtitle(recipe: SessionRecipe): string {
  const parts = [recipe.shared.model];
  if (recipe.shared.queueQualityProfile) {
    parts.push(recipe.shared.queueQualityProfile);
  }
  if (recipe.shared.sessionActiveLoraIds) {
    parts.push(`${recipe.shared.sessionActiveLoraIds.length} LoRAs`);
  }
  if (recipe.shared.sessionLoraStrengthOverrides) {
    const tuned = Object.keys(recipe.shared.sessionLoraStrengthOverrides).length;
    if (tuned > 0) {
      parts.push(`${tuned} tuned`);
    }
  }
  if (recipe.shared.sessionEmbeddingTokens?.length) {
    parts.push(`${recipe.shared.sessionEmbeddingTokens.length} embeddings`);
  }
  if (recipe.shared.ipAdapterImageFilename) {
    parts.push('identity');
  }
  if (recipe.toolId) {
    parts.push(recipe.toolId);
  }
  return parts.join(' · ');
}

/** Newest Generate look — `toolId === 'generate'` or a `Look ·` label. Recipes are newest-first. */
export function latestGenerateLookRecipe(): SessionRecipe | null {
  for (const recipe of loadSessionRecipes()) {
    if (recipe.toolId === 'generate' || recipe.label.startsWith('Look ·')) {
      return recipe;
    }
  }
  return null;
}
