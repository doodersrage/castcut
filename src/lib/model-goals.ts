/**
 * Goal-based model picks — hide the 40+ list behind Photoreal / Illustration / Edit / Video.
 */

import type { ComfyImageModel } from './comfy-models/client';
import { getComfyModelDefinition } from './comfy-models/client';

export type ModelGoalId = 'photoreal' | 'illustration' | 'edit' | 'video';

export type ModelGoalOption = {
  id: ModelGoalId;
  label: string;
  description: string;
  /** Preferred Comfy model id when the tool can queue it. */
  model: ComfyImageModel;
  /** Optional deep-link when the goal belongs on another tool (e.g. Video). */
  href?: string;
};

export const MODEL_GOAL_OPTIONS: ModelGoalOption[] = [
  {
    id: 'photoreal',
    label: 'Photorealistic',
    description: 'People and scenes with photographic detail.',
    model: 'flux-ultrareal-v4',
  },
  {
    id: 'illustration',
    label: 'Illustration',
    description: 'Fast illustrated / graphic stills.',
    model: 'flux-2-klein-9b-distilled',
  },
  {
    id: 'edit',
    label: 'Editing',
    description: 'Instruction edits and img2img — Refine / Compose preferred.',
    model: 'qwen-image-edit-2511',
    href: '/refine',
  },
  {
    id: 'video',
    label: 'Video',
    description: 'Motion clips — WAN / Hunyuan / LTX on Video.',
    model: 'wan-video',
    href: '/video',
  },
];

export function resolveModelGoalOption(id: ModelGoalId): ModelGoalOption | undefined {
  return MODEL_GOAL_OPTIONS.find(entry => entry.id === id);
}

/** Prefer the goal’s model when it is in the allowed picker list; otherwise first allowed match by family. */
export function resolveModelForGoal(
  goalId: ModelGoalId,
  allowedModels?: readonly ComfyImageModel[] | null
): ComfyImageModel | null {
  const option = resolveModelGoalOption(goalId);
  if (!option) {
    return null;
  }
  if (!allowedModels || allowedModels.length === 0) {
    return option.model;
  }
  if (allowedModels.includes(option.model)) {
    return option.model;
  }
  const category = getComfyModelDefinition(option.model).category;
  const sameFamily = allowedModels.find(
    model => getComfyModelDefinition(model).category === category
  );
  return sameFamily ?? allowedModels[0] ?? null;
}
