'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import {
  isDayAdultMood,
  normalizeDayIntimateMix,
  normalizeDayMood,
  dayStillIsFaceFinished,
  dayStillsCachePatch,
  upsertDaySlotStill,
} from '@/lib/day-planner';
import { resolveDayVacationFaceBreakPlate } from '@/lib/day-vacation-face-crop';
import { NO_FACE_ON_PLATE_MESSAGE } from '@/lib/face-locate';
import { comfyInputViewUrl } from '@/lib/face-match-client';
import { planStillFaceFinish, runStillFaceFinish } from '@/lib/face-finish-client';
import { faceFinishAwaitsChecks, type DayChecksGate } from '@/lib/day-finish-order';
import { waitForModelTurn } from '@/lib/comfy-model-turn';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { comfyViewUrlForStill } from '@/lib/still-comfy-url';
import { dayTwoTakesPending } from '@/lib/day-two-takes';

/**
 * Opt-in Day "Face finish": when a still lands, re-render its face against the Cast face crop
 * (see face-finish.ts) and swap the finished image into the slot. One person in frame only —
 * the pass would give a partner her face. Runs one still at a time while the Day queue is idle,
 * and never overwrites a slot that was requeued or changed while the pass ran.
 *
 * Cheap work first: with `checksGate` (Balanced) a take waits until its pose check has settled
 * (a take the check redoes is never finished), and every pass starts with a face probe — a face
 * already close to the Cast face is left as it is (decideFaceFinish), before the pass is held
 * for its model's turn or queued.
 */
function stillKey(still: { imageUrl?: string; promptId?: string }): string {
  return still.promptId?.trim() || still.imageUrl?.trim() || '';
}

/** Longest a pass waits for the app's stills on another model (about three stills). */
const FACE_FINISH_MODEL_HOLD_MS = 120_000;

const FINISHER_LABEL = {
  'qwen-edit': 'Qwen Edit 2511',
  'klein-distilled': 'Klein 9B Distilled',
  rapid: 'Rapid AIO',
} as const;

