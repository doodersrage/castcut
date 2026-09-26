/**
 * "Changed from defaults": the preferences that differ from a fresh install, so it's easy to
 * see why output looks different and to undo an experiment. Only real preferences are listed —
 * not state (active Cast, locks, history), secrets (API keys) or loader maps (inventory-driven).
 */

import type { SharedToolSettings } from './settings-cache';
import type { SettingsTab } from './settings-nav';
import type { ComfyUiSettingsSectionId } from './settings-comfyui-nav';

type Area = { label: string; tab: SettingsTab; section?: ComfyUiSettingsSectionId };

const PROMPT: Area = { label: 'Prompt quality', tab: 'comfyui', section: 'prompt-quality' };
const PATCH: Area = { label: 'Patching & maps', tab: 'comfyui', section: 'workflow-patching' };
const QUEUE: Area = { label: 'Queue', tab: 'comfyui', section: 'queue-params' };
const VRAM: Area = { label: 'VRAM', tab: 'comfyui', section: 'vram-guard' };
const ENGINE: Area = { label: 'Engine & workflows', tab: 'comfyui', section: 'inference-engine' };
const CONNECTION: Area = { label: 'Identity lock', tab: 'comfyui', section: 'connection' };
const LLM: Area = { label: 'LLM', tab: 'llm' };
const DATA: Area = { label: 'Gallery storage', tab: 'data' };

/** Preference keys shown in the diff, with a readable name and where they live. */
export const PREFERENCE_KEYS: ReadonlyArray<{
  key: keyof SharedToolSettings;
  label: string;
  area: Area;
}> = [
  { key: 'model', label: 'Model', area: ENGINE },
  { key: 'inferenceEngine', label: 'Inference engine', area: ENGINE },
  { key: 'useSystemWorkflows', label: 'System workflows', area: ENGINE },
  { key: 'autoSelectWorkflowForModel', label: 'Auto-select workflow for model', area: ENGINE },
  { key: 'autoSelectLorasForModel', label: 'Auto-select LoRAs for model', area: ENGINE },
  { key: 'limitModelsToAvailableWorkflows', label: 'Only models with a workflow', area: ENGINE },
  { key: 'systemWorkflowsLimitPicker', label: 'Limit picker to system workflows', area: ENGINE },
  { key: 'detail', label: 'Prompt detail', area: PROMPT },
  { key: 'alwaysIncludeClothing', label: 'Always include clothing', area: PROMPT },
  { key: 'seedLlmWithIngredients', label: 'Seed the LLM with ingredients', area: PROMPT },
  { key: 'renderRealismMode', label: 'Render realism', area: PROMPT },
  { key: 'poseGuideStyle', label: 'Pose guide style', area: PROMPT },
  { key: 'poseGuideControlNet', label: 'Pose ControlNet lock', area: PROMPT },
  { key: 'anatomyGuardMode', label: 'Anatomy guard', area: PROMPT },
  { key: 'kleinEnhancerEnabled', label: 'Klein Enhancer', area: PROMPT },
  { key: 'kleinEnhancerTextEnabled', label: 'Klein text enhancer', area: PROMPT },
  { key: 'kleinEnhancerColorAnchorEnabled', label: 'Klein color anchor', area: PROMPT },
  { key: 'kleinEnhancerColorAnchorStrength', label: 'Klein color anchor strength', area: PROMPT },
  { key: 'kleinEnhancerIdentityPreset', label: 'Klein identity preset', area: PROMPT },
  { key: 'modelResolutionOrientation', label: 'Orientation', area: PROMPT },
  { key: 'modelResolutionSizeTier', label: 'Size tier', area: PROMPT },
  { key: 'modelSamplerPreset', label: 'Sampler preset', area: PROMPT },
  { key: 'expandWildcards', label: 'Expand wildcards', area: PROMPT },
  { key: 'promptVersioningEnabled', label: 'Prompt versioning', area: PROMPT },
  { key: 'directWorkflowPatching', label: 'Direct workflow patching', area: PATCH },
  { key: 'autoSyncLoaderMaps', label: 'Map new models automatically', area: PATCH },
  { key: 'syncWorkflowLoadersToModel', label: 'Sync workflow loaders to model', area: PATCH },
  { key: 'workflowQueueOptimize', label: 'Optimize workflow on queue', area: PATCH },
  { key: 'workflowGraphEnrich', label: 'Enrich workflow graph', area: PATCH },
  { key: 'workflowSdxlRefinerEnrich', label: 'SDXL refiner enrich', area: PATCH },
  { key: 'workflowNeuralUpscalePolish', label: 'Neural upscale polish', area: PATCH },
  { key: 'workflowSharpenAfterUpscale', label: 'Sharpen after upscale', area: PATCH },
  { key: 'neuralUpscaleTileSize', label: 'Upscale tile size', area: PATCH },
  { key: 'useLibraryUpscaleWorkflow', label: 'Library upscale workflow', area: PATCH },
  { key: 'compactDraftSaves', label: 'Compact draft saves', area: QUEUE },
  { key: 'queueQualityProfile', label: 'Queue quality profile', area: QUEUE },
  { key: 'sessionQueueMode', label: 'Queue mode', area: QUEUE },
  { key: 'editDenoiseStrength', label: 'Edit denoise', area: QUEUE },
  { key: 'turboEditStrength', label: 'Turbo edit strength', area: QUEUE },
  { key: 'faceDetailerDenoise', label: 'Face detailer denoise', area: QUEUE },
  { key: 'autoRetryOnOom', label: 'Retry on out-of-memory', area: VRAM },
  { key: 'oomRetryDowngrade', label: 'Downgrade on OOM retry', area: VRAM },
  { key: 'holdMaxUntilIdle', label: 'Hold Max until idle', area: VRAM },
  { key: 'vramGuardEnabled', label: 'VRAM guard', area: VRAM },
  { key: 'vramGuardMinFreeGb', label: 'VRAM guard minimum free', area: VRAM },
  { key: 'vramGuardAutoThreshold', label: 'VRAM guard sized from the GPU', area: VRAM },
  { key: 'freeVramAfterMax', label: 'Free VRAM after Max', area: VRAM },
  { key: 'ipAdapterStrength', label: 'Identity lock strength', area: CONNECTION },
  { key: 'identityKind', label: 'Identity lock kind', area: CONNECTION },
  { key: 'sessionLlmEnabled', label: 'LLM on for this browser', area: LLM },
  { key: 'sessionLlmProvider', label: 'LLM provider', area: LLM },
  { key: 'sessionLlmModel', label: 'LLM text model', area: LLM },
  { key: 'sessionLlmVisionModel', label: 'LLM vision model', area: LLM },
  { key: 'sessionLlmTemperature', label: 'LLM temperature', area: LLM },
  { key: 'sessionAllowTemplateFallback', label: 'Template fallback', area: LLM },
  { key: 'galleryWorkflowRetentionDays', label: 'Workflow retention (days)', area: DATA },
  { key: 'galleryWorkflowMaxBytes', label: 'Workflow storage cap', area: DATA },
];

