/**
 * Engine model picker: which catalog models are installed in ComfyUI, the job-based group each
 * sits in, short tags for a row, and the recent/starred lists. Pure — the selector supplies the
 * cached ComfyUI model lists and the saved maps.
 */

import type { ComfyImageModelDefinition } from './comfy-models/client';
import type { ComfyUiModelLists } from './comfyui-object-info';
import { matchInventoryFilename } from './loader-map-inventory-sync';
import { resolveLoaderFilenamesForModel, type ModelCheckpointMap } from './model-checkpoint-map';
import { precisionHintFromFilename } from './model-loader-precision';

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
    const loaders = resolveLoaderFilenamesForModel(entry.id, { checkpointMap });
    const file = loaders.unet ?? loaders.checkpoint;
    if (!file) continue;
    const match = matchInventoryFilename(file, files) ?? (files.includes(file) ? file : undefined);
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
