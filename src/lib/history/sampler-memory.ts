'use client';

import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery';
import type { WorkflowParamValues } from '../comfyui/config';
import { isQwenLightningModel } from '../workflow/model-sampling-patch';
import { isQwenRapidAioModel } from '../model/denoise-defaults';
import { loadSettingsCache, saveSharedSettings } from '../settings/cache';

export type ModelSamplerMemoryEntry = {
  cfg?: string;
  steps?: string;
  samplerName?: string;
  scheduler?: string;
  updatedAt: number;
};

export type ModelSamplerMemoryMap = Record<string, ModelSamplerMemoryEntry>;

export function loadModelSamplerMemory(): ModelSamplerMemoryMap {
  const map = loadSettingsCache().shared.modelSamplerMemory;
  return map && typeof map === 'object' ? { ...map } : {};
}

export function clearModelSamplerMemory(model?: string): void {
  const shared = loadSettingsCache().shared;
  if (!model?.trim()) {
    saveSharedSettings({ ...shared, modelSamplerMemory: {} });
    return;
  }
  const next = { ...(shared.modelSamplerMemory ?? {}) };
  delete next[model.trim()];
  saveSharedSettings({ ...shared, modelSamplerMemory: next });
}

export function rememberSamplerFromGalleryEntry(
  entry: Pick<ComfyGalleryEntry, 'model' | 'queueParams' | 'reviewRating'>
): boolean {
  const model = entry.model?.trim();
  if (!model) {
    return false;
  }
  // Distilled stacks must stay CFG-1 — never learn overrides from ratings.
  if (isQwenLightningModel(model) || isQwenRapidAioModel(model)) {
    return false;
  }
  const params = entry.queueParams;
  if (!params) {
    return false;
  }
  const cfg = params.cfg != null ? String(params.cfg).trim() : '';
  const steps = params.steps != null ? String(params.steps).trim() : '';
  const samplerName = params.samplerName != null ? String(params.samplerName).trim() : '';
  const scheduler = params.scheduler != null ? String(params.scheduler).trim() : '';
  if (!cfg && !steps && !samplerName && !scheduler) {
    return false;
  }

  const shared = loadSettingsCache().shared;
  const next: ModelSamplerMemoryMap = {
    ...(shared.modelSamplerMemory ?? {}),
    [model]: {
      ...(cfg ? { cfg } : {}),
      ...(steps ? { steps } : {}),
      ...(samplerName ? { samplerName } : {}),
      ...(scheduler ? { scheduler } : {}),
      updatedAt: Date.now(),
    },
  };
  saveSharedSettings({ ...shared, modelSamplerMemory: next });
  return true;
}

/** Remembered sampler overrides for catalog defaults (empty when none / distilled). */
export function rememberedSamplerOverrides(model: string | undefined): WorkflowParamValues {
  const id = model?.trim();
  if (!id || isQwenLightningModel(id) || isQwenRapidAioModel(id)) {
    return {};
  }
  const remembered = loadModelSamplerMemory()[id];
  if (!remembered) {
    return {};
  }
  const next: WorkflowParamValues = {};
  if (remembered.cfg) {
    next.cfg = remembered.cfg;
  }
  if (remembered.steps) {
    next.steps = remembered.steps;
  }
  if (remembered.samplerName) {
    next.samplerName = remembered.samplerName;
  }
  if (remembered.scheduler) {
    next.scheduler = remembered.scheduler;
  }
  return next;
}
