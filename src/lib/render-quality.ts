import type { QueueQualityProfile } from './queue-quality-profile';

/**
 * A tool's render quality as its Quality preset sees it: the Engine's two real levels. Best is
 * the Engine's Best (`max`); Good covers Good (`final`), Fast (`draft`, which every real queue
 * promotes to Good anyway) and Custom (`followSettings`). Day and Outfit map their presets
 * through this.
 */
export type RenderQuality = 'good' | 'best';

export function renderQualityFromProfile(profile: QueueQualityProfile | undefined): RenderQuality {
  return profile === 'max' ? 'best' : 'good';
}

export function renderQualityProfile(quality: RenderQuality): QueueQualityProfile {
  return quality === 'best' ? 'max' : 'final';
}

export function renderQualityLabel(quality: RenderQuality): string {
  return quality === 'best' ? 'Best' : 'Good';
}
