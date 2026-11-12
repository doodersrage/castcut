'use client';

import { isRestoredTake } from '@/lib/day/planner';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatestRef } from '@/hooks/useLatestRef';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { waitForGalleryPromptIds } from '@/lib/best-of-n/vision-queue';
import {
  buildMarksRepairPrompt,
  checkableMarks,
  marksCheckNote,
  marksCheckVerdict,
  type MarksCheckIssue,
} from '@/lib/cast/marks-check';
import { checkStillMarks } from '@/lib/cast/marks-check-client';
import { resolveCastPlatePrepareModel, snapshotPlate } from '@/lib/cast/plate-prepare';
import {
  loadComfyGallery,
  galleryEntryPrimaryViewUrl,
  recordGalleryPlayChecks,
} from '@/lib/gallery/comfyui-gallery';
import { loadComfyUiSettings } from '@/lib/comfyui/settings';
import {
  dayStillsCachePatch,
  isDayAdultMood,
  normalizeDayIntimateMix,
  normalizeDayMood,
  upsertDaySlotStill,
} from '@/lib/day/planner';
import { dayTwoTakesPending } from '@/lib/day/two-takes';
import { STILL_MIN_FACE_MATCH } from '@/lib/face/match';
import { comfyInputViewUrl, measureStillFaceMatch } from '@/lib/face/match-client';
import { comfyViewUrlForStill } from '@/lib/comfyui/still-comfy-url';
import { outfitWearerFor } from '@/lib/still/outfit-check';
import { checkStillOutfit } from '@/lib/still/outfit-check-client';
import { reviewOutfitLabel } from '@/lib/play/slot-quality';

/**
 * Checks every Day still gets as it lands, whether or not Auto-review is on (2026-10-14):
 *
 * 1. Face match against the plate, kept on the Gallery entry — the Cast's Likeness chart and the
 *    LoRA keeper check read it, and before this it was only kept when Auto-review ran. ComfyUI's
 *    CPU, about half a second, no render job.
 * 2. Her marks (cast-marks-check.ts): when the Cast has glasses or a tattoo that should show, a
 *    vision model says what it sees; a miss gets one short Edit 2511 repair pass (and one more
 *    if the recheck still fails), swapped into the slot like Face finish. Live: a repair fixed
 *    the spread / missing marks on 3 of 4 stills in one pass, pose and place kept.
 *
 * 3. Her outfit (2026-11-11, play/outfit-check.ts), on Everyday days when Auto-review is off (it
 *    checks the outfit itself): described blind, then judged against the planned one. An
 *    overnight Short kept 4 topless stills in a slip-dress kitchen with nothing looking. Also
 *    beside someone of the other sex — the question names whose clothes.
 *
 * Face and marks: one person in frame only (a partner's face or tattoo would be judged as hers).
 * Runs after Day's own queue is done and after Face finish has had its turn.
 */
function stillKey(still: { imageUrl?: string; promptId?: string }): string {
  return still.promptId?.trim() || still.imageUrl?.trim() || '';
}

