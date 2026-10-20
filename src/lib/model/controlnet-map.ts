export const DEFAULT_CONTROLNET_MODEL_TOKEN = '{{CONTROLNET_MODEL}}';
export const DEFAULT_CONTROL_IMAGE_TOKEN = '{{CONTROL_IMAGE}}';

export type ModelControlNetMap = Partial<Record<string, string>>;

/** Preferred InstantX / Qwen Union ControlNet filenames (Comfy-Org + InstantX naming). */
const QWEN_POSE_CONTROLNET_PATTERNS = [
  /qwen[-_]?image[-_]?instantx[-_]?controlnet[-_]?union/i,
  /instantx[-_]?qwen[-_]?image[-_]?controlnet[-_]?union/i,
  /qwen[-_]?image[-_]?instantx/i,
  /qwen[-_]?controlnet[-_]?union/i,
  /qwen.*controlnet/i,
] as const;

function trimFilename(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Pick a Qwen-compatible ControlNet from ComfyUI's controlnet inventory.
 * Prefers InstantX Union (Story/Day pose); returns undefined when none look Qwen-safe.
 */
export function pickQwenPoseControlNetFilename(
  controlNets: string[] | null | undefined
): string | undefined {
  const list = (controlNets ?? []).map(name => name.trim()).filter(Boolean);
  if (list.length === 0) {
    return undefined;
  }
  for (const pattern of QWEN_POSE_CONTROLNET_PATTERNS) {
    const hit = list.find(name => pattern.test(name));
    if (hit) {
      return hit;
    }
  }
  return undefined;
}

export function resolveControlNetModelFilename(
  model: string,
  input?: {
    controlNetMap?: ModelControlNetMap;
    customTokens?: Array<{ token: string; value: string }>;
    /** Optional ComfyUI controlnet inventory for Qwen InstantX auto-pick. */
    controlNetInventory?: string[] | null;
  }
): string | undefined {
  const fromMap =
    trimFilename(input?.controlNetMap?.[model]) ?? trimFilename(input?.controlNetMap?.default);
  if (fromMap) {
    return fromMap;
  }
  const custom = Array.isArray(input?.customTokens)
    ? input.customTokens.find(entry => entry.token.trim() === DEFAULT_CONTROLNET_MODEL_TOKEN)
    : undefined;
  const fromToken = trimFilename(custom?.value);
  if (fromToken) {
    return fromToken;
  }
  // Story/Day pose: if the user already dropped InstantX into models/controlnet but
  // never mapped it, still attach for Qwen stills.
  if (/^qwen-/i.test(model.trim())) {
    return pickQwenPoseControlNetFilename(input?.controlNetInventory);
  }
  return undefined;
}

export function formatModelControlNetMap(map: ModelControlNetMap | undefined): string {
  if (!map) {
    return '';
  }
  return Object.entries(map)
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([key, filename]) => `${key}=${filename.trim()}`)
    .join('\n');
}

export function parseModelControlNetMap(text: string): ModelControlNetMap {
  const map: ModelControlNetMap = {};
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
