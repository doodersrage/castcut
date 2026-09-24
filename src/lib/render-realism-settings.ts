'use client';

import { loadSettingsCache } from './settings-cache';
import {
  DEFAULT_RENDER_REALISM_MODE,
  normalizeRenderRealismMode,
  type RenderRealismMode,
} from './render-realism';
import {
  DEFAULT_POSE_GUIDE_STYLE,
  normalizePoseGuideStylePreference,
  type PoseGuideStylePreference,
} from './pose-guide-prompt';

export function loadRenderRealismMode(): RenderRealismMode {
  if (typeof window === 'undefined') {
    return DEFAULT_RENDER_REALISM_MODE;
  }

  return normalizeRenderRealismMode(loadSettingsCache().shared.renderRealismMode);
}

/** Settings → Prompt quality → Pose guide style (read at queue time by Day / Story). */
export function loadPoseGuideStylePreference(): PoseGuideStylePreference {
  if (typeof window === 'undefined') {
    return DEFAULT_POSE_GUIDE_STYLE;
  }
  return normalizePoseGuideStylePreference(loadSettingsCache().shared.poseGuideStyle);
}
