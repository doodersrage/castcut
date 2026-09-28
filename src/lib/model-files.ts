/**
 * Model files on disk (COMFYUI_ROOT/models): shared types and pure helpers for the Models
 * manager. The fs side lives in model-files-server.ts behind /api/comfyui/model-files.
 */

import type { ComfyAssetStatusRow } from './comfy-asset-status';

/** Files a render used this recently can't be deleted. */
export const MODEL_FILE_RECENT_USE_DAYS = 30;

export type ModelFileRow = {
  /** Relative to models/, e.g. `diffusion_models/qwen_image_2512_bf16.safetensors`. */
  path: string;
  /** Top folder under models/ (`checkpoints`, `loras`, …). */
  folder: string;
  /** Name as ComfyUI lists it inside its folder (may include subfolders). */
  name: string;
  /** 0 for symlinks — the target is counted on its own row. */
  bytes: number;
  modifiedAt: number;
  /** Set on symlinks: the target, relative to models/ when inside it. */
  linkTarget?: string;
  /** How many symlinks point at this file. */
  linkedBy?: number;
  /** Interrupted download leftover (`.partial`). */
  partial?: boolean;
  /** Newest render (ComfyUI history or output PNG graph) that loaded this file. */
  lastUsedAt?: number;
  renders?: number;
};

export type ModelFilesSummary = {
  root: string | null;
  files: ModelFileRow[];
  freeBytes: number | null;
  totalBytes: number | null;
  /** Output PNGs whose graphs fed the usage index, and the oldest one's time. */
  scannedOutputs: number;
  scannedSinceAt: number | null;
};

const MODEL_FILE_EXT = /\.(safetensors|ckpt|pt|pth|bin|gguf|onnx|sft)$/i;

export function isModelFileName(name: string): boolean {
  return MODEL_FILE_EXT.test(name.trim());
}

/** Match key for a model file: its base name, lower-cased (graphs may omit subfolders). */
export function modelFileKey(name: string): string {
  const base = name.trim().replace(/\\/g, '/').split('/').pop() ?? '';
  return base.toLowerCase();
}

