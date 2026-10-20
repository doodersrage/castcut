import { COMFY_MODEL_IDS, type ComfyImageModel } from '../comfy-models/client';
import type { WorkflowParamValues } from '../comfyui/config';
import type { SessionLoraStrengthOverrides } from '../lora/stack';
import { normalizeSessionLoraStrengthOverrides } from '../lora/stack';
import { normalizeQueueQualityProfile, type QueueQualityProfile } from '../queue/quality-profile';
import { toolQueueQualityLabel } from './tool-quality-profiles';

export type ToolQualityRecipe = {
  id: string;
  label: string;
  /** Tool ids this recipe targets; empty / omit = any tool. */
  toolIds?: string[];
  model?: ComfyImageModel;
  queueQualityProfile: QueueQualityProfile;
  /** When set, replaces session LoRA picks. Omit to leave the stack alone. */
  sessionActiveLoraIds?: string[];
  sessionLoraStrengthOverrides?: SessionLoraStrengthOverrides;
  editDenoiseStrength?: number;
  /** Built-in seeds are merged on load; user recipes with the same id win. */
  builtin?: boolean;
};

/** Shared settings slice recipes may write (avoids importing settings-cache). */
export type ToolQualityRecipeSharedSlice = {
  model: ComfyImageModel;
  queueQualityProfile?: QueueQualityProfile;
  sessionQueueMode?: 'iterate' | 'keeper' | 'off';
  sessionActiveLoraIds?: string[];
  sessionLoraStrengthOverrides?: SessionLoraStrengthOverrides;
  editDenoiseStrength?: number;
  toolQueueQualityProfiles?: Partial<Record<string, QueueQualityProfile>>;
};

export const MAX_USER_TOOL_QUALITY_RECIPES = 24;

/** Seed recipes — merged into settings; user copies with same id override. */
export const SUGGESTED_TOOL_QUALITY_RECIPES: ToolQualityRecipe[] = [
  {
    id: 'compose-keeper',
    label: 'Compose keeper',
    toolIds: ['compose'],
    // No engine pinned: Compose keeps its own (Qwen-Image 2.1 Turbo when installed, else Edit
    // 2511 — composeDefaultModel); the recipe sets the quality.
    queueQualityProfile: 'final',
    builtin: true,
  },
  {
    id: 'compose-draft',
    label: 'Compose draft',
    toolIds: ['compose'],
    queueQualityProfile: 'draft',
    builtin: true,
  },
  {
    id: 'refine-keeper',
    label: 'Refine keeper',
    toolIds: ['refine'],
    queueQualityProfile: 'final',
    builtin: true,
  },
  {
    id: 'outpaint-keeper',
    label: 'Outpaint keeper',
    toolIds: ['outpaint'],
    model: 'flux-inpaint',
    queueQualityProfile: 'final',
    editDenoiseStrength: 0.85,
    builtin: true,
  },
  {
    id: 'generate-iterate',
    label: 'Generate iterate',
    toolIds: ['generate'],
    queueQualityProfile: 'draft',
    builtin: true,
  },
  {
    id: 'nsfw-generator-rapid',
    label: 'Adult Rapid AIO',
    toolIds: ['nsfw-generator'],
    model: 'qwen-rapid-aio-nsfw',
    queueQualityProfile: 'draft',
    builtin: true,
  },
  {
    id: 'nsfw-generator-keeper-rapid',
    label: 'Adult Rapid keeper',
    toolIds: ['nsfw-generator'],
    model: 'qwen-rapid-aio-nsfw',
    queueQualityProfile: 'final',
    builtin: true,
  },
  {
    id: 'nsfw-generator-draft-zimage',
    label: 'Adult Z-Image draft',
    toolIds: ['nsfw-generator'],
    model: 'z-image-turbo',
    queueQualityProfile: 'draft',
    builtin: true,
  },
  {
    id: 'nsfw-generator-keeper-zimage',
    label: 'Adult Z-Image keeper',
    toolIds: ['nsfw-generator'],
    model: 'z-image-turbo',
    queueQualityProfile: 'final',
    builtin: true,
  },
  {
    id: 'nsfw-generator-draft-boogu',
    label: 'Adult Boogu draft',
    toolIds: ['nsfw-generator'],
    model: 'boogu-image-edit-turbo',
    queueQualityProfile: 'draft',
    builtin: true,
  },
  {
    id: 'nsfw-generator-keeper-qwen',
    label: 'Adult Qwen keeper',
    toolIds: ['nsfw-generator'],
    model: 'qwen-image-2512-lightning-8',
    queueQualityProfile: 'final',
    builtin: true,
  },
  {
    id: 'video-draft',
    label: 'Video draft',
    toolIds: ['video'],
    queueQualityProfile: 'draft',
    builtin: true,
  },
  {
    id: 'video-keeper',
    label: 'Video keeper',
    toolIds: ['video'],
    queueQualityProfile: 'final',
    builtin: true,
  },
  {
    id: 'controlnet-draft',
    label: 'ControlNet draft',
    toolIds: ['controlnet'],
    queueQualityProfile: 'draft',
    builtin: true,
  },
  {
    id: 'controlnet-keeper',
    label: 'ControlNet keeper',
    toolIds: ['controlnet'],
    queueQualityProfile: 'final',
    builtin: true,
  },
  {
    id: 'image-prompt-draft',
    label: 'Image→Prompt draft',
    toolIds: ['imagePrompt'],
    queueQualityProfile: 'draft',
    builtin: true,
  },
  {
    id: 'image-prompt-keeper',
    label: 'Image→Prompt keeper',
    toolIds: ['imagePrompt'],
    queueQualityProfile: 'final',
    builtin: true,
  },
  {
    id: 'audio-keeper',
    label: 'Audio keeper',
    toolIds: ['audio'],
    model: 'stable-audio',
    queueQualityProfile: 'final',
    builtin: true,
  },
  {
    id: 'mesh-keeper',
    label: 'Mesh keeper',
    toolIds: ['mesh'],
    model: 'hunyuan-3d',
    queueQualityProfile: 'final',
    builtin: true,
  },
];