export type ChangedSetting = {
  key: keyof SharedToolSettings;
  label: string;
  area: Area;
  value: string;
  defaultValue: string;
};

/** Short display of a setting value. */
export function formatSettingValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') return String(Math.round(value * 1000) / 1000);
  if (typeof value === 'string') return value.length > 48 ? `${value.slice(0, 47)}…` : value;
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  const size = Object.keys(value as object).length;
  return `${size} entr${size === 1 ? 'y' : 'ies'}`;
}

function same(a: unknown, b: unknown): boolean {
  // Unset means "the default" for these preferences.
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Preferences whose value differs from the defaults, in list order. */
export function changedSettings(
  shared: Partial<SharedToolSettings>,
  defaults: Partial<SharedToolSettings>
): ChangedSetting[] {
  return PREFERENCE_KEYS.flatMap(({ key, label, area }) => {
    const current = shared[key];
    const fallback = defaults[key];
    if (current === undefined || same(current, fallback)) return [];
    return [
      {
        key,
        label,
        area,
        value: formatSettingValue(current),
        defaultValue: formatSettingValue(fallback),
      },
    ];
  });
}

/** Patch that puts the given keys back to their defaults. */
export function resetSettingsPatch(
  keys: ReadonlyArray<keyof SharedToolSettings>,
  defaults: Partial<SharedToolSettings>
): Partial<SharedToolSettings> {
  return Object.fromEntries(keys.map(key => [key, defaults[key]])) as Partial<SharedToolSettings>;
}
