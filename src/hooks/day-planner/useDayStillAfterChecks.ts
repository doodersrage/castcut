'use client';

import { isRestoredTake } from '@/lib/day/planner';
import { useCallback, useEffect, useRef, useState } from 'react';
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
 * One person in frame only (a partner's face or tattoo would be judged as hers). Runs after
 * Day's own queue is done and after Face finish has had its turn.
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
  const [status, setStatus] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const handledRef = useRef<Set<string>>(new Set());
  const baselinedRef = useRef(false);
  const runningRef = useRef(false);
  /** The still being checked now (its key), so a run can wait for it (M6 D8). */
  const runningKeyRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!mounted || busy || runningRef.current || !baselinedRef.current) return;
    const target = slots.find(slot => {
      const still = stills.find(entry => entry.slotId === slot.id);
      return (
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
    const drawn = poseGuideExpectRef.current[target.id]?.keypoints.length;
    const companionsPossible =
      toolSettings.allowCompanions === true ||
      (isDayAdultMood(mood) && normalizeDayIntimateMix(toolSettings.intimateMix) !== 'solo');
    const solo = drawn != null ? drawn === 1 : !companionsPossible;
    if (!solo) return;

    runningRef.current = true;
    runningKeyRef.current = sourceKey;
    void (async () => {
      try {
        const gallery = loadComfyGallery();
        const comfyStillUrl = comfyViewUrlForStill(targetStill, gallery);
        if (!comfyStillUrl) return;
        const entry = gallery.find(item => item.promptId === targetStill.promptId);

        // 1. Face match, kept for the Likeness chart.
        const plateUrl = plate?.imageUrl?.includes('/api/comfyui/view?')
          ? plate.imageUrl
          : comfyInputViewUrl(plate?.filename);
        if (plateUrl && entry && typeof entry.playChecks?.face !== 'number') {
          const measured = await measureStillFaceMatch({
            referenceUrl: plateUrl,
            imageUrl: comfyStillUrl,
          }).catch(() => null);
          if (measured?.available) {
            recordGalleryPlayChecks(targetStill.promptId, {
              face: measured.similarity,
              faceMiss: measured.similarity < STILL_MIN_FACE_MATCH,
            });
          }
        }

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
    busy,
    character,
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
    toolSettings.dayMood,
    toolSettings.intimateMix,
    updateToolSettings,
  ]);

  /** A finished still whose checks haven't run yet, or are running (Scene runs wait on it). */
  const afterChecksPending = useCallback(
    (still: { imageUrl?: string; promptId?: string; status?: string; restoredFor?: string }) => {
      if (still.status !== 'completed' || !still.imageUrl) return false;
      if (isRestoredTake(still)) return false;
      const key = stillKey(still);
      return !handledRef.current.has(key) || runningKeyRef.current === key;
    },
    []
  );

  return { afterChecksStatus: status, afterChecksPending };
}