function normalizeRecipeId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const id = value.trim().slice(0, 64);
  return id.length > 0 ? id : null;
}

function normalizeRecipeLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const label = value.trim().slice(0, 48);
  return label.length > 0 ? label : fallback;
}

function normalizeToolIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const ids = value
    .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, 16);
  return ids.length > 0 ? ids : undefined;
}

function normalizeLoraIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const ids = value
    .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, 32);
  return ids;
}

export function normalizeToolQualityRecipe(value: unknown): ToolQualityRecipe | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = normalizeRecipeId(record.id);
  if (!id) {
    return null;
  }
  const profile = normalizeQueueQualityProfile(record.queueQualityProfile);
  if (profile === 'followSettings') {
    // Recipes should pick an explicit intent.
    return null;
  }
  const modelRaw = typeof record.model === 'string' ? record.model.trim() : '';
  const model =
    modelRaw && COMFY_MODEL_IDS.has(modelRaw) ? (modelRaw as ComfyImageModel) : undefined;
  const denoise = Number(record.editDenoiseStrength);
  const loraOverrides = normalizeSessionLoraStrengthOverrides(
    record.sessionLoraStrengthOverrides as SessionLoraStrengthOverrides | undefined
  );
  return {
    id,
    label: normalizeRecipeLabel(record.label, id),
    toolIds: normalizeToolIds(record.toolIds),
    model,
    queueQualityProfile: profile,
    sessionActiveLoraIds: normalizeLoraIds(record.sessionActiveLoraIds),
    ...(Object.keys(loraOverrides).length > 0
      ? { sessionLoraStrengthOverrides: loraOverrides }
      : {}),
    editDenoiseStrength:
      Number.isFinite(denoise) && denoise >= 0.05 && denoise <= 1
        ? Math.round(denoise * 100) / 100
        : undefined,
    builtin: record.builtin === true,
  };
}

/** Merge built-in seeds with user recipes (same id → user wins). */
export function mergeToolQualityRecipes(stored: unknown): ToolQualityRecipe[] {
  const byId = new Map<string, ToolQualityRecipe>();
  for (const seed of SUGGESTED_TOOL_QUALITY_RECIPES) {
    byId.set(seed.id, seed);
  }
  if (Array.isArray(stored)) {
    for (const entry of stored) {
      const recipe = normalizeToolQualityRecipe(entry);
      if (!recipe) {
        continue;
      }
      byId.set(recipe.id, { ...recipe, builtin: false });
    }
  }
  return Array.from(byId.values()).slice(
    0,
    SUGGESTED_TOOL_QUALITY_RECIPES.length + MAX_USER_TOOL_QUALITY_RECIPES
  );
}

export function recipesForTool(recipes: ToolQualityRecipe[], toolId?: string): ToolQualityRecipe[] {
  if (!toolId?.trim()) {
    return recipes;
  }
  const id = toolId.trim();
  return recipes.filter(recipe => {
    if (!recipe.toolIds || recipe.toolIds.length === 0) {
      return true;
    }
    return recipe.toolIds.includes(id) || recipe.toolIds.includes('*');
  });
}

/**
 * Apply a recipe onto shared settings. Writes the tool quality override when
 * toolId is known so resolveQueueQualityProfile picks it up.
 */
