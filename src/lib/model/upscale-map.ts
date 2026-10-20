import type { CustomWorkflowToken } from '../comfyui/config';

export const DEFAULT_UPSCALE_MODEL_TOKEN = '{{UPSCALE_MODEL}}';

/**
 * Suggested UpscaleModel filenames for Final/Max neural enrich when no
 * per-model override exists. Prefer skin-friendly models for people stacks;
 * UltraSharp remains the generic default.
 */
export const SUGGESTED_MODEL_UPSCALE_MAP: ModelUpscaleMap = {
  default: '4x-UltraSharp.pth',
  'qwen-image-2512': '4x_NMKD-Siax_200k.pth',
  'z-image': '4x-UltraSharp.pth',
  'z-image-turbo': '4x-UltraSharp.pth',
  'boogu-image': '4x-UltraSharp.pth',
  'boogu-image-turbo': '4x-UltraSharp.pth',
  'boogu-image-edit': '4x-UltraSharp.pth',
  'boogu-image-edit-turbo': '4x-UltraSharp.pth',
  'qwen-image-2.0': '4x_NMKD-Siax_200k.pth',
  'flux-dev': '4x-UltraSharp.pth',
  'flux-ultrareal-v4': '4x-UltraSharp.pth',
  flux2: '4x-UltraSharp.pth',
  'flux-2-klein': '4x-UltraSharp.pth',
  'flux-2-klein-9b': '4x-UltraSharp.pth',
  'flux-2-klein-4b-distilled': '4x-UltraSharp.pth',
  'flux-2-klein-9b-distilled': '4x-UltraSharp.pth',
  sdxl: '4x-UltraSharp.pth',
};

export type ModelUpscaleMap = Partial<Record<string, string>>;

/** Suggested system defaults under user overrides (user wins on conflict). */
export function mergeSuggestedUpscaleMap(userMap?: ModelUpscaleMap | null): ModelUpscaleMap {
  return {
    ...SUGGESTED_MODEL_UPSCALE_MAP,
    ...(userMap ?? {}),
  };
}

function trimFilename(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function resolveCustomTokenValue(
  token: string,
  customTokens?: CustomWorkflowToken[]
): string | undefined {
  if (!customTokens?.length) {
    return undefined;
  }
  const match = customTokens.find(entry => entry.token.trim() === token);
  return trimFilename(match?.value);
}

/** Prefer skin-friendly ESRGAN families for Qwen / people-oriented stacks. */
function upscalePreferencePatternsForModel(model?: string): RegExp[] {
  // Prefer true 4× before generic RealESRGAN (which often matches x2plus).
  if (model && /qwen/i.test(model)) {
    return [
      /siax|remacri|nomos|foliage|skin|universalupscaler/i,
      /ultrasharp/i,
      /\b4x\b|_x4|x4_/i,
      /realesrgan/i,
    ];
  }
  return [/ultrasharp/i, /\b4x\b|_x4|x4_/i, /realesrgan/i, /siax|remacri|nomos/i];
}

/**
 * Prefer the mapped/suggested upscaler when installed; otherwise pick a sensible
 * file from ComfyUI inventory using model-aware preference order.
 * Empty inventory (`[]`) means nothing is installed — returns undefined.
 * Unknown inventory (`null`/`undefined`) keeps the preferred name.
 */
export function pickUpscaleModelFromInventory(
  availableUpscaleModels?: string[] | null,
  preferred?: string,
  model?: string
): string | undefined {
  const preferredName = trimFilename(preferred);
  if (preferredName && isUpscaleModelInstalled(preferredName, availableUpscaleModels)) {
    return preferredName;
  }
  // Known-empty inventory: do not invent a filename ComfyUI will reject.
  if (Array.isArray(availableUpscaleModels) && availableUpscaleModels.length === 0) {
    return undefined;
  }
  if (!availableUpscaleModels?.length) {
    return preferredName;
  }
  const trimmed = availableUpscaleModels.map(name => name.trim()).filter(Boolean);
  for (const pattern of upscalePreferencePatternsForModel(model)) {
    const hit = trimmed.find(name => pattern.test(name));
    if (hit) {
      return hit;
    }
  }
  // Prefer an installed preferred name only; do not grab arbitrary inventory files.
  return preferredName && trimmed.includes(preferredName) ? preferredName : undefined;
}

export function resolveUpscaleModelFilename(
  model: string,
  options?: {
    upscaleMap?: ModelUpscaleMap;
    customTokens?: CustomWorkflowToken[];
    availableUpscaleModels?: string[] | null;
  }
): string | undefined {
  // User map first; otherwise suggested system defaults (optimized).
  const mapped =
    trimFilename(options?.upscaleMap?.[model]) ?? trimFilename(options?.upscaleMap?.default);
  const suggested =
    trimFilename(SUGGESTED_MODEL_UPSCALE_MAP[model]) ??
    trimFilename(SUGGESTED_MODEL_UPSCALE_MAP.default);
  const resolved =
    mapped ??
    resolveCustomTokenValue(DEFAULT_UPSCALE_MODEL_TOKEN, options?.customTokens) ??
    suggested;

  if (Array.isArray(options?.availableUpscaleModels)) {
    if (options.availableUpscaleModels.length === 0) {
      return undefined;
    }
    return pickUpscaleModelFromInventory(
      options.availableUpscaleModels,
      resolved ?? SUGGESTED_MODEL_UPSCALE_MAP.default,
      model
    );
  }
  return resolved;
}

/**
 * When ComfyUI inventory is a known non-empty list, only treat filenames present
 * in that list as usable. Unknown inventory (`null`/`undefined`) keeps the mapped
 * name. Known-empty inventory (`[]`) means nothing is installed.
 */
export function isUpscaleModelInstalled(
  filename: string | undefined,
  availableUpscaleModels?: string[] | null
): boolean {
  const trimmed = trimFilename(filename);
  if (!trimmed) {
    return false;
  }
  if (availableUpscaleModels == null) {
    return true;
  }
  if (availableUpscaleModels.length === 0) {
    return false;
  }
  return availableUpscaleModels.includes(trimmed);
}

export function formatModelUpscaleMap(map: ModelUpscaleMap | undefined): string {
  if (!map) {
    return '';
  }
  return Object.entries(map)
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([key, filename]) => `${key}=${filename.trim()}`)
    .join('\n');
}

export function parseModelUpscaleMap(text: string): ModelUpscaleMap {
  const map: ModelUpscaleMap = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.includes('=') ? '=' : ':';
    const [key, ...rest] = trimmed.split(separator);
    const filename = rest.join(separator).trim();
    if (key?.trim() && filename) {
      map[key.trim()] = filename;
    }
  }
  return map;
}
