'use client';

import { useCallback, useState } from 'react';
import { useDayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { useDayPlannerToolOrchestrationPart2 } from '@/hooks/day-planner/useDayPlannerToolOrchestrationPart2';
import { useDaySeries } from '@/hooks/day-planner/useDaySeries';
import { useDaySlotQualityGate } from '@/hooks/day-planner/useDaySlotQualityGate';
import { useDayClipQualityCheck } from '@/hooks/day-planner/useDayClipQualityCheck';
import { applyCharacterRecordFresh } from '@/lib/character-os';
import { applyCastLookPlateFromSource } from '@/lib/look-outfit-plate';
import { flaggedRetryPlan } from '@/lib/play-slot-quality';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { dayWatchPlaylist } from '@/lib/day-planner';
import {
  applyCutShotEdits,
  cutShotProblems,
  type CutShotProblem,
  type KeyedShot,
} from '@/lib/film-cut-plan';

export function useDayPlannerToolOrchestration() {
  const core = useDayPlannerToolOrchestrationCore();
  const part2 = useDayPlannerToolOrchestrationPart2(core);
  const quality = useDaySlotQualityGate(core);
  const clips = useDayClipQualityCheck(core);
  const season = useDaySeries(core.character?.id);

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

  return {
    ...core,
    ...part2,
    ...quality,
    ...clips,
    ...season,
    cutDayFilm,
    cutProblems,
    resolveCutProblems,
    flaggedRetryCount,
    retryFlagged,
    plateUploading,
    plateUploadError,
    uploadCastPlate,
  };
}
