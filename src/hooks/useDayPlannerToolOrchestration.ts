'use client';

import { useCallback, useMemo, useState } from 'react';
import { useDayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { useDayPlannerToolOrchestrationPart2 } from '@/hooks/day-planner/useDayPlannerToolOrchestrationPart2';
import { useDaySeries } from '@/hooks/day-planner/useDaySeries';
import { useDaySlotQualityGate } from '@/hooks/day-planner/useDaySlotQualityGate';
import { useDayFaceFinish } from '@/hooks/day-planner/useDayFaceFinish';
import { useDayPoseMissRedo } from '@/hooks/day-planner/useDayPoseMissRedo';
import { useDayBestOfTwo } from '@/hooks/day-planner/useDayBestOfTwo';
import { useDayClipQualityCheck } from '@/hooks/day-planner/useDayClipQualityCheck';
import { useDayEndPose } from '@/hooks/day-planner/useDayEndPose';
import { useDayAdultGate } from '@/hooks/day-planner/useDayAdultGate';
import { useDayOutfitScope } from '@/hooks/day-planner/useDayOutfitScope';
import { applyCharacterRecordFresh } from '@/lib/character-os';
import {
  dayChecksRunBeforeFaceFinish,
  settleDayTake,
  type DayChecksGate,
  type DaySettledTakes,
} from '@/lib/day-finish-order';
import { applyCastLookPlateFromSource } from '@/lib/look-outfit-plate';
import { flaggedRetryPlan } from '@/lib/play-slot-quality';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { notePoseTakePair } from '@/lib/pose-outcome-stats';
import { dayTwoTakesMark, dayTwoTakesPickPatch, dayTwoTakesSwapPatch } from '@/lib/day-two-takes';
import {
  dayStillsCachePatch,
  dayWatchPlaylist,
  restorePreviousDayTake,
  upsertDaySlotStill,
  type DaySlotId,
} from '@/lib/day-planner';
import {
  applyCutShotEdits,
  cutShotProblems,
  type CutShotProblem,
  type KeyedShot,
} from '@/lib/film-cut-plan';

export function useDayPlannerToolOrchestration() {
  const core = useDayPlannerToolOrchestrationCore();
  const part2 = useDayPlannerToolOrchestrationPart2(core);
  // Balanced: the pose check runs on each take as it lands and Face finish waits for it — a
  // take the check redoes is never face-finished (day-finish-order.ts).
  const checksFirst = dayChecksRunBeforeFaceFinish({
    faceFinish: core.toolSettings.faceFinish === true,
    redoPoseMisses: core.redoPoseMisses,
    autoReviewStills: core.autoReviewStills,
  });
  const [settledTakes, setSettledTakes] = useState<DaySettledTakes>({});
  const [checksOff, setChecksOff] = useState(false);
  const checksGate = useMemo<DayChecksGate | null>(
    () => (checksFirst ? { settledTakes, checksOff } : null),
    [checksFirst, checksOff, settledTakes]
  );
  const poseChecks = useMemo(
    () => ({
      onSettled: (slotId: string, take: string) =>
        setSettledTakes(previous => settleDayTake(previous, slotId, take)),
      onChecksOff: () => setChecksOff(true),
    }),
    []
  );
  const faceFinish = useDayFaceFinish(core, checksGate);
  const { holdsStillForFaceFinish, faceFinishTick } = faceFinish;
  const faceFinishHold = useMemo(
    () => ({ holdsStill: holdsStillForFaceFinish, tick: faceFinishTick }),
    [faceFinishTick, holdsStillForFaceFinish]
  );
  // Always on (not an Auto-review switch): adult stills are held until they read as adults.
  const adultGate = useDayAdultGate(core);
  const quality = useDaySlotQualityGate(core, faceFinishHold);
  const poseRedo = useDayPoseMissRedo(
    core,
    checksFirst ? undefined : faceFinishHold,
    checksFirst ? poseChecks : undefined
  );
  const bestOfTwo = useDayBestOfTwo(core, faceFinishHold);
  const { poseMissViews: reviewPoseMissViews } = quality;
  const { poseRedoMissViews } = poseRedo;
  // Auto-review's pose misses, else the pose-redo check's (only one of the two runs).
  const poseMissViews = useMemo(
    () => ({ ...poseRedoMissViews, ...reviewPoseMissViews }),
    [poseRedoMissViews, reviewPoseMissViews]
  );
  const clips = useDayClipQualityCheck(core);
  const endPose = useDayEndPose(core);
  const season = useDaySeries(core.character?.id);
  const outfitScope = useDayOutfitScope(core);

  // "Retry flagged": everything Auto-review flagged, in one tap instead of card by card.
  const retryPlan = flaggedRetryPlan({
    flaggedStillSlotIds: quality.flaggedSlotIds,
    clipChecks: clips.clipChecks,
    slotOrder: core.slots.map(slot => slot.id),
  });
  const flaggedRetryCount = retryPlan.stills.length + retryPlan.clips.length;
  const { queueSlot, setBusy, slots } = core;
  const { animateSlot } = part2;
  const retryFlagged = useCallback(async () => {
    setBusy(true);
    try {
      // Sequential — sendComfyUi is single-flight (same as Queue day).
      for (const slotId of retryPlan.stills) {
        const slot = slots.find(entry => entry.id === slotId);
        if (slot) {
          await queueSlot(slot, { manageBusy: false });
        }
      }
      for (const slotId of retryPlan.clips) {
        const slot = slots.find(entry => entry.id === slotId);
        if (slot) {
          await animateSlot(slot, { manageBusy: false });
        }
      }
    } finally {
      setBusy(false);
    }
  }, [animateSlot, queueSlot, retryPlan.clips, retryPlan.stills, setBusy, slots]);

  // Upload a plate from Day: it becomes the Cast's look plate (the same one Outfit and Story
  // use), not a Day-only copy, so identity stays one record.
  const [plateUploading, setPlateUploading] = useState(false);
  const [plateUploadError, setPlateUploadError] = useState<string | null>(null);
  const characterId = core.character?.id;
  const { updateShared } = core;
  const sharedModel = core.shared.model;
  const uploadCastPlate = useCallback(
    async (file: File) => {
      if (!characterId) {
        setPlateUploadError('Pick a Cast character first.');
        return;
      }
      setPlateUploading(true);
      setPlateUploadError(null);
      try {
        const result = await applyCastLookPlateFromSource({
          characterId,
          file,
          isolate: true,
          model: sharedModel,
        });
        updateShared(applyCharacterRecordFresh(result.character));
      } catch (err) {
        setPlateUploadError(err instanceof Error ? err.message : 'Could not upload that plate.');
      } finally {
        setPlateUploading(false);
      }
    },
    [characterId, sharedModel, updateShared]
  );

  // Pre-cut check: stills Auto-review flagged, or that missed their pose / face, get a look
  // before they end up in the film.
  const [cutProblems, setCutProblems] = useState<CutShotProblem[] | null>(null);
  const { cutDayFilm: cutDayFilmNow } = part2;
  const { qualityLedger } = quality;
  const { filmCutOptions, stillsRef } = core;
  const cutDayFilm = useCallback(async () => {
    const shots = applyCutShotEdits(
      dayWatchPlaylist(stillsRef.current, slots) as KeyedShot[],
      filmCutOptions.shotEdits
    );
    const gallery = loadComfyGallery();
    const problems = cutShotProblems(shots, shot => {
      const still = stillsRef.current.find(entry => entry.slotId === shot.key);
      const ledger = qualityLedger[shot.key];
      const checks = still?.promptId
        ? gallery.find(entry => entry.promptId === still.promptId)?.playChecks
        : undefined;
      return {
        flagged: ledger?.lastDecision === 'flag' ? (ledger.lastReasons ?? ['flagged']) : [],
        ...checks,
      };
    });
    if (problems.length > 0) {
      setCutProblems(problems);
      return;
    }
    setCutProblems(null);
    await cutDayFilmNow();
  }, [cutDayFilmNow, filmCutOptions.shotEdits, qualityLedger, slots, stillsRef]);
  const resolveCutProblems = useCallback(
    async (action: 'retry' | 'leave-out' | 'cut-anyway' | 'cancel') => {
      const problems = cutProblems ?? [];
      setCutProblems(null);
      if (action === 'retry') await retryFlagged();
      else if (action === 'leave-out')
        await cutDayFilmNow({ excludeKeys: problems.map(problem => problem.key) });
      else if (action === 'cut-anyway') await cutDayFilmNow();
    },
    [cutDayFilmNow, cutProblems, retryFlagged]
  );

  // Same-seed redo: the slot as it reads now (edited beat, outfit…), the take's seed — and the
  // old take kept beside it until one of the two is chosen.
  const { updateToolSettings } = core;
  const activeCharacterId = core.shared.activeCharacterId;
  const redoSlotSameSeed = useCallback(
    async (slotId: string) => {
      const slot = slots.find(entry => entry.id === slotId);
      if (slot) await queueSlot(slot, { sameSeed: true });
    },
    [queueSlot, slots]
  );
  const keepPreviousTake = useCallback(
    (slotId: DaySlotId) => {
      const shown = stillsRef.current.find(entry => entry.slotId === slotId);
      // Two takes: "Use the other take" swaps them — the shown one stays as the alternate.
      const swap = dayTwoTakesSwapPatch(shown);
      if (swap) {
        notePoseTakePair(swap.keptId, swap.otherId);
        const next = upsertDaySlotStill(stillsRef.current, swap.patch);
        stillsRef.current = next;
        updateToolSettings(dayStillsCachePatch(next, activeCharacterId));
        return;
      }
      // The player picked the old take over the new one (pose × engine stats).
      if (shown?.previousTake) notePoseTakePair(shown.previousTake.promptId, shown.promptId);
      const next = restorePreviousDayTake(stillsRef.current, slotId);
      stillsRef.current = next;
      updateToolSettings(dayStillsCachePatch(next, activeCharacterId));
    },
    [activeCharacterId, stillsRef, updateToolSettings]
  );
  const dropPreviousTake = useCallback(
    (slotId: DaySlotId) => {
      const shown = stillsRef.current.find(entry => entry.slotId === slotId);
      // The player kept the shown take and let the other go.
      if (shown?.previousTake) notePoseTakePair(shown.promptId, shown.previousTake.promptId);
      const next = upsertDaySlotStill(stillsRef.current, {
        slotId,
        previousTake: undefined,
        bestOfTwo: undefined,
      });
      stillsRef.current = next;
      updateToolSettings(dayStillsCachePatch(next, activeCharacterId));
    },
    [activeCharacterId, stillsRef, updateToolSettings]
  );

  // Two takes: the player tapped the one to keep; the other stays as the alternate.
  const pickTwoTake = useCallback(
    (slotId: DaySlotId, keep: 'first' | 'second') => {
      const shown = stillsRef.current.find(entry => entry.slotId === slotId);
      const pick = dayTwoTakesPickPatch(shown, keep);
      if (!pick) return;
      notePoseTakePair(pick.keptId, pick.otherId);
      const next = upsertDaySlotStill(stillsRef.current, pick.patch);
      stillsRef.current = next;
      updateToolSettings(dayStillsCachePatch(next, activeCharacterId));
    },
    [activeCharacterId, stillsRef, updateToolSettings]
  );
  const twoTakesMarks: Record<string, string> = {};
  for (const still of core.stills) {
    const mark = dayTwoTakesMark(still);
    if (mark) twoTakesMarks[still.slotId] = mark;
  }

  return {
    ...core,
    ...part2,
    ...quality,
    poseMissViews,
    poseRedoStatus: poseRedo.poseRedoStatus,
    // One mark line per card: a hard-pose slot is paired (best of two), never pose-redone; with
    // Auto-review on (the other two off) its "looked computer-made" redo marks.
    poseRedoMarks: {
      ...poseRedo.poseRedoMarks,
      ...bestOfTwo.bestOfTwoMarks,
      ...quality.realismMarks,
      ...twoTakesMarks,
    },
    bestOfTwoStatus: bestOfTwo.bestOfTwoStatus,
    faceFinishStatus: faceFinish.faceFinishStatus,
    adultGateStatus: adultGate.adultGateStatus,
    ...clips,
    ...endPose,
    ...season,
    ...outfitScope,
    cutDayFilm,
    cutProblems,
    resolveCutProblems,
    flaggedRetryCount,
    retryFlagged,
    plateUploading,
    plateUploadError,
    uploadCastPlate,
    redoSlotSameSeed,
    keepPreviousTake,
    dropPreviousTake,
    pickTwoTake,
  };
}
