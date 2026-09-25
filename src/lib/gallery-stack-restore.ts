import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import type { ComfyImageModel } from './comfy-models/client';
import {
  normalizeComposeIdentityKind,
  normalizeComposeIdentityLockStrength,
} from './compose-identity-lock';
import { normalizeSessionLoraStrengthOverrides } from './lora-stack';
import {
  setSessionLoraIdsForModel,
  setSessionLoraStrengthOverridesForModel,
} from './model-lora-map';
import { inferResolutionOrientationAndTier } from './model-resolution-defaults';
import { pickModelSamplerOverrideFields } from './model-sampler-defaults';
import { normalizeQueueQualityProfile } from './queue-quality-profile';
import { loadSettingsCache, saveSharedSettings, type SharedToolSettings } from './settings-cache';
import { buildSessionRecipeFromShared, pushSessionRecipe } from './session-recipes';
import { embeddingStem } from './textual-inversion';
import { saveGenerateHandoff } from './generate-handoff';
import { isGalleryCapKeeper } from './gallery-cap';
import { galleryToolHrefForEntry, galleryToolLabel } from './gallery-tool-href';

export function parseEmbeddingTokensFromPrompt(prompt?: string): string[] {
  if (!prompt?.trim()) {
    return [];
  }
  const stems: string[] = [];
  const pattern = /\bembedding:([^\s,]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(prompt)) !== null) {
    stems.push(match[1] ?? '');
  }
  return normalizeSessionEmbeddingTokens(stems);
}

function resolveEntryEmbeddingTokens(
  entry: Partial<Pick<ComfyGalleryEntry, 'sessionEmbeddingTokens' | 'prompt'>>
): string[] | undefined {
  const stored =
    entry.sessionEmbeddingTokens !== undefined
      ? normalizeSessionEmbeddingTokens(entry.sessionEmbeddingTokens)
      : undefined;
  if (stored && stored.length > 0) {
    return stored;
  }
  const parsed = parseEmbeddingTokensFromPrompt(entry.prompt);
  if (parsed.length > 0) {
    return parsed;
  }
  return stored;
}

export function normalizeSessionEmbeddingTokens(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const entry of value) {
    const stem = typeof entry === 'string' ? embeddingStem(entry) : '';
    const key = stem.toLowerCase();
    if (!stem || seen.has(key)) {
      continue;
    }
    seen.add(key);
    tokens.push(stem);
    if (tokens.length >= 32) {
      break;
    }
  }
  return tokens;
}

export type GalleryStackRestoreFields = Partial<
  Pick<
    ComfyGalleryEntry,
    | 'model'
    | 'sessionActiveLoraIds'
    | 'sessionLoraStrengthOverrides'
    | 'sessionEmbeddingTokens'
    | 'queueQualityProfile'
    | 'queueParams'
    | 'prompt'
  >
> & { comfyUrl?: string };

export function galleryEntryHasRestorableStack(entry: GalleryStackRestoreFields): boolean {
  if (entry.model?.trim()) {
    return true;
  }
  if (entry.sessionActiveLoraIds !== undefined) {
    return true;
  }
  if (
    entry.sessionLoraStrengthOverrides &&
    Object.keys(entry.sessionLoraStrengthOverrides).length > 0
  ) {
    return true;
  }
  if (resolveEntryEmbeddingTokens(entry)?.length) {
    return true;
  }
  if (entry.queueQualityProfile) {
    return true;
  }
  if (entry.queueParams?.ipAdapterImageFilename?.trim()) {
    return true;
  }
  const params = entry.queueParams;
  if (parseQueueDim(params?.width) && parseQueueDim(params?.height)) {
    return true;
  }
  return Object.keys(pickModelSamplerOverrideFields(params)).length > 0;
}

