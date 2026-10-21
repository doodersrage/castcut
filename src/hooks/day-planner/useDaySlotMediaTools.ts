'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { keepClipInGallery, keepStillInGallery } from '@/lib/clip/gallery-keep';
import { upsertDaySlotStill, type DaySlot, type DaySlotStill } from '@/lib/day/planner';
import {
  CLIP_JOBS_UPDATED_EVENT,
  orphanedClipJob,
  runClipJob,
  takeKeptClipJobs,
  type KeptClip,
} from '@/lib/clip/clip-jobs-tracker';
import { CLIP_JOB_LABEL, type ClipJobTool } from '@/lib/clip/clip-jobs';
import {
  requestCopyMoves,
  requestDanceToMusic,
  requestLipSync,
  requestRelight,
  requestUpscaleStill,
} from '@/lib/media/actions-client';

export type DaySlotMediaTool =
  'finish' | 'realism' | 'moves' | 'dance' | 'lip-sync' | 'relight' | 'sketch' | 'upscale';

/** What each tool says while it works (the board shows it on the card's menu item). */
export const DAY_SLOT_MEDIA_BUSY: Record<DaySlotMediaTool, string> = {
  finish: 'Sharpening…',
  realism: 'Making it more realistic…',
  moves: 'Copying moves…',
  dance: 'Dancing…',
  'lip-sync': 'Lip-syncing…',
  relight: 'Relighting…',
  sketch: 'Keeping the sketch…',
  upscale: 'Upscaling to 4K…',
};

/**
 * Day's finishing tools on a slot: Sharpen & smooth its clip (SeedVR2 + RIFE), Make it more
 * realistic (a low-strength WAN 2.2 re-render), Copy moves from a
 * video onto its still (Wan Animate 2), Lip-sync its still to a recording (InfiniteTalk), and
 * Relight its still. The result is kept in the Gallery (a child of the original, which stays)
 * and replaces the slot's clip — or, for Relight, the picture the slot shows (finishedUrl).
 * One at a time: these are minutes-long GPU jobs.
 */
/** A kept clip as the slot's clip fields. */
function keptClipPatch(still: DaySlotStill, kept: KeptClip): Partial<DaySlotStill> {
  return {
    clipUrl: kept.url,
    clipStatus: 'completed',
    clipPromptId: kept.promptId,
    clipRenderPromptId: still.clipRenderPromptId ?? still.clipPromptId,
  };
}

