'use client';

import { useDayAddVoice } from '@/hooks/day-planner/useDayAddVoice';
import { useDayExtendClip } from '@/hooks/day-planner/useDayExtendClip';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { useDayPlannerToolOrchestrationPart2 } from '@/hooks/day-planner/useDayPlannerToolOrchestrationPart2';
import { useDaySeries } from '@/hooks/day-planner/useDaySeries';
import { useDaySlotQualityGate } from '@/hooks/day-planner/useDaySlotQualityGate';
import { useDayFaceFinish } from '@/hooks/day-planner/useDayFaceFinish';
import { useDayPoseMissRedo } from '@/hooks/day-planner/useDayPoseMissRedo';
import { useDayBestOfTwo } from '@/hooks/day-planner/useDayBestOfTwo';
import { useDayTwoTakesOrder } from '@/hooks/day-planner/useDayTwoTakesOrder';
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
import { applyCastLookPlateFromSource, ensureOutfitPlateAfterLook } from '@/lib/look-outfit-plate';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { flaggedRetryPlan } from '@/lib/play-slot-quality';
import { loadComfyGallery, recordGalleryPlayerVerdict } from '@/lib/comfyui-gallery';
import type { FixAreaTarget } from '@/lib/fix-area-client';
import { findGalleryEntryForStill, recordFixAreaInGallery } from '@/lib/fix-area-gallery';
import { comfyViewUrlForStill, isComfyViewUrl } from '@/lib/still-comfy-url';
import { notePoseTakeOutcomes, notePoseTakePair } from '@/lib/pose-outcome-stats';
import { dayLooksWrongAvailable, dayLooksWrongTakeIds } from '@/lib/day-looks-wrong';
import { dayTwoTakesMark, dayTwoTakesPickPatch, dayTwoTakesSwapPatch } from '@/lib/day-two-takes';
import {
  dayStillFixAreaPatch,
  dayStillShownImage,
  dayStillsCachePatch,
  dayWatchPlaylist,
  normalizeDayMood,
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
  // Two takes: the take that counted fewer oddities goes first on the card (no redo).
  const twoTakesOrder = useDayTwoTakesOrder(core);
  const { poseMissViews: reviewPoseMissViews } = quality;
  const { poseRedoMissViews } = poseRedo;
  // Auto-review's pose misses, else the pose-redo check's (only one of the two runs).
  const poseMissViews = useMemo(
    () => ({ ...poseRedoMissViews, ...reviewPoseMissViews }),
    [poseRedoMissViews, reviewPoseMissViews]
  );
  const clips = useDayClipQualityCheck(core);
  const endPose = useDayEndPose(core);
  const addVoice = useDayAddVoice(core);
  const extendClip = useDayExtendClip(core);
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

  // A Cast with no plate (created without a photo, now that Look is optional): render one from
  // their description — the same full-body plate Look used to queue (look-outfit-plate.ts). The
  // app-wide watcher (PlayCastPlateWatcher, mounted by PlayFeatures) attaches it to the Cast when it lands.
  const [makePlateStatus, setMakePlateStatus] = useState<string | null>(null);
  const { actions } = core;
  const makeCastPlate = useCallback(async () => {
    if (!characterId) {
      setMakePlateStatus('Pick a Cast character first.');
      return;
    }
    setMakePlateStatus('Rendering a plate from the description…');
    try {
      const result = await ensureOutfitPlateAfterLook({
        characterId,
        tiles: [],
        sendComfyUi: actions.sendComfyUi,
      });
      setMakePlateStatus(
        result === 'queued'
          ? 'Rendering a plate from the description — it becomes the Cast plate when it lands.'
          : result === 'ready'
            ? 'Plate ready.'
            : result === 'failed'
              ? 'Could not queue a plate — check ComfyUI, then try again.'
              : null
      );
    } catch {
      setMakePlateStatus('Could not queue a plate — check ComfyUI, then try again.');
    }
  }, [actions.sendComfyUi, characterId]);

  // From "Create & continue" with no photo: make the plate once on arrival.
  const makePlateOnArrival = useRef(false);
  useEffect(() => {
    if (makePlateOnArrival.current || !characterId || core.hasPlate) return;
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('makePlate') !== '1') return;
    makePlateOnArrival.current = true;
    scheduleAfterCommit(() => void makeCastPlate());
  }, [characterId, core.hasPlate, makeCastPlate]);

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
      // The player picked the old take over the new one (pose × engine stats). An undone fix is
      // the same take, not a pair.
      if (shown?.previousTake && shown.previousTake.kind !== 'fix-area') {
        notePoseTakePair(shown.previousTake.promptId, shown.promptId);
      }
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
      if (shown?.previousTake && shown.previousTake.kind !== 'fix-area') {
        notePoseTakePair(shown.promptId, shown.previousTake.promptId);
      }
      const next = upsertDaySlotStill(stillsRef.current, {
        slotId,
        previousTake: undefined,
        // Keep the fix: the earlier fixes' pictures go too (the Gallery keeps every version).
        fixHistory: undefined,
        bestOfTwo: undefined,
      });
      stillsRef.current = next;
      updateToolSettings(dayStillsCachePatch(next, activeCharacterId));
    },
    [activeCharacterId, stillsRef, updateToolSettings]
  );

  // Looks wrong: the player's verdict on a landed still — a bad outcome for its pose × engine,
  // then the slot again on a new seed (day-looks-wrong.ts).
  const looksWrongSlot = useCallback(
    async (slotId: DaySlotId) => {
      const slot = slots.find(entry => entry.id === slotId);
      const shown = stillsRef.current.find(entry => entry.slotId === slotId);
      if (!slot || !dayLooksWrongAvailable(shown)) return;
      notePoseTakeOutcomes(dayLooksWrongTakeIds(shown), 'looks-wrong');
      recordGalleryPlayerVerdict(dayLooksWrongTakeIds(shown), 'looks-wrong');
      await queueSlot(slot, { looksWrong: true });
    },
    [queueSlot, slots, stillsRef]
  );

  // Two takes: the player tapped the one to keep; the other stays as the alternate.
  const pickTwoTake = useCallback(
    (slotId: DaySlotId, keep: 'first' | 'second') => {
      const shown = stillsRef.current.find(entry => entry.slotId === slotId);
      const pick = dayTwoTakesPickPatch(shown, keep);
      if (!pick) return;
      notePoseTakePair(pick.keptId, pick.otherId);
      recordGalleryPlayerVerdict([pick.keptId], 'kept');
      recordGalleryPlayerVerdict([pick.otherId], 'passed-over');
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

  // Fix an area (fix-area.ts) on a slot's still: the target for the brush dialog, and "Use this".
  const dayMoodSetting = core.toolSettings.dayMood;
  const fixAreaTargetForSlot = useCallback(
    (slotId: DaySlotId): FixAreaTarget | null => {
      const still = stillsRef.current.find(entry => entry.slotId === slotId);
      const shown = dayStillShownImage(still);
      if (!still || still.status !== 'completed' || !shown || still.adultHold) return null;
      const gallery = loadComfyGallery();
      const slot = slots.find(entry => entry.id === slotId);
      const takeUrl = comfyViewUrlForStill({ promptId: still.promptId }, gallery);
      const comfyUrl = isComfyViewUrl(shown) ? shown : takeUrl;
      const parent = findGalleryEntryForStill(gallery, {
        promptId: still.promptId,
        comfyUrl: takeUrl,
      });
      return {
        displayUrl: shown,
        comfyUrl,
        graphUrl: takeUrl,
        workflowJson: parent?.workflowJson ?? null,
        galleryEntryId: parent?.id ?? null,
        title: slot?.label,
        adult:
          still.adultGated || parent?.adultCheck
            ? { clothed: normalizeDayMood(dayMoodSetting) === 'suggestive' }
            : null,
        onUse: async result => {
          const current = stillsRef.current.find(entry => entry.slotId === slotId);
          const patch = dayStillFixAreaPatch(current, result.imageUrl);
          if (!current || current.promptId !== still.promptId || !patch) {
            throw new Error('The slot changed while the fix rendered — nothing was replaced.');
          }
          void recordFixAreaInGallery(parent, result);
          const next = upsertDaySlotStill(stillsRef.current, patch);
          stillsRef.current = next;
          updateToolSettings(dayStillsCachePatch(next, activeCharacterId));
        },
      };
    },
    [activeCharacterId, dayMoodSetting, slots, stillsRef, updateToolSettings]
  );

  return {
    fixAreaTargetForSlot,
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
    twoTakesOrderStatus: twoTakesOrder.twoTakesOrderStatus,
    faceFinishStatus: faceFinish.faceFinishStatus,
    adultGateStatus: adultGate.adultGateStatus,
    ...clips,
    ...endPose,
    ...addVoice,
    ...extendClip,
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
    makeCastPlate,
    makePlateStatus,
    redoSlotSameSeed,
    keepPreviousTake,
    dropPreviousTake,
    pickTwoTake,
    looksWrongSlot,
  };
}
