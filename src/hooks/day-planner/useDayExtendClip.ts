'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import type { ClipExtendChoice } from '@/components/ClipExtendSheet';
import {
  clipExtendProgressNote,
  requestClipExtendPlan,
  startClipExtend,
  waitForClipExtend,
  type ClipExtendRequest,
} from '@/lib/clip/extend';
import { dayPartClipPrompt } from '@/lib/day/clip-direction';
import { loadComfyGallery } from '@/lib/gallery/comfyui-gallery';
import { keepClipInGallery } from '@/lib/clip/gallery-keep';
import { upsertDaySlotStill, type DaySlot, type DaySlotStill } from '@/lib/day/planner';
import { sharedLlmRequestBody } from '@/lib/llm/request-options';
import { loadSettingsCache } from '@/lib/settings/cache';
import { spokenLineHeat } from '@/lib/audio/spoken-line';
import { dayTalkExtendBySec, pendingDialogueStep } from '@/lib/day/clip-length';

/**
 * Day "Make it 30 s": the slot's finished clip grows to about 30 seconds in chained segments
 * (clip-extend-server.ts). The job id is kept on the slot's still, so leaving the page or
 * reloading picks the job up again; the long MP4 is kept in the Gallery and replaces the slot's
 * clip (the short one stays in the Gallery too). One clip at a time; a few minutes. Longer
 * dialogue picked in the Animate sheet (DaySlotStill.pendingDialogue) starts here once its first
 * clip lands.
 */
/** Which clip a still shows: its clip job (stable across URL rewrites), else the URL. */
function clipIdentity(still: DaySlotStill): string {
  return still.clipPromptId?.trim() || still.clipUrl?.trim() || '';
}

