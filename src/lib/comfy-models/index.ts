import type { DetailLevel } from '../prompt/detail-level';
import {
  buildProfileClarityAddendum,
  buildProfileSystemPrompt,
  buildProfileUserDirective,
  fluxIgnoresNegative,
  getProfileFewShots,
} from './prompt-profiles';
import { enforcePromptShapeForProfile } from '../prompt/shape';
import { compactPromptForProfile } from '../prompt/compact';
import { getComfyModelDefinition, type ComfyImageModel } from './client';

export {
  COMFY_IMAGE_MODELS,
  COMFY_MODEL_CATEGORIES,
  COMFY_MODEL_IDS,
  DEFAULT_COMFY_MODEL,
  normalizeComfyModel,
  getComfyModelDefinition,
  getPromptLimits,
  comfyModelLabel,
} from './client';
export type {
  ComfyImageModel,
  ComfyImageModelDefinition,
  ComfyModelCategory,
  PromptLimits,
  PromptProfileId,
  QwenImageModel,
  QwenModelDefinition,
} from './client';
export {
  expansionBeatsForProfile,
  fluxIgnoresNegative,
  isEditInstructionProfile,
  shouldEnforceMinPadding,
} from './prompt-profiles';

export function buildModelSystemPrompt(
  model: ComfyImageModel,
  mode: 'positive' | 'negative'
): string {
  return buildProfileSystemPrompt(getComfyModelDefinition(model), mode);
}

function isCfg1DistilledModelId(model: ComfyImageModel): boolean {
  return /lightning|rapid-aio|z-image-turbo|boogu-image-turbo|boogu-image-edit-turbo/i.test(model);
}

export function buildModelClarityAddendum(detail: DetailLevel, model: ComfyImageModel): string {
  const base = buildProfileClarityAddendum(detail, getComfyModelDefinition(model));
  if (!isCfg1DistilledModelId(model)) {
    return base;
  }
  if (/^boogu-image/i.test(model)) {
    return `${base} CFG-1 Boogu Turbo: keep prompts short — one subject, simple pose, plain wardrobe. Avoid intricate lattice/mesh harnesses, multi-figure layouts, and crowded props; 4-step distillation hallucinates complex patterns and extra limbs.`;
  }
  if (model === 'z-image-turbo') {
    return `${base} CFG-1 Z-Image Turbo: one subject, simple scene — avoid ornate repeating patterns, multi-panel layouts, and dense prop lists at few steps.`;
  }
  return `${base} CFG-1 distilled stack: prefer scene-specific nouns (garments, materials, colors, pose) over generic quality tags. Do not pad with empty lighting filler.`;
}

export function buildModelUserDirective(detail: DetailLevel, model: ComfyImageModel): string {
  return buildProfileUserDirective(detail, getComfyModelDefinition(model));
}

export function getModelFewShots(
  model: ComfyImageModel,
  detail: DetailLevel,
  fallback: import('../prompt/detail-level').FewShotExample[]
): import('../prompt/detail-level').FewShotExample[] {
  return getProfileFewShots(getComfyModelDefinition(model), detail, fallback);
}

export function formatPromptForModel(
  prompt: string,
  model: ComfyImageModel,
  input: string,
  mode: 'positive' | 'negative'
): string {
  const def = getComfyModelDefinition(model);
  let shaped = enforcePromptShapeForProfile(prompt, def.profile, mode, input.trim());
  if (mode === 'positive') {
    shaped = compactPromptForProfile(shaped, def.profile);
  }
  return shaped;
}

export function modelUsesFluxNegativeRewrite(model: ComfyImageModel): boolean {
  return fluxIgnoresNegative(getComfyModelDefinition(model).profile);
}