export function formatGalleryStackRestoreSummary(entry: GalleryStackRestoreFields): string {
  const parts: string[] = [];
  if (entry.model?.trim()) {
    parts.push(entry.model.trim());
  }
  if (entry.queueQualityProfile) {
    parts.push(normalizeQueueQualityProfile(entry.queueQualityProfile));
  }
  if (entry.sessionActiveLoraIds !== undefined) {
    parts.push(`${entry.sessionActiveLoraIds.length} LoRAs`);
  }
  const embeddings = resolveEntryEmbeddingTokens(entry);
  if (embeddings?.length) {
    parts.push(`${embeddings.length} embeddings`);
  }
  if (entry.queueParams?.ipAdapterImageFilename?.trim()) {
    parts.push('identity');
  }
  const width = parseQueueDim(entry.queueParams?.width);
  const height = parseQueueDim(entry.queueParams?.height);
  if (width && height) {
    parts.push(`${width}×${height}`);
  }
  const samplerName = entry.queueParams?.samplerName?.toString().trim();
  if (samplerName) {
    parts.push(samplerName);
  }
  return parts.join(' · ');
}

function parseQueueDim(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(typeof value === 'string' ? value : NaN);
  if (!Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  return Math.round(n);
}

/** Merge a still's Generate stack onto shared settings. Does not touch workflowJson. */
export function applyGalleryStackToShared<T extends SharedToolSettings>(
  shared: T,
  entry: GalleryStackRestoreFields
): T {
  const model = entry.model?.trim();
  let next: T = { ...shared };

  if (model) {
    next = { ...next, model: model as ComfyImageModel };
  }

  if (entry.queueQualityProfile) {
    next = {
      ...next,
      queueQualityProfile: normalizeQueueQualityProfile(entry.queueQualityProfile),
    };
  }

  const targetModel = (model || next.model) as ComfyImageModel;
  if (entry.sessionActiveLoraIds !== undefined) {
    const ids = entry.sessionActiveLoraIds
      .map(id => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean)
      .slice(0, 32);
    next = {
      ...next,
      sessionActiveLoraIds: ids,
      sessionActiveLoraIdsByModel: setSessionLoraIdsForModel(
        next.sessionActiveLoraIdsByModel,
        targetModel,
        ids
      ),
    };
  }

  if (entry.sessionLoraStrengthOverrides) {
    const normalized = normalizeSessionLoraStrengthOverrides(entry.sessionLoraStrengthOverrides);
    next = {
      ...next,
      sessionLoraStrengthOverrides: normalized,
      sessionLoraStrengthOverridesByModel: setSessionLoraStrengthOverridesForModel(
        next.sessionLoraStrengthOverridesByModel,
        targetModel,
        normalized
      ),
    };
  }

  const embeddings = resolveEntryEmbeddingTokens(entry);
  if (embeddings !== undefined) {
    next = {
      ...next,
      sessionEmbeddingTokens: embeddings,
    };
  }

  const identityFilename = entry.queueParams?.ipAdapterImageFilename?.trim();
  if (identityFilename) {
    const stack = (entry.queueParams?.ipAdapterImageFilenames ?? [])
      .map(name => name?.trim())
      .filter(Boolean) as string[];
    const identityHost = typeof entry.comfyUrl === 'string' ? entry.comfyUrl.trim() : '';
    next = {
      ...next,
      ipAdapterImageFilename: identityFilename,
      ipAdapterImageFilenames: stack.length > 0 ? stack : [identityFilename],
      ipAdapterStrength:
        entry.queueParams?.ipAdapterStrength != null
          ? normalizeComposeIdentityLockStrength(entry.queueParams.ipAdapterStrength)
          : next.ipAdapterStrength,
      identityKind: entry.queueParams?.identityKind
        ? normalizeComposeIdentityKind(entry.queueParams.identityKind)
        : next.identityKind,
      ...(identityHost ? { ipAdapterComfyUrl: identityHost } : {}),
    };
  }

  const sampler = pickModelSamplerOverrideFields(entry.queueParams);
  if (Object.keys(sampler).length > 0) {
    next = {
      ...next,
      modelSamplerOverrides: {
        ...next.modelSamplerOverrides,
        ...sampler,
      },
    };
  }

  const width = parseQueueDim(entry.queueParams?.width);
  const height = parseQueueDim(entry.queueParams?.height);
  if (width && height) {
    const inferred = inferResolutionOrientationAndTier(targetModel, width, height);
    if (inferred) {
      next = {
        ...next,
        modelResolutionOrientation: inferred.orientation,
        modelResolutionSizeTier: inferred.sizeTier,
      };
    }
  }

  return next;
}

/** Newest 4–5★ / favorite completed still that can restore a session stack. */
export function pickKeeperStackEntry(entries: ComfyGalleryEntry[]): ComfyGalleryEntry | null {
  const keepers = entries.filter(
    entry =>
      entry.status === 'completed' &&
      isGalleryCapKeeper(entry) &&
      galleryEntryHasRestorableStack(entry)
  );
  keepers.sort((a, b) => (b.completedAt ?? b.queuedAt ?? 0) - (a.completedAt ?? a.queuedAt ?? 0));
  return keepers[0] ?? null;
}

/** Persist the still's stack onto shared session settings and toast. */
export function applyGalleryStackToSession(
  entry: ComfyGalleryEntry,
  options?: { toast?: boolean; notify?: boolean }
): {
  applied: boolean;
  summary: string;
} {
  if (typeof window === 'undefined') {
    return { applied: false, summary: '' };
  }
  const next = applyGalleryStackToShared(loadSettingsCache().shared, entry);
  saveSharedSettings(next, { notify: options?.notify !== false });
  const summary = formatGalleryStackRestoreSummary(entry);
  const href = galleryToolHrefForEntry(entry);
  const toolLabel = galleryToolLabel(entry.tool);
  if (options?.toast !== false) {
    void import('./app-toast').then(({ pushAppToast }) => {
      pushAppToast({
        text: summary ? `Stack on ${toolLabel} · ${summary}` : `Stack restored on ${toolLabel}`,
        href,
      });
    });
  }
  if (entry.queueParams?.ipAdapterImageFilename?.trim()) {
    void import('./gallery-identity-lock').then(
      ({ applyGalleryFaceToSession, galleryEntryCanLockFace }) => {
        if (!galleryEntryCanLockFace(entry)) {
          return;
        }
        void applyGalleryFaceToSession(entry, { toast: false });
      }
    );
  }
  return { applied: true, summary };
}

/** Restore the still's stack and hand the prompt/negative to Generate. */
export function applyGalleryPromptAndStackToSession(entry: ComfyGalleryEntry): {
  applied: boolean;
  summary: string;
} {
  const stack = applyGalleryStackToSession(entry);
  if (entry.prompt?.trim()) {
    saveGenerateHandoff({
      prompt: entry.prompt,
      negativePrompt: entry.negativePrompt,
      savedAt: Date.now(),
    });
  }
  return stack;
}

export function galleryEntryCanSaveLook(
  entry: Pick<ComfyGalleryEntry, 'status' | 'reviewRating' | 'model'>
): boolean {
  return (
    entry.status === 'completed' && (entry.reviewRating ?? 0) >= 4 && Boolean(entry.model?.trim())
  );
}

/** Save a named Generate look from a 4–5★ still (session recipe, not a new tab). */
export function saveGalleryLookFromEntry(entry: ComfyGalleryEntry): {
  ok: boolean;
  label?: string;
  error?: string;
} {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'Browser only.' };
  }
  if (!galleryEntryCanSaveLook(entry)) {
    return { ok: false, error: 'Rate 4–5★ to save a look.' };
  }
  const shared = applyGalleryStackToShared(loadSettingsCache().shared, entry);
  const stamp = new Date();
  const date = `${stamp.getMonth() + 1}/${stamp.getDate()}`;
  const label = `Look · ${entry.model?.trim() ?? 'session'} · ${date}`.slice(0, 48);
  const recipe = buildSessionRecipeFromShared({
    shared,
    toolId: 'generate',
    label,
  });
  pushSessionRecipe(recipe);
  void import('./app-toast').then(({ pushAppToast }) => {
    pushAppToast({
      text: `Saved look · ${recipe.label}`,
    });
  });
  return { ok: true, label: recipe.label };
}
