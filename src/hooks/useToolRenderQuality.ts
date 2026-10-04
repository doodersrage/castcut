'use client';

import { useCallback } from 'react';
import { renderQualityProfile, type RenderQuality } from '@/lib/render-quality';
import {
  loadSettingsCache,
  notifySettingsCacheUpdated,
  saveSharedSettings,
  type SharedToolSettings,
} from '@/lib/settings-cache';

/**
 * Write a tool's render quality (Good / Best) to its queue quality profile — the same path as
 * the Engine panel's chips: the tool's entry beats the global. Used by the Quality presets
 * (Day, Outfit) so picking one is one shared write.
 */
export function useToolRenderQuality(
  toolId: string,
  updateShared: (partial: Partial<SharedToolSettings>) => void
): (next: RenderQuality) => void {
  return useCallback(
    (next: RenderQuality) => {
      const profiles = {
        ...(loadSettingsCache().shared.toolQueueQualityProfiles ?? {}),
        [toolId]: renderQualityProfile(next),
      };
      saveSharedSettings(
        { ...loadSettingsCache().shared, toolQueueQualityProfiles: profiles },
        { notify: false }
      );
      updateShared({ toolQueueQualityProfiles: profiles });
      // The Engine chip re-reads settings on this event.
      notifySettingsCacheUpdated();
    },
    [toolId, updateShared]
  );
}
