/**
 * One-line "what will run" for a tool's Engine chip: model · queue quality · LoRA count.
 * Pure — the chip reads settings and re-renders on SETTINGS_CACHE_UPDATED_EVENT.
 */

import { getComfyModelDefinition, type ComfyImageModel } from './comfy-models/client';
import { engineDisplayName, isCloudEngine } from './engine/capabilities';
import { resolveEffectiveSessionLoraIds } from './model-lora-map';
import {
  MODEL_SAMPLER_PRESET_OPTIONS,
  normalizeModelSamplerPresetTier,
} from './model-sampler-defaults';
import { QUEUE_QUALITY_PROFILE_OPTIONS, resolveQueueQualityProfile } from './queue-quality-profile';
import type { SharedToolSettings } from './settings-cache';

export type EngineSummary = {
  /** "Qwen-Image-2512" or the cloud engine's name. */
  model: string;
  /** Fast / Good / Best, or the sampler preset (Base, Optimized, …) when quality follows it. */
  quality: string;
  /** Active session LoRAs for the model (per-model pick, else the model's auto-add). */
  loras: number;
};

export function engineSummary(shared: Partial<SharedToolSettings>, toolId?: string): EngineSummary {
  const cloud = isCloudEngine(shared.inferenceEngine);
  const modelId = shared.model?.trim() || undefined;
  const model = cloud
    ? engineDisplayName(shared.inferenceEngine)
    : shared.inferenceEngine === 'diffusers'
      ? 'Diffusers'
      : getComfyModelDefinition(modelId as ComfyImageModel | undefined).label;
  const profile = resolveQueueQualityProfile({
    tool: toolId,
    global: shared.queueQualityProfile,
    toolProfiles: shared.toolQueueQualityProfiles,
    model: modelId,
  });
  const preset = normalizeModelSamplerPresetTier(shared.modelSamplerPreset);
  const quality =
    profile === 'followSettings'
      ? (MODEL_SAMPLER_PRESET_OPTIONS.find(option => option.id === preset)?.label ?? preset)
      : (QUEUE_QUALITY_PROFILE_OPTIONS.find(option => option.id === profile)?.label ?? profile);
  const loras = cloud
    ? 0
    : (resolveEffectiveSessionLoraIds(
        shared.sessionActiveLoraIds,
        modelId,
        shared.modelLoraMap,
        shared.sessionActiveLoraIdsByModel
      )?.length ?? 0);
  return { model, quality, loras };
}

/** "Qwen-Image-2512 · Good · 2 LoRAs". */
export function formatEngineSummary(summary: EngineSummary): string {
  const parts = [summary.model, summary.quality];
  if (summary.loras > 0) {
    parts.push(`${summary.loras} LoRA${summary.loras === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}
