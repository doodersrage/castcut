'use client';

import { useCallback, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { requestClipExtend, type ClipExtendRequest } from '@/lib/clip-extend';
import type { ClipExtendChoice } from '@/components/ClipExtendSheet';
import { upsertDaySlotStill, type DaySlot } from '@/lib/day-planner';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { loadSettingsCache } from '@/lib/settings-cache';
import { spokenLineHeat } from '@/lib/spoken-line';

/**
 * Day "Make it 30 s": the slot's finished clip grows to about 30 seconds in chained segments
 * (clip-extend-server.ts) and the long MP4 replaces the slot's clip (the short one stays in the
 * Gallery). One clip at a time; a few minutes.
 */
export function useDayExtendClip(ctx: DayPlannerToolOrchestrationCore) {
  const { stillsRef, toolSettings, updateToolSettings } = ctx;
  const dayMood = toolSettings.dayMood;
  const [extending, setExtending] = useState<{ slotId: string; note: string } | null>(null);
  const busyRef = useRef(false);
  /** The slot's clip and scene for "Make it 30 s" (null without a finished clip). */
  const extendRequestFor = useCallback(
    (slot: DaySlot): Omit<ClipExtendRequest, 'direction' | 'beats'> | null => {
      const still = stillsRef.current.find(entry => entry.slotId === slot.id);
      const clipUrl = still?.clipStatus === 'completed' ? still.clipUrl?.trim() : '';
      if (!still || !clipUrl) return null;
      return {
        clipUrl,
        clipPromptId: still.clipPromptId,
        scene: slot.sceneHints?.trim() || still.beatKey?.trim() || slot.label,
        setting: slot.location,
        heat: spokenLineHeat(dayMood),
      };
    },
    [dayMood, stillsRef]
  );
  const extendSlotClip = useCallback(
    async (slot: DaySlot, choice?: ClipExtendChoice): Promise<string | null> => {
      const request = extendRequestFor(slot);
      const clipUrl = request?.clipUrl;
      if (!request || !clipUrl) return 'This slot has no finished clip.';
      if (busyRef.current) return 'Already making a clip longer — one at a time.';
      busyRef.current = true;
      setExtending({ slotId: slot.id, note: 'Writing what happens next…' });
      try {
        const job = await requestClipExtend(
          { ...request, direction: choice?.direction, beats: choice?.beats },
          {
            llmBody: sharedLlmRequestBody(loadSettingsCache().shared),
            onProgress: progress =>
              progress.total &&
              setExtending({
                slotId: slot.id,
                note: `Rendering part ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`,
              }),
          }
        );
        const latest = stillsRef.current.find(entry => entry.slotId === slot.id);
        if (!latest || latest.clipUrl?.trim() !== clipUrl) {
          return 'The clip changed while it was being made longer — try again.';
        }
        updateToolSettings({
          stills: upsertDaySlotStill(stillsRef.current, { ...latest, clipUrl: job.url }),
        });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : 'Could not make the clip longer.';
      } finally {
        busyRef.current = false;
        setExtending(null);
      }
    },
    [extendRequestFor, stillsRef, updateToolSettings]
  );
  return { extendSlotClip, extendRequestFor, extending };
}
