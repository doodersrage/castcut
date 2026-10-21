/**
 * Engine model picker: which catalog models are installed in ComfyUI, the job-based group each
 * sits in, short tags for a row, and the recent/starred lists. Pure — the selector supplies the
 * cached ComfyUI model lists and the saved maps.
 */

import type { ComfyImageModelDefinition } from '../comfy-models/client';
import type { ComfyUiModelLists } from '../comfyui/object-info';
import {
  isQwenImage21Model,
  isQwenImage21NoctModel,
  QWEN_IMAGE_21_EIGHT_STEP_LORA,
  QWEN_IMAGE_21_FILES,
  QWEN_IMAGE_21_FOUR_STEP_FILE,
  QWEN_IMAGE_21_NOCT_UNET,
  QWEN_IMAGE_21_TURBO_LORA,
  QWEN_IMAGE_21_TURBO_UNET,
  qwenImage21FastSampler,
} from '../engine/qwen-image-21-renderer';
import { matchInventoryFilename } from '../workflow/loader-map-inventory-sync';
import { resolveLoaderFilenamesForModel, type ModelCheckpointMap } from './checkpoint-map';
import { precisionHintFromFilename } from './loader-precision';

const baseName = (name: string) => name.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';

/**
 * The file a Qwen-Image 2.1 engine loads, when ComfyUI has everything it needs. The 2.1 converter
 * loads its own files whatever the loader map says (the map resolves 2.1 to the Qwen-Edit graph's
 * base, so the 2512 base alone made all five 2.1 engines look installed): Noct-Q its own model;
 * Turbo its checkpoint, or the 2.1 base + Turbo LoRA; Fun-Acc and Pruna the 2.1 base + their
 * file. An inventory without a LoRA list (older caches) is not second-guessed on LoRAs.
 */
function qwenImage21InstalledFile(
  modelId: string,
  files: string[],
  models: ComfyUiModelLists | null | undefined
): string | undefined {
  const find = (file: string) =>
    files.find(entry => baseName(entry) === file.toLowerCase()) ??
    matchInventoryFilename(file, files);
  if (isQwenImage21NoctModel(modelId)) return find(QWEN_IMAGE_21_NOCT_UNET);
  const sampler = qwenImage21FastSampler(modelId);
  if (sampler === 'turbo-8') {
    const checkpoint = find(QWEN_IMAGE_21_TURBO_UNET);
    if (checkpoint) return checkpoint;
  }
  const base = find(QWEN_IMAGE_21_FILES.unet);
  if (!base || !sampler || !Array.isArray(models?.loras)) return base;
  const loras = new Set(models.loras.map(baseName));
  const needed =
    sampler === 'fun-acc-4'
      ? QWEN_IMAGE_21_FOUR_STEP_FILE
      : sampler === 'pruna-8'
        ? QWEN_IMAGE_21_EIGHT_STEP_LORA
        : QWEN_IMAGE_21_TURBO_LORA;
  return loras.has(needed.toLowerCase()) ? base : undefined;
}

/**
 * Model id → the weight file ComfyUI has for it, resolved the way queueing resolves loaders.
 * Null when the inventory is unknown or empty (ComfyUI unreachable) — callers show everything.
 */
export function installedComfyModels(
  catalog: readonly ComfyImageModelDefinition[],
  models: ComfyUiModelLists | null | undefined,
  checkpointMap?: ModelCheckpointMap
): Map<string, string> | null {
  const files = [...(models?.checkpoints ?? []), ...(models?.unets ?? [])];
  if (files.length === 0) {
    return null;
  }
  const installed = new Map<string, string>();
  for (const entry of catalog) {
    if (isQwenImage21Model(entry.id)) {
      const match = qwenImage21InstalledFile(entry.id, files, models);
      if (match) installed.set(entry.id, match);
      continue;
    }
    const loaders = resolveLoaderFilenamesForModel(entry.id, { checkpointMap });
    const file = loaders.unet ?? loaders.checkpoint;
    if (!file) continue;
    const match =
      matchInventoryFilename(file, files) ??
      (files.includes(file) ? file : undefined) ??
      entry.unetAlternates
        ?.map(alt => matchInventoryFilename(alt, files) ?? (files.includes(alt) ? alt : undefined))
        .find(Boolean);
    if (match) {
      installed.set(entry.id, match);
    }
  }
  return installed;
}

export type ModelPickerGroupId = 'fast' | 'quality' | 'edit' | 'adult' | 'video' | 'other';

export const MODEL_PICKER_GROUPS: Array<{ id: ModelPickerGroupId; label: string }> = [
  { id: 'fast', label: 'Fast' },
  { id: 'quality', label: 'Quality' },
  { id: 'edit', label: 'Edit / img2img' },
  { id: 'adult', label: 'Adult' },
  { id: 'video', label: 'Video' },
  { id: 'other', label: 'Audio & 3D' },
];

const FAST_RE = /lightning|turbo|distilled|schnell|ssd-1b|segmind-vega|-kv$/i;
const EDIT_RE = /edit|rapid-aio|pix2pix|inpaint|lotus/i;

/** How people pick: by job (fast draft, quality, edit, adult, video), not model family. */
export function modelPickerGroup(
  entry: Pick<ComfyImageModelDefinition, 'id' | 'category'>
): ModelPickerGroupId {
  if (entry.category === 'video') return 'video';
  if (entry.category === 'audio' || entry.category === 'mesh') return 'other';
  if (/nsfw/i.test(entry.id)) return 'adult';
  if (entry.category === 'instruct-edit' || EDIT_RE.test(entry.id)) return 'edit';
  if (FAST_RE.test(entry.id)) return 'fast';
  return 'quality';
}

