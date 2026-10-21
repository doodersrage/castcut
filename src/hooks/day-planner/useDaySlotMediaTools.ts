'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { keepStillInGallery } from '@/lib/clip/gallery-keep';
import { upsertDaySlotStill, type DaySlot, type DaySlotStill } from '@/lib/day/planner';
import {
  CLIP_JOBS_UPDATED_EVENT,
  orphanedClipJob,
  runClipJob,
  takeKeptClipJobs,
  type ClipJobBody,
  type ClipJobKeep,
  type KeptClip,
} from '@/lib/clip/clip-jobs-tracker';
import { CLIP_JOB_LABEL, type ClipJobTool } from '@/lib/clip/clip-jobs';
import { copyMovesForm, danceForm, lipSyncForm, requestRelight } from '@/lib/media/actions-client';

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
/** The picture the slot shows: its finished take (relit / upscaled) or its still. */
function stillUrlOf(still: DaySlotStill | undefined): string {
  return (
    (still?.finishedFor && still.finishedFor === still.promptId ? still.finishedUrl : '')?.trim() ||
    still?.imageUrl?.trim() ||
    ''
  );
}

function finishedClip(still: DaySlotStill): string {
  const clipUrl = still.clipStatus === 'completed' ? still.clipUrl?.trim() : '';
  if (!clipUrl) throw new Error('This slot has no finished clip.');
  return clipUrl;
}
function shownStill(still: DaySlotStill, needsTake = false): string {
  const stillUrl = stillUrlOf(still);
  if (!stillUrl || (needsTake && !still.promptId)) throw new Error('This slot has no still yet.');
  return stillUrl;
}

/** How a job's result is filed in the Gallery: Upscale a still, the rest a clip. */
function dayJobKeep(tool: ClipJobTool, still: DaySlotStill, prompt: string): ClipJobKeep {
  return tool === 'upscale'
    ? { media: 'still', kind: 'upscale', prompt, tool: 'day', sourcePromptId: still.promptId }
    : { kind: tool, prompt, tool: 'day', sourcePromptId: still.clipPromptId ?? still.promptId };
}

/** A job's result on the slot: an upscale is the shown still for this take, a clip its clip. */
function dayJobPatch(
  tool: ClipJobTool,
  still: DaySlotStill,
  kept: KeptClip
): Partial<DaySlotStill> {
  return tool === 'upscale'
    ? // Shown in place of the take while it is this take (a requeue drops it).
      { finishedUrl: kept.url, finishedFor: still.promptId }
    : keptClipPatch(still, kept);
}

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

  /**
   * A long finishing pass as a background job (Sharpen & smooth, Make more realistic, Copy moves,
   * Dance, Lip-sync, Upscale): the jobs tray follows it, and its result is kept in the Gallery
   * and put on the slot — also when the page was reloaded meanwhile (see below).
   */
  const slotJob = useCallback(
    (
      slot: DaySlot,
      tool: ClipJobTool,
      build: (still: DaySlotStill) => { body: ClipJobBody; source: string }
    ) =>
      run(slot, tool, async still => {
        const { body, source } = build(still);
        const label = `${CLIP_JOB_LABEL[tool]} · ${slot.label}`;
        const kept = await runClipJob({
          tool,
          body,
          keep: dayJobKeep(tool, still, label),
          owner: { feature: 'day', ref: slot.id },
          source,
          label,
        });
        return dayJobPatch(tool, still, kept);
      }),
    [run]
  );

  const finishSlotClip = useCallback(
    (slot: DaySlot) =>
      slotJob(slot, 'finish', still => {
        const clipUrl = finishedClip(still);
        return { body: { clipUrl }, source: clipUrl };
      }),
    [slotJob]
  );
  const realismSlotClip = useCallback(
    (slot: DaySlot) =>
      slotJob(slot, 'realism', still => {
        const clipUrl = finishedClip(still);
        return { body: { clipUrl }, source: clipUrl };
      }),
    [slotJob]
  );

  // A job that outlived the page (a reload, another page meanwhile): its slot shows busy while it
  // runs, and gets the result once kept — if the slot still has what the job started from
  // (otherwise the new clip or still just stays in the Gallery).
  const [orphan, setOrphan] = useState<{ slotId: string; tool: DaySlotMediaTool } | null>(null);
  useEffect(() => {
    const sync = () => {
      takeKeptClipJobs('day', entry => {
        const still = stillsRef.current.find(item => item.slotId === entry.owner?.ref);
        if (!still) return false;
        const from =
          entry.tool === 'finish' || entry.tool === 'realism' ? still.clipUrl : stillUrlOf(still);
        if (entry.kept && (!entry.source || from?.trim() === entry.source)) {
          updateToolSettings({
            stills: upsertDaySlotStill(stillsRef.current, {
              ...still,
              ...dayJobPatch(entry.tool, still, entry.kept),
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
      slotJob(slot, 'moves', still => {
        const stillUrl = shownStill(still);
        return {
          body: copyMovesForm({
            video,
            stillUrl,
            look: (character?.descriptor || character?.hints || '').trim(),
            place: slot.location?.trim() || undefined,
            motion: options.motion?.trim() || undefined,
            keepSound: options.keepSound,
          }),
          source: stillUrl,
        };
      }),
    [character, slotJob]
  );

  const danceSlot = useCallback(
    (slot: DaySlot, music: Blob, options: { style: string; amplitude: string; start?: number }) =>
      slotJob(slot, 'dance', still => {
        const stillUrl = shownStill(still);
        return { body: danceForm({ music, stillUrl, ...options }), source: stillUrl };
      }),
    [slotJob]
  );

  const lipSyncSlot = useCallback(
    (slot: DaySlot, audio: Blob, audio2?: Blob | null) =>
      slotJob(slot, 'lip-sync', still => {
        const stillUrl = shownStill(still);
        const scene = (slot.sceneHints?.trim() || slot.label).slice(0, 200);
        return {
          body: lipSyncForm({
            audio,
            audio2,
            stillUrl,
            prompt: `${scene}. The person talks to the camera, natural expressions and small head movements.`,
          }),
          source: stillUrl,
        };
      }),
    [slotJob]
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
      slotJob(slot, 'upscale', still => {
        const stillUrl = shownStill(still, true);
        return { body: { stillUrl, target: '4k' }, source: stillUrl };
      }),
    [slotJob]
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
