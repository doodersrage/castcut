'use client';

import { useCallback } from 'react';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { waitForGalleryPromptIds } from '@/lib/best-of-n/vision-queue';
import { runwayClipPrompt } from '@/lib/cast/wardrobe';
import { galleryEntryPrimaryViewUrl } from '@/lib/gallery/comfyui-gallery';
import type { EngineHealthState } from '@/lib/engine/health-engines';
import {
  pickRunwayClipEngine,
  RUNWAY_CLIP_ENGINES,
  type RunwayClipEngine,
} from '@/lib/wardrobe/outfit-runway';

/** Health of each runway engine, best first, stopping at the first one ComfyUI is ready for. */
async function chooseRunwayEngine(): Promise<RunwayClipEngine> {
  const { checkEngineHealth } = await import('@/lib/engine/health-client');
  const states = new Map<string, EngineHealthState>();
  for (const engine of RUNWAY_CLIP_ENGINES) {
    const state = await checkEngineHealth(engine.model)
      .then(health => health.state)
      .catch((): EngineHealthState => 'unknown');
    states.set(engine.model, state);
    if (state === 'ready') break;
  }
  return pickRunwayClipEngine(model => states.get(model));
}

/**
 * Make an outfit's runway clip (a full turn, runwayClipPrompt) from its picture on the best
 * engine ComfyUI has (outfit-runway.ts); the clip's URL. `onEngine` hears the engine before the
 * clip is queued, for the status line.
 */
export function useOutfitRunwayClip(): (input: {
  castId: string;
  imageUrl: string;
  man: boolean;
  onEngine?: (engine: RunwayClipEngine) => void;
}) => Promise<string> {
  const actions = usePromptResultActions({ tool: 'video', model: RUNWAY_CLIP_ENGINES[0].model });
  return useCallback(
    async ({ castId, imageUrl, man, onEngine }) => {
      const engine = await chooseRunwayEngine();
      onEngine?.(engine);
      // Six seconds at WAN's 16 fps; H3 and LTX-2.5 convert it to their own frame grids.
      const promptId = await actions.sendComfyUi(runwayClipPrompt(man), undefined, undefined, {
        queueTool: 'video',
        queueModel: engine.model,
        inputImageUrl: imageUrl,
        derivedKind: 'i2v',
        clipMode: 'i2v',
        qualityProfile: 'final',
        queueParamsBase: { videoFrames: 96, videoFps: 16 },
        characterId: castId,
      });
      const id = typeof promptId === 'string' ? promptId.trim() : '';
      if (!id) throw new Error('The clip was not queued.');
      // H3 takes minutes, and the shared queue may have jobs ahead of this one.
      const [entry] = await waitForGalleryPromptIds([id], {
        timeoutMs: 20 * 60_000,
        pollMs: 3_000,
      });
      const url = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
      if (!url) throw new Error('The clip did not finish — check the queue.');
      return url;
    },
    [actions]
  );
}