export function useDayExtendClip(ctx: DayPlannerToolOrchestrationCore) {
  const { stillsRef, toolSettings, updateToolSettings } = ctx;
  const leadIsMan = ctx.character?.traits?.sex === 'man';
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
        // The job that rendered the clip (its WAN graph is replayed), not a kept copy's entry.
        clipPromptId: still.clipRenderPromptId ?? still.clipPromptId,
        scene: slot.sceneHints?.trim() || still.beatKey?.trim() || slot.label,
        setting: slot.location,
        heat: spokenLineHeat(dayMood),
      };
    },
    [dayMood, stillsRef]
  );

  const patchStill = useCallback(
    (slotId: string, patch: Partial<DaySlotStill>) => {
      const latest = stillsRef.current.find(entry => entry.slotId === slotId);
      if (!latest) return;
      const next = upsertDaySlotStill(stillsRef.current, { ...latest, ...patch });
      // At once, so a patch right after this one (or the pending-dialogue effect) sees it.
      stillsRef.current = next;
      updateToolSettings({ stills: next });
    },
    [stillsRef, updateToolSettings]
  );

  /** Wait for the slot's job and put the long clip in place. Resolves to an error, or null. */
  const finishJob = useCallback(
    async (slotId: string, jobId: string, fromClip: string, prompt: string) => {
      if (watchingRef.current) return 'Already making a clip longer — one at a time.';
      watchingRef.current = slotId;
      setExtending({ slotId, note: 'Making it longer…' });
      try {
        const job = await waitForClipExtend(jobId, {
          onProgress: progress => setExtending({ slotId, note: clipExtendProgressNote(progress) }),
        });
        const latest = stillsRef.current.find(entry => entry.slotId === slotId);
        // Same clip = same job id (the gallery sync may rewrite the URL of the same clip).
        if (!latest || clipIdentity(latest) !== fromClip) {
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
        patchStill(slotId, {
          clipUrl: kept.url,
          // The kept copy's entry, so the gallery sync keeps showing it.
          clipPromptId: kept.promptId,
          clipRenderPromptId: latest.clipRenderPromptId ?? latest.clipPromptId,
          extendJobId: undefined,
        });
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
    async (
      slot: DaySlot,
      choice?: ClipExtendChoice,
      length?: Pick<ClipExtendRequest, 'targetSec' | 'extendBySec'> & { label?: string }
    ): Promise<string | null> => {
      const request = extendRequestFor(slot);
      if (!request) return 'This slot has no finished clip.';
      if (watchingRef.current) return 'Already making a clip longer — one at a time.';
      setExtendResult(null);
      try {
        const llm = sharedLlmRequestBody(loadSettingsCache().shared);
        // M11 T1: each wordless part gets its own prompt from its beat, built the way the first
        // clip's was — else an H3 / WAN part replays the first clip's prompt, action and all.
        // No beats given: written first (the same plan "Make it 30 s" writes them with).
        const talkingParts = Boolean(choice?.lines?.some(line => line.trim()));
        let beats = choice?.beats?.map(beat => beat.trim()).filter(Boolean);
        if (!talkingParts && !beats?.length) {
          const plan = await requestClipExtendPlan(
            {
              ...request,
              direction: choice?.direction,
              targetSec: length?.targetSec,
              extendBySec: length?.extendBySec,
            },
            llm
          ).catch(() => null);
          beats = plan?.beats.map(beat => beat.trim()).filter(Boolean);
        }
        const still = stillsRef.current.find(entry => entry.slotId === slot.id);
        const stillPrompt = still?.promptId
          ? loadComfyGallery().find(entry => entry.promptId === still.promptId)?.prompt
          : undefined;
        const partPrompts =
          !talkingParts && beats?.length
            ? beats.map(beat =>
                dayPartClipPrompt({
                  slot,
                  beat,
                  characterName: ctx.character?.name,
                  dayMood,
                  stillPrompt,
                  manLead: leadIsMan,
                })
              )
            : undefined;
        const job = await startClipExtend(
          {
            ...request,
            direction: choice?.direction,
            beats: talkingParts ? choice?.beats : beats,
            ...(partPrompts ? { partPrompts } : {}),
            lines: choice?.lines,
            tones: choice?.tones,
            lead: leadIsMan ? 'man' : 'woman',
            targetSec: length?.targetSec,
            extendBySec: length?.extendBySec,
          },
          llm
        );
        patchStill(slot.id, { extendJobId: job.id });
        const started = stillsRef.current.find(entry => entry.slotId === slot.id);
        return await finishJob(
          slot.id,
          job.id,
          started ? clipIdentity(started) : request.clipUrl,
          `${length?.label ?? 'Make it 30 s'} · ${slot.label}`
        );
      } catch (error) {
        return error instanceof Error ? error.message : 'Could not make the clip longer.';
      }
    },
    [ctx.character?.name, dayMood, extendRequestFor, finishJob, leadIsMan, patchStill, stillsRef]
  );

  // A job that was running when the page was left: wait for it again.
  const { stills } = ctx;
  useEffect(() => {
    if (watchingRef.current) return;
    const pending = stills.find(still => still.extendJobId && still.clipUrl?.trim());
    if (!pending?.extendJobId || !pending.clipUrl) return;
    const { slotId, extendJobId } = pending;
    const fromClip = clipIdentity(pending);
    const timer = setTimeout(() => {
      void finishJob(slotId, extendJobId, fromClip, 'Make it 30 s').then(error =>
        setExtendResult({ slotId, text: error ?? 'Done — the clip is now about 30 seconds.' })
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [finishJob, stills]);

  // Longer dialogue from the Animate sheet: once the clip it was queued with lands, continue it
  // in parts, one line each; a failed or replaced clip drops it. One extension at a time — a
  // slot waiting behind another job starts when that one is done (the stills change then).
  const { slots } = ctx;
  const dialogueRef = useRef(false);
  // Bumped when a dialogue job ends, so a slot waiting behind it is looked at again.
  const [dialogueTick, setDialogueTick] = useState(0);
  useEffect(() => {
    if (watchingRef.current || dialogueRef.current) return;
    if (
      !stills.some(
        still => pendingDialogueStep(still) === 'start' || pendingDialogueStep(still) === 'drop'
      )
    ) {
      return;
    }
    const timer = setTimeout(() => {
      if (watchingRef.current || dialogueRef.current) return;
      for (const still of stillsRef.current) {
        const step = pendingDialogueStep(still);
        if (step === 'drop') patchStill(still.slotId, { pendingDialogue: undefined });
        const slot = slots.find(entry => entry.id === still.slotId);
        if (step !== 'start' || !still.pendingDialogue || !slot) continue;
        const { slotId } = still;
        const { lines, tones, beats, targetSec } = still.pendingDialogue;
        // Wordless parts: a MiniMax-H3 clip grown past its own ~5 s shot.
        const spoken = lines.some(line => line.trim());
        // Cleared first and flagged, so a re-render while the job starts cannot start it twice.
        patchStill(slotId, { pendingDialogue: undefined });
        dialogueRef.current = true;
        void extendSlotClip(
          slot,
          { lines, tones, beats },
          {
            // Exactly one part per line, whatever the server measures the first clip at.
            extendBySec: dayTalkExtendBySec(lines.length),
            label: spoken ? `Dialogue, about ${targetSec} s` : `About ${targetSec} s`,
          }
        )
          .then(error =>
            setExtendResult({
              slotId,
              text:
                error ??
                `Done — the ${spoken ? 'dialogue ' : ''}clip is now about ${targetSec} seconds.`,
            })
          )
          .finally(() => {
            dialogueRef.current = false;
            setDialogueTick(tick => tick + 1);
          });
        return;
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [dialogueTick, extendSlotClip, patchStill, slots, stills, stillsRef]);

  return { extendSlotClip, extendRequestFor, extending, extendResult };
}
