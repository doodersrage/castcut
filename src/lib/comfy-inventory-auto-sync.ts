/**
 * Keep loader maps in step with ComfyUI's model list: when the list changes (a model was
 * added or removed), fill map entries that are still empty from what's installed — the same
 * fill Heal & ready does, minus everything else it does. Never rewrites a value that is set.
 */

import type { ComfyUiModelLists } from './comfyui-object-info';
import { fetchComfyObjectInfoCached } from './comfyui-object-info-cache';
import { loaderMapsChanged, syncLoaderMapsFromInventory } from './loader-map-inventory-sync';
import { loadSettingsCache, saveSettingsCache } from './settings-cache';

const FINGERPRINT_KEY = 'castcut.comfyInventoryFingerprint.v1';

/** Stable hash of the model files a loader map can point at. */
export function comfyInventoryFingerprint(models: ComfyUiModelLists): string {
  const names = [
    ...models.checkpoints.map(name => `c:${name}`),
    ...models.unets.map(name => `u:${name}`),
    ...models.vaes.map(name => `v:${name}`),
    ...models.upscaleModels.map(name => `s:${name}`),
    ...models.controlNets.map(name => `n:${name}`),
  ].sort();
  let hash = 5381;
  const text = names.join('\n');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return `${names.length}:${hash.toString(36)}`;
}

export type InventoryAutoSyncOutcome =
  | { status: 'unchanged' | 'unreachable' | 'off' }
  | { status: 'synced'; filled: number; message: string };

function readFingerprint(comfyUrl: string): string | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(FINGERPRINT_KEY) ?? 'null') as {
      comfyUrl?: string;
      fingerprint?: string;
    } | null;
    return raw && raw.comfyUrl === comfyUrl ? (raw.fingerprint ?? null) : null;
  } catch {
    return null;
  }
}

function writeFingerprint(comfyUrl: string, fingerprint: string): void {
  try {
    window.localStorage.setItem(FINGERPRINT_KEY, JSON.stringify({ comfyUrl, fingerprint }));
  } catch {
    // storage blocked — next check just runs the (idempotent) fill again
  }
}

/**
 * Fill-only map sync from a model list. Pure apart from the settings it is handed; returns the
 * next maps and how many entries were filled.
 */
export function fillLoaderMapsFromInventory(
  models: ComfyUiModelLists,
  shared: {
    modelCheckpointMap?: Record<string, string | undefined>;
    modelVaeMap?: Record<string, string | undefined>;
    modelUpscaleMap?: Record<string, string | undefined>;
    modelControlNetMap?: Record<string, string | undefined>;
  }
) {
  const before = {
    checkpointMap: shared.modelCheckpointMap,
    vaeMap: shared.modelVaeMap,
    upscaleMap: shared.modelUpscaleMap,
    controlNetMap: shared.modelControlNetMap,
  };
  const result = syncLoaderMapsFromInventory({
    models,
    ...before,
    // Fill empty keys only — values the player (or an earlier heal) set stay as they are.
    healMissing: false,
  });
  const filled =
    result.filledCheckpointKeys.length +
    result.filledVaeKeys.length +
    result.filledUpscaleKeys.length +
    result.filledControlNetKeys.length;
  return { result, filled, changed: loaderMapsChanged(before, result) };
}

/** Check ComfyUI's model list once; fill empty map entries if it changed since last time. */
export async function autoSyncLoaderMapsIfInventoryChanged(input?: {
  comfyUrl?: string;
}): Promise<InventoryAutoSyncOutcome> {
  if (typeof window === 'undefined') return { status: 'off' };
  const cache = loadSettingsCache();
  if (cache.shared.autoSyncLoaderMaps === false) return { status: 'off' };
  const comfyUrl = input?.comfyUrl?.trim() || '';
  let models: ComfyUiModelLists | null = null;
  try {
    models =
      (await fetchComfyObjectInfoCached({ comfyUrl: comfyUrl || undefined }))?.models ?? null;
  } catch {
    models = null;
  }
  if (!models) return { status: 'unreachable' };
  const fingerprint = comfyInventoryFingerprint(models);
  if (readFingerprint(comfyUrl) === fingerprint) return { status: 'unchanged' };
  writeFingerprint(comfyUrl, fingerprint);
  const latest = loadSettingsCache();
  const { result, filled, changed } = fillLoaderMapsFromInventory(models, latest.shared);
  if (!changed || filled === 0) return { status: 'unchanged' };
  saveSettingsCache({
    ...latest,
    shared: {
      ...latest.shared,
      modelCheckpointMap: result.modelCheckpointMap,
      modelVaeMap: result.modelVaeMap,
      modelUpscaleMap: result.modelUpscaleMap,
      modelControlNetMap: result.modelControlNetMap,
    },
  });
  return {
    status: 'synced',
    filled,
    message: `ComfyUI's models changed — mapped ${filled} new ${filled === 1 ? 'entry' : 'entries'} (existing ones untouched).`,
  };
}