export function useDayFaceFinish(
  ctx: DayPlannerToolOrchestrationCore,
  checksGate?: DayChecksGate | null
) {
  const { busy, character, mounted, plate, shared, slots, stills, stillsRef } = ctx;
  const { poseGuideExpectRef, toolSettings, updateToolSettings } = ctx;
  const enabled = toolSettings.faceFinish === true;

  const [status, setStatus] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  /**
   * Stills already handled, keyed by prompt id (the still's URL changes when the gallery
   * swaps in its durable copy — keying by URL finished the same still twice and discarded both).
   */
  const handledRef = useRef<Set<string>>(new Set());
  const baselinedRef = useRef(false);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!mounted) return;
    if (stills.length === 0) {
      baselinedRef.current = true;
      handledRef.current = new Set();
      pausedRef.current = false;
      return;
    }
    // Stills already finished when Day mounted belong to an earlier film — leave them.
    if (!baselinedRef.current) {
      baselinedRef.current = true;
      for (const still of stills) {
        if (still.status === 'completed' && still.imageUrl) handledRef.current.add(stillKey(still));
      }
    }
  }, [mounted, stills]);

  useEffect(() => {
    if (!enabled) {
      pausedRef.current = false;
      return;
    }
    if (!mounted || busy || runningRef.current || pausedRef.current || !baselinedRef.current) {
      return;
    }
    const target = slots.find(slot => {
      const still = stills.find(entry => entry.slotId === slot.id);
      return (
        still?.status === 'completed' &&
        Boolean(still.imageUrl) &&
        !dayStillIsFaceFinished(still) &&
        // Two takes: finish the one the player keeps, once picked.
        !dayTwoTakesPending(still) &&
        !handledRef.current.has(stillKey(still)) &&
        !faceFinishAwaitsChecks(checksGate, slot.id, stillKey(still))
      );
    });
    const targetStill = target ? stills.find(entry => entry.slotId === target.id) : undefined;
    if (!target || !targetStill?.imageUrl) return;
    const sourceKey = stillKey(targetStill);
    handledRef.current.add(sourceKey);

    // Headcount: the drawn guide's when there was one, else the Day's companion settings.
    const drawn = poseGuideExpectRef.current[target.id]?.keypoints.length;
    const mood = normalizeDayMood(toolSettings.dayMood);
    const companionsPossible =
      toolSettings.allowCompanions === true ||
      (isDayAdultMood(mood) && normalizeDayIntimateMix(toolSettings.intimateMix) !== 'solo');
    // Two people: only the lead's face is finished (the server tells the faces apart and keeps
    // the pass only when it brings her closer). More than two is left alone.
    const people = drawn != null ? drawn : companionsPossible ? 2 : 1;
    if (people > 2) {
      setStatus(`Face finish skipped on ${target.label} — more than two people in frame.`);
      setTick(value => value + 1);
      return;
    }

    runningRef.current = true;
    void (async () => {
      try {
        setStatus(`Face finish: ${target.label}…`);
        const face = await resolveDayVacationFaceBreakPlate({
          bodyPlate: plate,
          character,
          model: shared.model,
          comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
        });
        if (face.noFaceFound) {
          // The crop is the top of the plate — conditioning the pass on it moved faces away.
          setStatus(`Face finish skipped on ${target.label} — ${NO_FACE_ON_PLATE_MESSAGE}`);
          return;
        }
        const faceUrl = comfyInputViewUrl(face.facePlate?.filename);
        if (!faceUrl) {
          setStatus(`Face finish skipped on ${target.label} — no Cast face crop.`);
          return;
        }
        const comfyStillUrl = comfyViewUrlForStill(targetStill, loadComfyGallery());
        if (!comfyStillUrl) {
          setStatus(
            `Face finish skipped on ${target.label} — its ComfyUI output isn't in the Gallery.`
          );
          return;
        }
        // Probe the faces first (a few seconds): a face already close to hers is left alone.
        setStatus(`Face finish: checking ${target.label}'s face…`);
        const plan = await planStillFaceFinish(comfyStillUrl, {
          faceUrl,
          ...(people === 2 ? { people } : {}),
        });
        if (plan.decision && !plan.decision.finish) {
          const distance = plan.decision.distance;
          setStatus(
            plan.decision.reason === 'close'
              ? `Face finish skipped on ${target.label} — her face is already close${
                  distance !== null ? ` (distance ${distance.toFixed(2)})` : ''
                }.`
              : plan.decision.reason === 'no-reference'
                ? `Face finish skipped on ${target.label} — the Cast face crop shows no face (try a plate where she faces the camera upright).`
                : `Face finish skipped on ${target.label} — could not tell which face is the lead — the still is unchanged.`
          );
          return;
        }
        // Model-aware queue: the pass jumps to the front of ComfyUI's queue, so on another model
        // it would run between this Day's waiting stills — a switch there and one back. Hold it
        // until the app's stills on the current model have run (capped so it is not held long).
        const finishModel = plan.modelKey;
        if (finishModel) {
          await waitForModelTurn({
            modelKey: finishModel,
            maxWaitMs: FACE_FINISH_MODEL_HOLD_MS,
            onWait: blocking =>
              setStatus(
                `Face finish: ${target.label} waits for ${blocking} still${blocking === 1 ? '' : 's'} on the loaded engine…`
              ),
            isCancelled: () => !enabledRef.current,
          });
          setStatus(`Face finish: ${target.label}…`);
        }
        const result = await runStillFaceFinish({
          imageUrl: comfyStillUrl,
          faceUrl,
          ...(people === 2 ? { people } : {}),
          ...(plan.decision ? { probe: plan.probe ?? null } : {}),
        });
        if (!result.available) {
          setStatus(`Face finish skipped on ${target.label} — ${result.reason}`);
          return;
        }
        // Only swap if the slot still shows the image we finished (not requeued meanwhile).
        const current = stillsRef.current.find(entry => entry.slotId === target.id);
        if (current?.status !== 'completed' || stillKey(current) !== sourceKey) {
          setStatus(`Face finish on ${target.label} discarded — the slot changed meanwhile.`);
          return;
        }
        const nextStills = upsertDaySlotStill(stillsRef.current, {
          slotId: target.id,
          imageUrl: result.imageUrl,
          status: 'completed',
          finishedUrl: result.imageUrl,
          finishedFor: current.promptId,
        });
        stillsRef.current = nextStills;
        updateToolSettings(dayStillsCachePatch(nextStills, shared.activeCharacterId));
        setStatus(`Face finish applied to ${target.label} (${FINISHER_LABEL[result.finisher]}).`);
      } catch (error) {
        pausedRef.current = true;
        const message = error instanceof Error ? error.message : 'Face finish failed.';
        setStatus(`Face finish paused: ${message}`);
      } finally {
        runningRef.current = false;
        setTick(value => value + 1);
      }
    })();
  }, [
    busy,
    character,
    checksGate,
    enabled,
    mounted,
    plate,
    poseGuideExpectRef,
    shared.activeCharacterId,
    shared.model,
    slots,
    stills,
    stillsRef,
    tick,
    toolSettings.allowCompanions,
    toolSettings.dayMood,
    toolSettings.intimateMix,
    updateToolSettings,
  ]);

  /** Auto-review waits for this: the still it would review is about to be replaced. */
  const holdsStill = useCallback(
    (still: { imageUrl?: string; promptId?: string }) =>
      enabledRef.current && !handledRef.current.has(stillKey(still)),
    []
  );

  return {
    faceFinishStatus: enabled ? status : null,
    faceFinishTick: tick,
    holdsStillForFaceFinish: holdsStill,
  };
}