/** Short row tags: steps, Edit / NSFW / Video, and the installed file's precision. */
export function modelPickerTags(
  entry: Pick<ComfyImageModelDefinition, 'id' | 'category'> & { label?: string },
  installedFile?: string
): string[] {
  const tags: string[] = [];
  const steps = entry.id.match(/lightning-(\d+)/i)?.[1];
  if (steps) tags.push(`${steps}-step`);
  else if (/turbo|schnell/i.test(entry.id)) tags.push('Turbo');
  else if (/distilled/i.test(entry.id)) tags.push('Distilled');
  const group = modelPickerGroup(entry);
  if (group === 'edit') tags.push('Edit');
  if (group === 'adult') tags.push('NSFW');
  if (group === 'video') tags.push('Video');
  const precision = installedFile ? precisionHintFromFilename(installedFile) : undefined;
  if (precision) tags.push(precision);
  // "Lightning (4-step)" / "Klein 9B Distilled" already say it — keep the row short.
  const label = entry.label?.toLowerCase() ?? '';
  return tags.filter(tag => !label.includes(tag.toLowerCase()));
}

/** Most recent first, no duplicates, capped. */
export function pushRecentModel(
  recents: readonly string[] | undefined,
  id: string,
  max = 5
): string[] {
  return [id, ...(recents ?? []).filter(entry => entry !== id)].slice(0, max);
}

export function toggleStarredModel(stars: readonly string[] | undefined, id: string): string[] {
  const current = stars ?? [];
  return current.includes(id) ? current.filter(entry => entry !== id) : [...current, id];
}

export function modelMatchesQuery(
  entry: Pick<ComfyImageModelDefinition, 'id' | 'label' | 'description'>,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    entry.label.toLowerCase().includes(q) ||
    entry.id.toLowerCase().includes(q) ||
    entry.description.toLowerCase().includes(q)
  );
}

export type ModelPickerRow<T> =
  | { kind: 'model'; key: string; entry: T; installed: boolean | null }
  | { kind: 'more'; key: string; count: number; expanded: boolean };

export type ModelPickerSection<T> = { key: string; label: string; rows: ModelPickerRow<T>[] };

/**
 * The picker's list: Recent, Starred, then installed engines grouped by job; engines ComfyUI
 * doesn't have sit under one collapsed "Not installed" group at the end (pickable once opened,
 * each with a Get it link). The current engine always shows in its group, installed or not.
 * An unknown inventory (`isInstalled` null) shows everything in its group.
 */
export function modelPickerSections<
  T extends Pick<ComfyImageModelDefinition, 'id' | 'category' | 'label' | 'description'>,
>(input: {
  catalog: readonly T[];
  isInstalled: (modelId: string) => boolean | null;
  value: string;
  query?: string;
  showMissing?: boolean;
  recents?: readonly string[];
  stars?: readonly string[];
}): ModelPickerSection<T>[] {
  const { catalog, isInstalled, value } = input;
  const query = input.query?.trim() ?? '';
  const showMissing = input.showMissing === true;
  const missing = (entry: T) => isInstalled(entry.id) === false && entry.id !== value;
  const row = (entry: T, section: string): ModelPickerRow<T> => ({
    kind: 'model',
    key: `${section}:${entry.id}`,
    entry,
    installed: isInstalled(entry.id),
  });
  const matches = catalog.filter(entry => modelMatchesQuery(entry, query));
  const shown = matches.filter(entry => !missing(entry));
  const hidden = matches.filter(missing);
  const missingSections: ModelPickerSection<T>[] =
    hidden.length === 0
      ? []
      : [
          {
            key: 'more',
            label: '',
            rows: [{ kind: 'more', key: 'more', count: hidden.length, expanded: showMissing }],
          },
          ...(showMissing
            ? [
                {
                  key: 'missing',
                  label: 'Not installed',
                  rows: hidden.map(entry => row(entry, 'missing')),
                },
              ]
            : []),
        ];

  if (query) {
    const results: ModelPickerSection<T>[] = shown.length
      ? [{ key: 'results', label: 'Results', rows: shown.map(entry => row(entry, 'r')) }]
      : [];
    return [...results, ...missingSections];
  }
  const byId = new Map(catalog.map(entry => [entry.id, entry]));
  const pick = (ids: readonly string[] | undefined): T[] =>
    (ids ?? []).flatMap(modelId => {
      const entry = byId.get(modelId);
      return entry && !missing(entry) ? [entry] : [];
    });
  const out: ModelPickerSection<T>[] = [];
  const recents = pick(input.recents);
  if (recents.length) {
    out.push({ key: 'recent', label: 'Recent', rows: recents.map(e => row(e, 'recent')) });
  }
  const stars = pick(input.stars);
  if (stars.length) {
    out.push({ key: 'starred', label: 'Starred', rows: stars.map(e => row(e, 'star')) });
  }
  for (const group of MODEL_PICKER_GROUPS) {
    const rows = shown
      .filter(entry => modelPickerGroup(entry) === group.id)
      .map(entry => row(entry, group.id));
    if (rows.length) out.push({ key: group.id, label: group.label, rows });
  }
  return [...out, ...missingSections];
}
