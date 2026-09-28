'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import {
  isDayAdultMood,
  normalizeDayIntimateMix,
  normalizeDayMood,
  dayStillsCachePatch,
  upsertDaySlotStill,
} from '@/lib/day-planner';
import { resolveDayVacationFaceBreakPlate } from '@/lib/day-vacation-face-crop';
import { comfyInputViewUrl } from '@/lib/face-match-client';
import { runStillFaceFinish } from '@/lib/face-finish-client';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { comfyViewUrlForStill } from '@/lib/still-comfy-url';

/**
 * Opt-in Day "Face finish": when a still lands, re-render its face against the Cast face crop
 * (see face-finish.ts) and swap the finished image into the slot. One person in frame only —
 * the pass would give a partner her face. Runs one still at a time while the Day queue is idle,
 * and never overwrites a slot that was requeued or changed while the pass ran.
 */
function stillKey(still: { imageUrl?: string; promptId?: string }): string {
  return still.promptId?.trim() || still.imageUrl?.trim() || '';
}

const FINISHER_LABEL = {
  'qwen-edit': 'Qwen Edit 2511',
  'klein-distilled': 'Klein 9B Distilled',
  rapid: 'Rapid AIO',
} as const;

export function useDayFaceFinish(ctx: DayPlannerToolOrchestrationCore) {
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
        !handledRef.current.has(stillKey(still))
      );
    });
    const targetStill = target ? stills.find(entry => entry.slotId === target.id) : undefined;
    if (!target || !targetStill?.imageUrl) return;
    const sourceKey = stillKey(targetStill);
    handledRef.current.add(sourceKey);

    // One person only: the drawn guide's headcount when there was one, else the Day's
    // companion settings.
    const drawn = poseGuideExpectRef.current[target.id]?.keypoints.length;
    const mood = normalizeDayMood(toolSettings.dayMood);
    const companionsPossible =
      toolSettings.allowCompanions === true ||
      (isDayAdultMood(mood) && normalizeDayIntimateMix(toolSettings.intimateMix) !== 'solo');
    const solo = drawn != null ? drawn <= 1 : !companionsPossible;
    if (!solo) {
      setStatus(`Face finish skipped on ${target.label} — more than one person in frame.`);
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
        const result = await runStillFaceFinish({ imageUrl: comfyStillUrl, faceUrl });
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