/** Every model file name a ComfyUI API graph loads. */
export function collectGraphModelNames(graph: unknown): string[] {
  if (!graph || typeof graph !== 'object') return [];
  const names = new Set<string>();
  for (const node of Object.values(graph as Record<string, unknown>)) {
    const inputs = (node as { inputs?: Record<string, unknown> } | null)?.inputs;
    if (!inputs) continue;
    for (const value of Object.values(inputs)) {
      if (typeof value === 'string' && isModelFileName(value)) names.add(value.trim());
    }
  }
  return [...names];
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

export function formatLastUsed(at: number | undefined, now = Date.now()): string {
  if (!at) return 'No recent renders';
  const days = Math.floor((now - at) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Used today';
  if (days === 1) return 'Used yesterday';
  if (days < 60) return `Used ${days} days ago`;
  return `Used ${new Date(at).toLocaleDateString()}`;
}

export function isRecentlyUsed(file: ModelFileRow, now = Date.now()): boolean {
  return (
    typeof file.lastUsedAt === 'number' &&
    now - file.lastUsedAt < MODEL_FILE_RECENT_USE_DAYS * 24 * 60 * 60 * 1000
  );
}

export type ModelFileUse =
  | { kind: 'engine'; modelIds: string[] }
  | { kind: 'lora-library'; label: string }
  | { kind: 'loader-map'; modelId: string };

/**
 * What in the app points at each file: catalog engines that expect it, LoRA library entries,
 * and per-model loader maps (Settings → model maps).
 */
export function modelFileUses(input: {
  files: ModelFileRow[];
  catalog: Pick<ComfyAssetStatusRow, 'filename' | 'modelIds'>[];
  loraLibrary: { label: string; id: string; tokenValue: string }[];
  loaderMaps: Partial<Record<string, string | undefined>>[];
}): Map<string, ModelFileUse[]> {
  const byKey = new Map<string, ModelFileUse[]>();
  const add = (name: string, use: ModelFileUse) => {
    const key = modelFileKey(name);
    if (!key) return;
    byKey.set(key, [...(byKey.get(key) ?? []), use]);
  };
  for (const asset of input.catalog) {
    if (asset.modelIds.length > 0)
      add(asset.filename, { kind: 'engine', modelIds: asset.modelIds });
  }
  for (const entry of input.loraLibrary) {
    if (entry.tokenValue?.trim()) {
      add(entry.tokenValue, { kind: 'lora-library', label: entry.label || entry.id });
    }
  }
  for (const map of input.loaderMaps) {
    for (const [modelId, filename] of Object.entries(map)) {
      if (filename?.trim()) add(filename, { kind: 'loader-map', modelId });
    }
  }
  const result = new Map<string, ModelFileUse[]>();
  for (const file of input.files) {
    const uses = byKey.get(modelFileKey(file.name));
    if (uses) result.set(file.path, uses);
  }
  return result;
}

/** Why a file can't be deleted, or null when it can. */
export function modelFileDeleteBlock(
  file: ModelFileRow,
  uses: ModelFileUse[] | undefined,
  now = Date.now()
): string | null {
  if (file.linkedBy) {
    return `${file.linkedBy} link${file.linkedBy === 1 ? '' : 's'} point here — delete the link first`;
  }
  if (file.partial || file.linkTarget) return null;
  if (isRecentlyUsed(file, now)) {
    return `Used in the last ${MODEL_FILE_RECENT_USE_DAYS} days`;
  }
  const library = uses?.find(use => use.kind === 'lora-library');
  if (library && library.kind === 'lora-library') {
    return `In the LoRA library as “${library.label}” — remove it there first`;
  }
  const mapped = uses?.find(use => use.kind === 'loader-map');
  if (mapped && mapped.kind === 'loader-map') {
    return `Mapped as ${mapped.modelId}'s loader file in Settings`;
  }
  return null;
}

export type ModelFileGroup = {
  id: string;
  label: string;
  files: ModelFileRow[];
  bytes: number;
  lastUsedAt?: number;
};

/**
 * Files grouped the way you think about them: one group per engine that alone needs them,
 * "Shared" for files several engines use, LoRAs, then everything the catalog doesn't know.
 * Groups sort by size.
 */
export function groupModelFilesByEngine(
  files: ModelFileRow[],
  uses: Map<string, ModelFileUse[]>,
  engineLabel: (modelId: string) => string
): ModelFileGroup[] {
  const groups = new Map<string, ModelFileGroup>();
  const put = (id: string, label: string, file: ModelFileRow) => {
    const group = groups.get(id) ?? { id, label, files: [], bytes: 0 };
    group.files.push(file);
    group.bytes += file.bytes;
    if (file.lastUsedAt && (!group.lastUsedAt || file.lastUsedAt > group.lastUsedAt)) {
      group.lastUsedAt = file.lastUsedAt;
    }
    groups.set(id, group);
  };
  for (const file of files) {
    const engines = new Set<string>();
    for (const use of uses.get(file.path) ?? []) {
      if (use.kind === 'engine') use.modelIds.forEach(id => engines.add(id));
      if (use.kind === 'loader-map') engines.add(use.modelId);
    }
    const labels = new Set([...engines].filter(id => id !== 'default').map(engineLabel));
    if (labels.size === 0) {
      const guessed = guessEngineFamilyFromFile(file);
      if (guessed) labels.add(guessed);
    }
    if (file.folder === 'loras') put('loras', 'LoRAs', file);
    else if (labels.size === 1) {
      const label = [...labels][0]!;
      put(`engine:${label}`, label, file);
    } else if (labels.size > 1) put('shared', 'Shared by several engines', file);
    else put('other', 'Not linked to an engine', file);
  }
  return [...groups.values()].sort((a, b) => b.bytes - a.bytes);
}

const ENGINE_FAMILIES: [RegExp, string][] = [
  [/^qwen-rapid-aio/, 'Qwen Rapid AIO'],
  [/^qwen-image-edit-2511/, 'Qwen Image Edit 2511'],
  [/^qwen-image-edit(-2509)?$/, 'Qwen Image Edit 2509'],
  [/^qwen-image-2512/, 'Qwen Image 2512'],
  [/^qwen-image-2\.0/, 'Qwen Image 2.0'],
  [/^flux-2-klein/, 'FLUX.2 Klein'],
  [/^flux2$/, 'FLUX.2 Dev'],
  [/^flux-ultrareal/, 'UltraReal (FLUX.1)'],
  [/^flux-/, 'FLUX.1'],
  [/^z-image/, 'Z-Image'],
  [/^boogu/, 'Boogu'],
  [/^wan-video/, 'Wan video'],
  [/^ltx-video/, 'LTX video'],
  [/^hunyuan-video/, 'Hunyuan video'],
  [/^hunyuan-3d/, '3D mesh (Hunyuan 3D)'],
  [/^hunyuan-/, 'Hunyuan image'],
  [/^stable-audio/, 'Audio (Stable Audio)'],
  [/^sd3/, 'SD3'],
  [/^(sdxl|segmind-vega|ssd-1b)/, 'SDXL'],
  [/^sd(15|20|21)/, 'SD 1.x / 2.x'],
  [/^chroma/, 'Chroma'],
  [/^hidream/, 'HiDream'],
  [/^kandinsky/, 'Kandinsky'],
  [/^pixart/, 'PixArt'],
];

/** Engine family a model id belongs to (the variants of one engine share weights). */
export function engineFamilyLabel(modelId: string, fallbackLabel?: string): string {
  const id = modelId.trim();
  for (const [pattern, label] of ENGINE_FAMILIES) {
    if (pattern.test(id)) return label;
  }
  return fallbackLabel ?? id;
}

const HELPER_FOLDERS =
  /^(facerestore_models|dz_facedetailer|insightface|ultralytics|sams|RMBG|background_removal|ipadapter|detection|onnx|clip_vision|upscale_models|vae_approx)$/i;

const FILE_FAMILIES: [RegExp, string][] = [
  [/qwen[-_]?rapid[-_]?aio/i, 'Qwen Rapid AIO'],
  [/qwen[-_]?image[-_]?edit[-_]?2511/i, 'Qwen Image Edit 2511'],
  [/qwen[-_]?image[-_]?edit[-_]?2509/i, 'Qwen Image Edit 2509'],
  [/qwen[-_]?image[-_]?2512/i, 'Qwen Image 2512'],
  [/qwen[-_]?image[-_](fp8|bf16)|qwen[-_]?image.*controlnet|qwen_image_canny/i, 'Qwen Image'],
  [/flux[-_.]?2[-_.]?klein|flux2[-_]klein/i, 'FLUX.2 Klein'],
  [/ultrareal/i, 'UltraReal (FLUX.1)'],
  [/ltx/i, 'LTX video'],
  [/wan2|wan[-_]/i, 'Wan video'],
  [/hunyuan/i, 'Hunyuan'],
  [/boogu/i, 'Boogu'],
  [/z[-_]?image/i, 'Z-Image'],
  [/flux/i, 'FLUX.1'],
  [/sd[-_]?xl|realvisxl|juggernautxl/i, 'SDXL'],
  [/dreamshaper|sd[-_]?1[._]?5|v1-5/i, 'SD 1.x / 2.x'],
  [/janus/i, 'Janus-Pro (vision LLM)'],
];

/**
 * Best guess at the engine a file serves, from its name and folder — for files the catalog and
 * loader maps don't mention (older versions, quantised copies, manual installs).
 */
export function guessEngineFamilyFromFile(
  file: Pick<ModelFileRow, 'folder' | 'path'>
): string | null {
  for (const [pattern, label] of FILE_FAMILIES) {
    if (pattern.test(file.path)) return label;
  }
  if (HELPER_FOLDERS.test(file.folder)) return 'Helpers (faces, masks, cutouts, upscalers)';
  return null;
}
