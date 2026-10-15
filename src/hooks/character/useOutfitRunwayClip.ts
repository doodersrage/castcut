'use client';

import { useCallback } from 'react';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { waitForGalleryPromptIds } from '@/lib/best-of-n-vision-queue';
import { runwayClipPrompt } from '@/lib/cast-wardrobe';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';
import { RUNWAY_CLIP_MODEL } from '@/lib/outfit-runway';

/** Make an outfit's runway clip (a full turn, runwayClipPrompt) from its picture; the clip's URL. */
export function useOutfitRunwayClip(): (input: {
  castId: string;
  imageUrl: string;
  man: boolean;
}) => Promise<string> {
  const actions = usePromptResultActions({ tool: 'video', model: RUNWAY_CLIP_MODEL });
  return useCallback(
    async ({ castId, imageUrl, man }) => {
      const promptId = await actions.sendComfyUi(runwayClipPrompt(man), undefined, undefined, {
        queueTool: 'video',
        queueModel: RUNWAY_CLIP_MODEL,
        inputImageUrl: imageUrl,
        derivedKind: 'i2v',
        clipMode: 'i2v',
        qualityProfile: 'final',
        queueParamsBase: { videoFrames: 96, videoFps: 16 },
        characterId: castId,
      });
      const id = typeof promptId === 'string' ? promptId.trim() : '';
      if (!id) throw new Error('The clip was not queued.');
      const [entry] = await waitForGalleryPromptIds([id], { timeoutMs: 8 * 60_000, pollMs: 3_000 });
      const url = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
      if (!url) throw new Error('The clip did not finish — check the queue.');
      return url;
    },
    [actions]
  );
}
