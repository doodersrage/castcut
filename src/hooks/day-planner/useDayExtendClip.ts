'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import type { ClipExtendChoice } from '@/components/ClipExtendSheet';
import {
  clipExtendProgressNote,
  startClipExtend,
  waitForClipExtend,
  type ClipExtendRequest,
} from '@/lib/clip-extend';
import { keepClipInGallery } from '@/lib/clip-gallery-keep';
import { upsertDaySlotStill, type DaySlot } from '@/lib/day-planner';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { loadSettingsCache } from '@/lib/settings-cache';
import { spokenLineHeat } from '@/lib/spoken-line';

/**
 * Day "Make it 30 s": the slot's finished clip grows to about 30 seconds in chained segments
 * (clip-extend-server.ts). The job id is kept on the slot's still, so leaving the page or
 * reloading picks the job up again; the long MP4 is kept in the Gallery and replaces the slot's
 * clip (the short one stays in the Gallery too). One clip at a time; a few minutes.
 */
export function useDayExtendClip(ctx: DayPlannerToolOrchestrationCore) {
  const { stillsRef, toolSettings, updateToolSettings } = ctx;
  const dayMood = toolSettings.dayMood;
  const [extending, setExtending] = useState<{ slotId: string; note: string } | null>(null);
  const [extendResult, setExtendResult] = useState<{ slotId: string; text: string } | null>(null);
  const watchingRef = useRef<string | null>(null);

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

  const patchStill = useCallback(
    (slotId: string, patch: { clipUrl?: string; extendJobId?: string | undefined }) => {
      const latest = stillsRef.current.find(entry => entry.slotId === slotId);
      if (!latest) return;
      updateToolSettings({
        stills: upsertDaySlotStill(stillsRef.current, { ...latest, ...patch }),
      });
    },
    [stillsRef, updateToolSettings]
  );

  /** Wait for the slot's job and put the long clip in place. Resolves to an error, or null. */
  const finishJob = useCallback(
    async (slotId: string, jobId: string, fromUrl: string, prompt: string) => {
      if (watchingRef.current) return 'Already making a clip longer — one at a time.';
      watchingRef.current = slotId;
      setExtending({ slotId, note: 'Making it longer…' });
      try {
        const job = await waitForClipExtend(jobId, {
          onProgress: progress => setExtending({ slotId, note: clipExtendProgressNote(progress) }),
        });
        const latest = stillsRef.current.find(entry => entry.slotId === slotId);
        if (!latest || latest.clipUrl?.trim() !== fromUrl) {
          patchStill(slotId, { extendJobId: undefined });
          return 'The clip changed while it was being made longer — try again.';
        }
        setExtending({ slotId, note: 'Saving to the Gallery…' });
        const kept = await keepClipInGallery({
          url: job.url!,
          kind: 'extend',
          prompt,
          tool: 'day',
          sourcePromptId: latest.clipPromptId,
        });
        patchStill(slotId, { clipUrl: kept.url, extendJobId: undefined });
        return null;
      } catch (error) {
        patchStill(slotId, { extendJobId: undefined });
        return error instanceof Error ? error.message : 'Could not make the clip longer.';
      } finally {
        watchingRef.current = null;
        setExtending(null);
      }
    },
    [patchStill, stillsRef]
  );

  const extendSlotClip = useCallback(
    async (slot: DaySlot, choice?: ClipExtendChoice): Promise<string | null> => {
      const request = extendRequestFor(slot);
      if (!request) return 'This slot has no finished clip.';
      if (watchingRef.current) return 'Already making a clip longer — one at a time.';
      setExtendResult(null);
      try {
        const job = await startClipExtend(
          { ...request, direction: choice?.direction, beats: choice?.beats },
          sharedLlmRequestBody(loadSettingsCache().shared)
        );
        patchStill(slot.id, { extendJobId: job.id });
        return await finishJob(slot.id, job.id, request.clipUrl, `Make it 30 s · ${slot.label}`);
      } catch (error) {
        return error instanceof Error ? error.message : 'Could not make the clip longer.';
      }
    },
    [extendRequestFor, finishJob, patchStill]
  );

  // A job that was running when the page was left: wait for it again.
  const { stills } = ctx;
  useEffect(() => {
    if (watchingRef.current) return;
    const pending = stills.find(still => still.extendJobId && still.clipUrl?.trim());
    if (!pending?.extendJobId || !pending.clipUrl) return;
    const { slotId, extendJobId } = pending;
    const fromUrl = pending.clipUrl.trim();
    const timer = setTimeout(() => {
      void finishJob(slotId, extendJobId, fromUrl, 'Make it 30 s').then(error =>
        setExtendResult({ slotId, text: error ?? 'Done — the clip is now about 30 seconds.' })
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [finishJob, stills]);

  return { extendSlotClip, extendRequestFor, extending, extendResult };
}
