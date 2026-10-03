'use client';

import { useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { loadComfyGallery, recordGalleryPlayChecks } from '@/lib/comfyui-gallery';
import { notePoseTakePair } from '@/lib/pose-outcome-stats';
import {
  bestOfTwoDecision,
  bestOfTwoFailedPatch,
  bestOfTwoFirstTake,
  bestOfTwoJobPatch,
  bestOfTwoJobPending,
  bestOfTwoMark,
  bestOfTwoPending,
  bestOfTwoPickPatch,
  bestOfTwoTakeId,
  isDayHardPose,
  scoreTakePose,
} from '@/lib/day-best-of-two';
import { fetchCastcutBestOfTwoReport } from '@/lib/castcut-report-client';
import { dayStillShownImage, dayStillsCachePatch, upsertDaySlotStill } from '@/lib/day-planner';
import { detectStillPose } from '@/lib/pose-detect-client';
import { comfyViewUrlForStill } from '@/lib/still-comfy-url';

/**
 * Day "Best of two for hard poses" (opt-in, Auto-review off): when a still whose guide draws a
 * hard pose lands, read its pose back (DWPose) and queue the slot once more with a new seed,
 * keeping the first take beside it. When the second lands, read it too and keep the one whose
 * pose is closer; the other stays as the alternate take (Keep this take / Use the other take).
 * Never more than two takes (day-best-of-two.ts). Only while the Day queue is idle, and never on a
 * still Face finish is about to replace.
 *
 * With the Castcut node pack the pair was rendered as ONE job (queueSlot): the job already saved
 * the closer take, so this only reads the job's report and puts the other take beside it.
 */
export function useDayBestOfTwo(
  ctx: DayPlannerToolOrchestrationCore,
  faceFinish?: {
    holdsStill: (still: { imageUrl?: string; promptId?: string }) => boolean;
    tick: number;
  }
) {
  const { autoReviewStills, bestOfTwoHardPoses, busy, mounted, queueBlockReason, queueSlot } = ctx;
  const { poseGuideExpectRef, slots, stills, stillsRef, updateToolSettings } = ctx;
  const characterId = ctx.shared.activeCharacterId;
  const active = bestOfTwoHardPoses && !autoReviewStills;

  const [status, setStatus] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  /** The take each slot was last looked at. */
  const checkedRef = useRef<Record<string, string>>({});
  const baselinedRef = useRef(false);
  const runningRef = useRef(false);
  /** Set once DWPose reports it is not installed — no pose checks this session. */
  const poseCheckOffRef = useRef<string | null>(null);

  useEffect(() => {
    if (!mounted) return;
    if (stills.length === 0) {
      baselinedRef.current = true;
      checkedRef.current = {};
      return;
    }
    // Stills already finished when Day mounted belong to an earlier session — never paired, unless
    // a pair was left half done (its second take still to be picked).
    if (!baselinedRef.current) {
      baselinedRef.current = true;
      for (const still of stills) {
        if (
          still.status === 'completed' &&
          still.imageUrl &&
          !bestOfTwoPending(still) &&
          !bestOfTwoJobPending(still)
        ) {
          checkedRef.current[still.slotId] = bestOfTwoTakeId(still);
        }
      }
    }
  }, [mounted, stills]);

  // While the switch is off (or Auto-review owns it), landed takes count as seen, so turning it on
  // only acts on stills that land from then on.
  useEffect(() => {
    if (active) return;
    for (const still of stills) {
      if (still.status === 'completed' && still.imageUrl && !bestOfTwoPending(still)) {
        checkedRef.current[still.slotId] = bestOfTwoTakeId(still);
      }
    }
  }, [active, stills]);

  // A second take that failed puts the first back on its own (whether or not the switch is on).
  useEffect(() => {
    let next = stillsRef.current;
    for (const still of stills) {
      const patch = bestOfTwoFailedPatch(still);
      if (patch) next = upsertDaySlotStill(next, patch);
    }
    if (next !== stillsRef.current) {
      stillsRef.current = next;
      updateToolSettings(dayStillsCachePatch(next, characterId));
    }
  }, [characterId, stills, stillsRef, updateToolSettings]);

  useEffect(() => {
    if (!active || !mounted || busy || queueBlockReason || runningRef.current) return;
    if (!baselinedRef.current || poseCheckOffRef.current) return;
    const target = slots.find(slot => {
      const still = stills.find(entry => entry.slotId === slot.id);
      return (
        still?.status === 'completed' &&
        Boolean(still.imageUrl) &&
        checkedRef.current[slot.id] !== bestOfTwoTakeId(still) &&
        !faceFinish?.holdsStill(still)
      );
    });
    const still = target ? stills.find(entry => entry.slotId === target.id) : undefined;
    if (!target || !still?.imageUrl) return;
    const take = bestOfTwoTakeId(still);
    checkedRef.current[target.id] = take;
    if (bestOfTwoJobPending(still) && still.promptId) {
      const promptId = still.promptId;
      runningRef.current = true;
      void (async () => {
        try {
          const report = await fetchCastcutBestOfTwoReport(promptId);
          const current = stillsRef.current.find(entry => entry.slotId === target.id);
          if (!current || bestOfTwoTakeId(current) !== take) return;
          const patch = report ? bestOfTwoJobPatch(current, report) : null;
          if (patch?.bestOfTwo) {
            const next = upsertDaySlotStill(stillsRef.current, patch);
            stillsRef.current = next;
            updateToolSettings(dayStillsCachePatch(next, characterId));
            recordGalleryPlayChecks(promptId, { pose: patch.bestOfTwo.keptScore });
            setStatus(
              `${target.label}: kept the closer of two takes for the pose (${Math.round(patch.bestOfTwo.keptScore * 100)}% vs ${Math.round(patch.bestOfTwo.otherScore * 100)}%).`
            );
            return;
          }
          // No report (ComfyUI ran the plain graph): a first take like any other — look again.
          const next = upsertDaySlotStill(stillsRef.current, {
            slotId: target.id,
            bestOfTwoJob: undefined,
          });
          stillsRef.current = next;
          updateToolSettings(dayStillsCachePatch(next, characterId));
          delete checkedRef.current[target.id];
        } catch (error) {
          setStatus(
            `${target.label} best of two skipped (${error instanceof Error ? error.message : 'error'}).`
          );
        } finally {
          runningRef.current = false;
          setTick(value => value + 1);
        }
      })();
      return;
    }
    const expectation = poseGuideExpectRef.current[target.id];
    // Nothing to decide without a hard-pose guide, or with a same-seed compare open (it reads
    // the guide anyway for a pair's second take, queued with the same guide).
    const pending = bestOfTwoPending(still);
    if (!expectation || (!pending && (!isDayHardPose(expectation.poseKey) || still.previousTake))) {
      setTick(value => value + 1);
      return;
    }
    const checkUrl = comfyViewUrlForStill(still, loadComfyGallery()) ?? still.imageUrl;
    runningRef.current = true;

    void (async () => {
      try {
        setStatus(`Checking ${target.label} pose…`);
        const detected = await detectStillPose(checkUrl);
        if (!detected.available) {
          poseCheckOffRef.current = detected.reason;
          setStatus(`Best of two off: ${detected.reason}`);
          return;
        }
        const score = scoreTakePose({
          guide: expectation.keypoints,
          guideAspect: expectation.aspect,
          detected: detected.pose,
        });
        recordGalleryPlayChecks(still.promptId, { pose: score });
        // The still may have moved on while DWPose ran (a requeue, a pick by hand).
        const current = stillsRef.current.find(entry => entry.slotId === target.id);
        if (!current || bestOfTwoTakeId(current) !== take) return;
        const decision = bestOfTwoDecision({
          enabled: bestOfTwoHardPoses,
          autoReview: autoReviewStills,
          still: current,
          poseKey: expectation.poseKey,
          poseScore: score,
        });
        if (decision.action === 'pick') {
          const next = upsertDaySlotStill(
            stillsRef.current,
            bestOfTwoPickPatch(current, dayStillShownImage(current), decision)
          );
          stillsRef.current = next;
          updateToolSettings(dayStillsCachePatch(next, characterId));
          // A swap back puts the first take on the card; it was already seen.
          const kept = next.find(entry => entry.slotId === target.id);
          if (kept) checkedRef.current[target.id] = bestOfTwoTakeId(kept);
          notePoseTakePair(kept?.promptId, kept?.previousTake?.promptId);
          const keptPct = Math.round(
            (decision.keep === 'first' ? decision.firstScore : decision.secondScore) * 100
          );
          const otherPct = Math.round(
            (decision.keep === 'first' ? decision.secondScore : decision.firstScore) * 100
          );
          setStatus(
            `${target.label}: kept the ${decision.keep} take for the pose (${keptPct}% vs ${otherPct}%).`
          );
          return;
        }
        if (decision.action !== 'queue-second') return;
        const shown = dayStillShownImage(current);
        setStatus(
          `${target.label}: second take for the pose (first ${Math.round(decision.firstScore * 100)}%).`
        );
        await queueSlot(target, {
          keepTake: bestOfTwoFirstTake(current, shown, decision.firstScore),
        });
      } catch (error) {
        setStatus(
          `${target.label} best of two skipped (${error instanceof Error ? error.message : 'error'}).`
        );
      } finally {
        runningRef.current = false;
        setTick(value => value + 1);
      }
    })();
  }, [
    active,
    autoReviewStills,
    bestOfTwoHardPoses,
    busy,
    characterId,
    faceFinish,
    mounted,
    poseGuideExpectRef,
    queueBlockReason,
    queueSlot,
    slots,
    stills,
    stillsRef,
    tick,
    updateToolSettings,
  ]);

  const bestOfTwoMarks: Record<string, string> = {};
  for (const still of stills) {
    const mark = bestOfTwoMark(still);
    if (mark) bestOfTwoMarks[still.slotId] = mark;
  }

  return {
    bestOfTwoStatus: active ? status : null,
    bestOfTwoMarks,
  };
}