export function applyToolQualityRecipe<T extends ToolQualityRecipeSharedSlice>(
  shared: T,
  recipe: ToolQualityRecipe,
  toolId?: string
): T {
  const next: T = {
    ...shared,
    queueQualityProfile: recipe.queueQualityProfile,
    sessionQueueMode:
      recipe.queueQualityProfile === 'draft'
        ? 'iterate'
        : recipe.queueQualityProfile === 'final'
          ? 'keeper'
          : 'off',
  };
  if (recipe.model) {
    next.model = recipe.model;
  }
  if (recipe.sessionActiveLoraIds !== undefined) {
    next.sessionActiveLoraIds = recipe.sessionActiveLoraIds;
  }
  if (recipe.sessionLoraStrengthOverrides !== undefined) {
    next.sessionLoraStrengthOverrides = recipe.sessionLoraStrengthOverrides;
  }
  if (recipe.editDenoiseStrength != null) {
    next.editDenoiseStrength = recipe.editDenoiseStrength;
  }
  const targetTool = toolId?.trim() || recipe.toolIds?.find(id => id !== '*') || undefined;
  if (targetTool) {
    next.toolQueueQualityProfiles = {
      ...(shared.toolQueueQualityProfiles ?? {}),
      [targetTool]: recipe.queueQualityProfile,
    };
  }
  return next;
}

export function formatToolQualityRecipeHint(recipe: ToolQualityRecipe, toolId?: string): string {
  const parts: string[] = [recipe.queueQualityProfile];
  if (recipe.model) {
    parts.push(recipe.model);
  }
  if (recipe.sessionActiveLoraIds) {
    parts.push(`${recipe.sessionActiveLoraIds.length} LoRAs`);
  }
  if (recipe.sessionLoraStrengthOverrides) {
    parts.push(`${Object.keys(recipe.sessionLoraStrengthOverrides).length} tuned`);
  }
  if (toolId && recipe.toolIds?.includes(toolId)) {
    parts.push(toolQueueQualityLabel(toolId));
  }
  return parts.join(' · ');
}

/** Minimal gallery-entry fields used to teach a quality recipe from Compare. */
export type GalleryRecipeSource = {
  model?: string;
  tool?: string;
  queueQualityProfile?: QueueQualityProfile;
  sessionActiveLoraIds?: string[];
  sessionLoraStrengthOverrides?: SessionLoraStrengthOverrides;
  queueParams?: WorkflowParamValues;
};

export type BuildRecipeFromEntryResult =
  { ok: true; recipe: ToolQualityRecipe } | { ok: false; error: string };

function parseDenoiseFromQueueParams(
  queueParams: GalleryRecipeSource['queueParams']
): number | undefined {
  if (!queueParams) {
    return undefined;
  }
  const raw = queueParams.denoise;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < 0.05 || value > 1) {
    return undefined;
  }
  return Math.round(value * 100) / 100;
}

/**
 * Build a user quality recipe from a Compare/gallery winner.
 * Seed is intentionally excluded. Requires model, quality profile, or LoRAs.
 */
export function buildToolQualityRecipeFromGalleryEntry(
  entry: GalleryRecipeSource,
  options?: { label?: string; id?: string }
): BuildRecipeFromEntryResult {
  const profile = normalizeQueueQualityProfile(entry.queueQualityProfile);
  const explicitProfile = profile === 'followSettings' ? undefined : profile;
  const modelRaw = typeof entry.model === 'string' ? entry.model.trim() : '';
  const model =
    modelRaw && COMFY_MODEL_IDS.has(modelRaw) ? (modelRaw as ComfyImageModel) : undefined;
  const loras = normalizeLoraIds(entry.sessionActiveLoraIds);
  const loraOverrides = normalizeSessionLoraStrengthOverrides(entry.sessionLoraStrengthOverrides);
  const denoise = parseDenoiseFromQueueParams(entry.queueParams);
  const toolId =
    typeof entry.tool === 'string' && entry.tool.trim()
      ? entry.tool.trim().slice(0, 32)
      : undefined;

  if (
    !explicitProfile &&
    !model &&
    !(loras && loras.length > 0) &&
    Object.keys(loraOverrides).length === 0
  ) {
    return {
      ok: false,
      error: 'Winner lacks model, quality profile, and LoRA metadata — cannot save a recipe.',
    };
  }

  const date = new Date().toISOString().slice(0, 10);
  const suggested = `Prefer ${date} · ${model ?? (modelRaw || 'stack')}`;
  const label = normalizeRecipeLabel(options?.label, suggested);
  const id =
    normalizeRecipeId(options?.id) ??
    `compare-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  return {
    ok: true,
    recipe: {
      id,
      label,
      toolIds: toolId ? [toolId] : undefined,
      model,
      queueQualityProfile: explicitProfile ?? 'final',
      sessionActiveLoraIds: loras,
      ...(Object.keys(loraOverrides).length > 0
        ? { sessionLoraStrengthOverrides: loraOverrides }
        : {}),
      editDenoiseStrength: denoise,
      builtin: false,
    },
  };
}

/** Append a user recipe and return the merged catalog (seeds + users). */
export function appendUserToolQualityRecipe(
  existing: unknown,
  recipe: ToolQualityRecipe
): ToolQualityRecipe[] {
  const normalized = normalizeToolQualityRecipe({ ...recipe, builtin: false });
  if (!normalized) {
    return mergeToolQualityRecipes(existing);
  }
  const prior = Array.isArray(existing) ? existing : [];
  return mergeToolQualityRecipes([...prior, normalized]);
}
