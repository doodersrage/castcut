'use client';

import { useCallback } from 'react';
import type { AthleticSport } from '@/lib/scene/athletic-sport-profiles';
import type { SendComfyUiFn, SendComfyUiOptions } from '@/hooks/prompt-result/comfy-ui-types';

export function usePromptResultComfyUiSeedVariation(
  sendComfyUi: SendComfyUiFn,
  setComfyUiStatus: (status: string) => void
) {
  const sendSeedVariationBatch = useCallback(
    async (
      prompt: string,
      count = 3,
      sport?: AthleticSport | null,
      options?: SendComfyUiOptions
    ) => {
      const n = Math.max(1, Math.min(4, Math.trunc(count) || 3));
      if (!prompt.trim()) {
        return { queued: 0, failed: 0 };
      }
      let queued = 0;
      let failed = 0;
      for (let i = 0; i < n; i += 1) {
        try {
          await sendComfyUi(prompt, sport, undefined, options);
          queued += 1;
        } catch {
          failed += 1;
        }
      }
      setComfyUiStatus(
        failed > 0
          ? `Seed batch: ${queued} queued, ${failed} failed.`
          : `Seed batch: queued ${queued} variation${queued === 1 ? '' : 's'}.`
      );
      return { queued, failed };
    },
    [sendComfyUi, setComfyUiStatus]
  );

  return { sendSeedVariationBatch };
}
