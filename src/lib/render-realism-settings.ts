'use client';

import { loadSettingsCache } from './settings-cache';
import {
  DEFAULT_RENDER_REALISM_MODE,
  normalizeRenderRealismMode,
  type RenderRealismMode,
} from './render-realism';
import {
  DEFAULT_POSE_GUIDE_STYLE,
  poseGuideStyleForModel,
  type PoseGuideStylePreference,
} from './pose-guide-prompt';

export function loadRenderRealismMode(): RenderRealismMode {
  if (typeof window === 'undefined') {
    return DEFAULT_RENDER_REALISM_MODE;
  }

  return normalizeRenderRealismMode(loadSettingsCache().shared.renderRealismMode);
}

/**
 * Settings → Prompt quality → Pose guide style (read at queue time by Day / Story).
 * Pass the queue model: FLUX.2 Klein always gets OpenPose (see poseGuideStyleForModel).
 */
export function loadPoseGuideStylePreference(model?: string | null): PoseGuideStylePreference {
  if (typeof window === 'undefined') {
    return DEFAULT_POSE_GUIDE_STYLE;
  }
  return poseGuideStyleForModel(loadSettingsCache().shared.poseGuideStyle, model);
}