export function useDaySlotMediaTools(ctx: DayPlannerToolOrchestrationCore) {
  const { character, stillsRef, updateToolSettings } = ctx;
  const [busy, setBusy] = useState<{ slotId: string; tool: DaySlotMediaTool } | null>(null);
  const busyRef = useRef(false);

  const stillUrlOf = (still: DaySlotStill | undefined) =>
    (still?.finishedFor && still.finishedFor === still.promptId ? still.finishedUrl : '')?.trim() ||
    still?.imageUrl?.trim() ||
    '';

  const run = useCallback(
    async (
      slot: DaySlot,
      tool: DaySlotMediaTool,
      work: (still: DaySlotStill) => Promise<Partial<DaySlotStill>>
    ): Promise<string | null> => {
      const still = stillsRef.current.find(entry => entry.slotId === slot.id);
      if (!still) return 'This slot has nothing to work on yet.';
      if (busyRef.current) return 'Another finishing job is running — one at a time.';
      busyRef.current = true;
      setBusy({ slotId: slot.id, tool });
      try {
        const patch = await work(still);
        const now = stillsRef.current.find(entry => entry.slotId === slot.id) ?? still;
        updateToolSettings({ stills: upsertDaySlotStill(stillsRef.current, { ...now, ...patch }) });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : 'That did not work.';
      } finally {
        busyRef.current = false;
        setBusy(null);
      }
    },
    [stillsRef, updateToolSettings]
  );

  /** The new clip kept in the Gallery and made the slot's clip (the old one stays there). */
  const clipPatch = async (
    still: DaySlotStill,
    url: string,
    kind: 'finish' | 'realism' | 'moves' | 'dance' | 'lip-sync',
    prompt: string
  ): Promise<Partial<DaySlotStill>> =>
    keptClipPatch(
      still,
      await keepClipInGallery({
        url,
        kind,
        prompt,
        tool: 'day',
        sourcePromptId: still.clipPromptId ?? still.promptId,
      })
    );

  /** Sharpen & smooth / Make more realistic: a background job the jobs tray follows. */
  const clipJob = useCallback(
    (slot: DaySlot, tool: ClipJobTool) =>
      run(slot, tool, async still => {
        const clipUrl = still.clipStatus === 'completed' ? still.clipUrl?.trim() : '';
        if (!clipUrl) throw new Error('This slot has no finished clip.');
        const label = `${CLIP_JOB_LABEL[tool]} · ${slot.label}`;
        const kept = await runClipJob({
          tool,
          body: { clipUrl },
          keep: {
            kind: tool,
            prompt: label,
            tool: 'day',
            sourcePromptId: still.clipPromptId ?? still.promptId,
          },
          owner: { feature: 'day', ref: slot.id },
          label,
        });
        return keptClipPatch(still, kept);
      }),
    [run]
  );
  const finishSlotClip = useCallback((slot: DaySlot) => clipJob(slot, 'finish'), [clipJob]);
  const realismSlotClip = useCallback((slot: DaySlot) => clipJob(slot, 'realism'), [clipJob]);

  // A clip job that outlived the page (a reload, another page meanwhile): show its slot busy
  // while it runs, and put its clip in place once it's kept — if the slot still has the clip it
  // started from (otherwise the new one just stays in the Gallery).
  const [orphan, setOrphan] = useState<{ slotId: string; tool: DaySlotMediaTool } | null>(null);
  useEffect(() => {
    const sync = () => {
      takeKeptClipJobs('day', entry => {
        const still = stillsRef.current.find(item => item.slotId === entry.owner?.ref);
        if (!still) return false;
        if (entry.kept && still.clipUrl?.trim() === entry.body.clipUrl) {
          updateToolSettings({
            stills: upsertDaySlotStill(stillsRef.current, {
              ...still,
              ...keptClipPatch(still, entry.kept),
            }),
          });
        }
        return true;
      });
      const running = orphanedClipJob('day');
      setOrphan(running?.owner ? { slotId: running.owner.ref, tool: running.tool } : null);
    };
    sync();
    window.addEventListener(CLIP_JOBS_UPDATED_EVENT, sync);
    return () => window.removeEventListener(CLIP_JOBS_UPDATED_EVENT, sync);
  }, [stillsRef, updateToolSettings]);

  const copyMovesToSlot = useCallback(
    (slot: DaySlot, video: Blob, options: { motion?: string; keepSound?: boolean } = {}) =>
      run(slot, 'moves', async still => {
        const stillUrl = stillUrlOf(still);
        if (!stillUrl) throw new Error('This slot has no still yet.');
        const url = await requestCopyMoves({
          video,
          stillUrl,
          look: (character?.descriptor || character?.hints || '').trim(),
          place: slot.location?.trim() || undefined,
          motion: options.motion?.trim() || undefined,
          keepSound: options.keepSound,
        });
        return clipPatch(still, url, 'moves', `Copy moves · ${slot.label}`);
      }),
    [character, run]
  );

  const danceSlot = useCallback(
    (slot: DaySlot, music: Blob, options: { style: string; amplitude: string; start?: number }) =>
      run(slot, 'dance', async still => {
        const stillUrl = stillUrlOf(still);
        if (!stillUrl) throw new Error('This slot has no still yet.');
        const url = await requestDanceToMusic({ music, stillUrl, ...options });
        return clipPatch(still, url, 'dance', `Dance to music · ${slot.label}`);
      }),
    [run]
  );

  const lipSyncSlot = useCallback(
    (slot: DaySlot, audio: Blob, audio2?: Blob | null) =>
      run(slot, 'lip-sync', async still => {
        const stillUrl = stillUrlOf(still);
        if (!stillUrl) throw new Error('This slot has no still yet.');
        const scene = (slot.sceneHints?.trim() || slot.label).slice(0, 200);
        const url = await requestLipSync({
          audio,
          audio2,
          stillUrl,
          prompt: `${scene}. The person talks to the camera, natural expressions and small head movements.`,
        });
        return clipPatch(still, url, 'lip-sync', `Lip-sync · ${slot.label}`);
      }),
    [run]
  );

  const relightSlot = useCallback(
    (slot: DaySlot, look: string) =>
      run(slot, 'relight', async still => {
        const stillUrl = stillUrlOf(still);
        if (!stillUrl || !still.promptId) throw new Error('This slot has no still yet.');
        const url = await requestRelight(stillUrl, look);
        const kept = await keepStillInGallery({
          url,
          kind: 'relight',
          prompt: `Relight · ${slot.label}`,
          tool: 'day',
          sourcePromptId: still.promptId,
        });
        // Shown in place of the take while it is this take (a requeue drops it).
        return { finishedUrl: kept.url, finishedFor: still.promptId };
      }),
    [run]
  );

  const upscaleSlot = useCallback(
    (slot: DaySlot) =>
      run(slot, 'upscale', async still => {
        const stillUrl = stillUrlOf(still);
        if (!stillUrl || !still.promptId) throw new Error('This slot has no still yet.');
        const url = await requestUpscaleStill(stillUrl, '4k');
        const kept = await keepStillInGallery({
          url,
          kind: 'upscale',
          prompt: `Upscale · ${slot.label}`,
          tool: 'day',
          sourcePromptId: still.promptId,
        });
        return { finishedUrl: kept.url, finishedFor: still.promptId };
      }),
    [run]
  );

  /** A sketch rendered in the Sketch sheet becomes the shown still (kept in the Gallery). */
  const applySketchToSlot = useCallback(
    async (slot: DaySlot, url: string): Promise<string | null> => {
      const still = stillsRef.current.find(entry => entry.slotId === slot.id);
      if (!still?.promptId) return 'This slot has no still yet.';
      const kept = await keepStillInGallery({
        url,
        kind: 'sketch',
        prompt: `Sketch · ${slot.label}`,
        tool: 'day',
        sourcePromptId: still.promptId,
      });
      const now = stillsRef.current.find(entry => entry.slotId === slot.id) ?? still;
      updateToolSettings({
        stills: upsertDaySlotStill(stillsRef.current, {
          ...now,
          finishedUrl: kept.url,
          finishedFor: now.promptId,
        }),
      });
      return null;
    },
    [stillsRef, updateToolSettings]
  );

  return {
    busy: busy ?? orphan,
    finishSlotClip,
    realismSlotClip,
    copyMovesToSlot,
    danceSlot,
    lipSyncSlot,
    relightSlot,
    upscaleSlot,
    applySketchToSlot,
    stillUrlOf,
  };
}