export function useDayStillAfterChecks(
  ctx: DayPlannerToolOrchestrationCore,
  faceFinish?: {
    holdsStill: (still: { imageUrl?: string; promptId?: string }) => boolean;
    tick: number;
  }
) {
  const { actions, busy, character, mounted, plate, shared, slots, stills, stillsRef } = ctx;
  const { poseGuideExpectRef, toolSettings, updateToolSettings } = ctx;
  const { autoReviewStills, wardrobeLabelFor } = ctx;
  const [status, setStatus] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const handledRef = useRef<Set<string>>(new Set());
  const baselinedRef = useRef(false);
  const runningRef = useRef(false);
  /** The still being checked now (its key), so a run can wait for it (M6 D8). */
  const runningKeyRef = useRef<string | null>(null);
  const slotsRef = useLatestRef(slots);

  useEffect(() => {
    if (!mounted) return;
    if (stills.length === 0) {
      baselinedRef.current = true;
      handledRef.current = new Set();
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

  type CheckTarget = (typeof slots)[number];
  type CheckStill = { promptId?: string; imageUrl?: string };
  /** Whose clothes and face to check in a still: the lead alone, or beside someone else. */
  const checksPlanFor = (target: CheckTarget, still: CheckStill) => {
    const mood = normalizeDayMood(toolSettings.dayMood);
    const drawn = poseGuideExpectRef.current[target.id]?.keypoints.length;
    const companionsPossible =
      toolSettings.allowCompanions === true ||
      (isDayAdultMood(mood) && normalizeDayIntimateMix(toolSettings.intimateMix) !== 'solo');
    const solo = drawn != null ? drawn === 1 : !companionsPossible;
    // The outfit: planned on an Everyday day, and not already checked by Auto-review.
    const outfit =
      mood === 'everyday' && !autoReviewStills
        ? reviewOutfitLabel({
            customDescription: toolSettings.customGarmentDescription,
            wardrobeId: target.wardrobeId,
            wardrobeLabel: wardrobeLabelFor(target.wardrobeId),
          })
        : undefined;
    const wearer = outfit
      ? outfitWearerFor({
          lead: ctx.leadNoun,
          solo,
          prompt: loadComfyGallery().find(item => item.promptId === still.promptId)?.prompt,
        })
      : null;
    return { solo, outfit, wearer };
  };
  /**
   * Her outfit, then (alone in frame) her face, kept on the take's Gallery entry. False when
   * there is nothing more to check on it (beside someone else: no face, no marks).
   */
  const outfitAndFaceChecks = async (
    target: CheckTarget,
    still: CheckStill,
    comfyStillUrl: string,
    plan: ReturnType<typeof checksPlanFor>
  ): Promise<boolean> => {
    const { solo, outfit, wearer } = plan;
    const entry = loadComfyGallery().find(item => item.promptId === still.promptId);
    // A miss is a finding, and a run flags it.
    if (outfit && wearer && entry && still.promptId) {
      setStatus(`Checking ${target.label}'s outfit…`);
      const verdict = await checkStillOutfit({
        imageUrl: comfyStillUrl,
        outfit,
        wearer,
        shared,
      });
      if (verdict) {
        recordGalleryPlayChecks(still.promptId, {
          outfitMiss: verdict.match ? '' : verdict.seen,
        });
        setStatus(
          verdict.match
            ? `${target.label}: outfit looks right.`
            : `${target.label}: not the planned outfit — ${verdict.seen}.`
        );
      }
    }
    if (!solo) return false;
    // Face match, kept for the Likeness chart.
    const plateUrl = plate?.imageUrl?.includes('/api/comfyui/view?')
      ? plate.imageUrl
      : comfyInputViewUrl(plate?.filename);
    if (plateUrl && entry && still.promptId && typeof entry.playChecks?.face !== 'number') {
      const measured = await measureStillFaceMatch({
        referenceUrl: plateUrl,
        imageUrl: comfyStillUrl,
      }).catch(() => null);
      if (measured?.available) {
        recordGalleryPlayChecks(still.promptId, {
          face: measured.similarity,
          faceMiss: measured.similarity < STILL_MIN_FACE_MATCH,
        });
      }
    }
    return true;
  };
  const checksRef = useLatestRef({ checksPlanFor, outfitAndFaceChecks, slots });

  /**
   * A take about to be redone at once (useDayPoseMissRedo: the pose missed, or it looked
   * computer-made) gets its outfit and face checked first. Replaced before the effect below
   * reached it, every first and third take of the 2026-11-11 s9 run went unchecked, and two
   * topless ones were kept as "outfit not checked". Waits for a check already running on it.
   */
  const checkBeforeRedo = useCallback(
    async (slotId: string, still: CheckStill & { status?: string; restoredFor?: string }) => {
      const key = stillKey(still);
      if (!key || isRestoredTake(still)) return;
      while (runningKeyRef.current === key) await new Promise(done => setTimeout(done, 500));
      if (handledRef.current.has(key)) return;
      const { checksPlanFor: planFor, outfitAndFaceChecks: run, slots: now } = checksRef.current;
      const target = now.find(slot => slot.id === slotId);
      if (!target || target.placeOnly) return;
      const comfyStillUrl = comfyViewUrlForStill(still, loadComfyGallery());
      if (!comfyStillUrl) return;
      const plan = planFor(target, still);
      if (!plan.solo && !plan.wearer) return;
      handledRef.current.add(key);
      runningKeyRef.current = key;
      try {
        await run(target, still, comfyStillUrl, plan);
      } catch {
        // A check that can't run leaves the take unchecked, as before.
      } finally {
        if (runningKeyRef.current === key) runningKeyRef.current = null;
      }
    },
    [checksRef]
  );

  useEffect(() => {
    if (!mounted || busy || runningRef.current || !baselinedRef.current) return;
    const target = slots.find(slot => {
      const still = stills.find(entry => entry.slotId === slot.id);
      return (
        // The empty place (placeOnly): no face, marks or outfit to check.
        !slot.placeOnly &&
        still?.status === 'completed' &&
        Boolean(still.imageUrl) &&
        // A take put back from a saved scene had its passes when it landed.
        !isRestoredTake(still) &&
        !dayTwoTakesPending(still) &&
        !handledRef.current.has(stillKey(still)) &&
        !faceFinish?.holdsStill(still)
      );
    });
    const targetStill = target ? stills.find(entry => entry.slotId === target.id) : undefined;
    if (!target || !targetStill?.imageUrl) return;
    const sourceKey = stillKey(targetStill);
    handledRef.current.add(sourceKey);

    const mood = normalizeDayMood(toolSettings.dayMood);
    const { checksPlanFor: planFor, outfitAndFaceChecks: runOutfitAndFace } = checksRef.current;
    const { solo, outfit, wearer } = planFor(target, targetStill);
    if (!solo && !wearer) return;

    runningRef.current = true;
    runningKeyRef.current = sourceKey;
    void (async () => {
      try {
        const gallery = loadComfyGallery();
        const comfyStillUrl = comfyViewUrlForStill(targetStill, gallery);
        if (!comfyStillUrl) return;
        const entry = gallery.find(item => item.promptId === targetStill.promptId);

        // 0–1. Her outfit and face, kept on the Gallery entry.
        if (!(await runOutfitAndFace(target, targetStill, comfyStillUrl, { solo, outfit, wearer })))
          return;

        // 2. Her marks.
        const marks = character?.marks;
        const expected = checkableMarks(marks, {
          outfit: entry?.prompt ?? target.sceneHints,
          beat: target.sceneHints,
          undressed: isDayAdultMood(mood),
        });
        if (!expected.length || toolSettings.checkMarks === false) return;
        const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
        const judge = async (url: string): Promise<MarksCheckIssue[] | null> => {
          const result = await checkStillMarks({ imageUrl: url, shared, comfyUrl });
          if ('unavailable' in result) {
            setStatus(`Marks check skipped on ${target.label} — ${result.unavailable}`);
            return null;
          }
          return marksCheckVerdict(result.reading, expected, marks).issues;
        };
        setStatus(`Checking ${target.label}'s marks…`);
        let issues = await judge(comfyStillUrl);
        if (!issues || issues.length === 0) {
          if (issues) setStatus(`${target.label}: marks look right.`);
          return;
        }
        let currentUrl = comfyStillUrl;
        let fixed: string | null = null;
        for (let attempt = 1; attempt <= 2 && issues && issues.length; attempt += 1) {
          setStatus(`${target.label}: ${marksCheckNote(issues)} — repairing (pass ${attempt})…`);
          const before = await snapshotPlate(
            { imageUrl: currentUrl, filename: '' } as never,
            shared.model
          );
          const promptId = await actions.sendComfyUi(
            buildMarksRepairPrompt(issues, marks ?? [], ctx.leadNoun === 'man' ? 'he' : 'she'),
            null,
            undefined,
            {
              inputImageFilename: before.filename,
              inputImageUrl: before.imageUrl,
              identityLock: false,
              queueModel: resolveCastPlatePrepareModel(shared.model),
              queueTool: 'fitting',
              turboEditStrength: 'balanced',
              preserveInputAspect: true,
              ...(before.size
                ? { castPlateReference: true, figurePixelSize: { ...before.size } }
                : {}),
              explicitNegative:
                'different person, different face, changed pose, changed clothes, extra people, text, logo, blurry',
              queueHints: '',
              characterId: character?.id,
              sourceImageUrl: before.imageUrl,
            }
          );
          const id = typeof promptId === 'string' ? promptId.trim() : '';
          if (!id) break;
          const [done] = await waitForGalleryPromptIds([id], {
            timeoutMs: 4 * 60_000,
            pollMs: 2_500,
          });
          const url = done ? galleryEntryPrimaryViewUrl(done)?.trim() : '';
          if (!url) break;
          const nextIssues = await judge(url);
          if (!nextIssues) break;
          // Keep the pass only when it is better than what it replaces.
          if (nextIssues.length <= issues.length) {
            fixed = url;
            currentUrl = url;
          }
          issues = nextIssues;
        }
        if (!fixed) {
          setStatus(
            `${target.label}: ${issues?.length ? marksCheckNote(issues) : 'marks'} — the repair didn't take; the still is unchanged.`
          );
          // On the Gallery entry too (Needs a look).
          recordGalleryPlayChecks(targetStill.promptId, {
            marksMissing: issues?.length ? marksCheckNote(issues) : 'not as set',
          });
          return;
        }
        // Only swap if the slot still shows the image we checked (not requeued meanwhile).
        const current = stillsRef.current.find(item => item.slotId === target.id);
        if (current?.status !== 'completed' || stillKey(current) !== sourceKey) {
          setStatus(`Marks repair on ${target.label} discarded — the slot changed meanwhile.`);
          return;
        }
        const nextStills = upsertDaySlotStill(stillsRef.current, {
          slotId: target.id,
          imageUrl: fixed,
          status: 'completed',
        });
        stillsRef.current = nextStills;
        updateToolSettings(dayStillsCachePatch(nextStills, shared.activeCharacterId));
        setStatus(
          issues && issues.length
            ? `${target.label}: marks repaired, still ${marksCheckNote(issues)}.`
            : `${target.label}: marks repaired.`
        );
      } catch (error) {
        setStatus(
          `Marks check stopped on ${target.label}: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        runningRef.current = false;
        runningKeyRef.current = null;
        setTick(value => value + 1);
      }
    })();
  }, [
    actions,
    autoReviewStills,
    busy,
    character,
    checksRef,
    ctx.leadNoun,
    faceFinish,
    mounted,
    plate,
    poseGuideExpectRef,
    shared,
    slots,
    stills,
    stillsRef,
    tick,
    toolSettings.allowCompanions,
    toolSettings.checkMarks,
    toolSettings.customGarmentDescription,
    toolSettings.dayMood,
    toolSettings.intimateMix,
    updateToolSettings,
    wardrobeLabelFor,
  ]);

  /** A finished still whose checks haven't run yet, or are running (Scene runs wait on it). */
  const afterChecksPending = useCallback(
    (still: {
      slotId?: string;
      imageUrl?: string;
      promptId?: string;
      status?: string;
      restoredFor?: string;
    }) => {
      if (still.status !== 'completed' || !still.imageUrl) return false;
      if (isRestoredTake(still)) return false;
      // The empty place (placeOnly) is never checked: nothing to wait for.
      if (still.slotId && slotsRef.current.find(slot => slot.id === still.slotId)?.placeOnly)
        return false;
      const key = stillKey(still);
      return !handledRef.current.has(key) || runningKeyRef.current === key;
    },
    [slotsRef]
  );

  return { afterChecksStatus: status, afterChecksPending, checkBeforeRedo };
}
