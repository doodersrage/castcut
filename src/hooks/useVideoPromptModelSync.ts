'use client';

import { useEffect } from 'react';
import { isVideoModel, resolvePreferredVideoModel } from '@/lib/queue/tool-model';

type UseVideoPromptModelSyncOptions = {
  mounted: boolean;
  sharedModel: string;
  toolModel: string | undefined;
  updateShared: (patch: { model: string }) => void;
  updateToolSettings: (patch: { model: string }) => void;
};

export function useVideoPromptModelSync({
  mounted,
  sharedModel,
  toolModel,
  updateShared,
  updateToolSettings,
}: UseVideoPromptModelSyncOptions) {
  const preferredVideoModel = resolvePreferredVideoModel({
    toolModel,
    sharedModel,
  });

  useEffect(() => {
    if (!mounted) {
      return;
    }
    if (isVideoModel(sharedModel)) {
      if (!toolModel || !isVideoModel(toolModel)) {
        updateToolSettings({ model: sharedModel });
      } else if (toolModel !== sharedModel) {
        updateShared({ model: toolModel });
      }
      return;
    }
    if (preferredVideoModel !== sharedModel) {
      updateShared({ model: preferredVideoModel });
    }
    if ((!toolModel || !isVideoModel(toolModel)) && preferredVideoModel) {
      updateToolSettings({ model: preferredVideoModel });
    }
  }, [mounted, preferredVideoModel, sharedModel, toolModel, updateShared, updateToolSettings]);

  const controlsSharedModel = isVideoModel(sharedModel) ? sharedModel : preferredVideoModel;

  return { preferredVideoModel, controlsSharedModel };
}
