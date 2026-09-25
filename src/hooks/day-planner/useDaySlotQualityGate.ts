'use client';

import { useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { isDayAdultMood, normalizeDayIntimateMix, normalizeDayMood } from '@/lib/day-planner';
import {
  recordFaceMatchScore,
  poseLayoutFromKey,
  recordPoseMatchScore,
  recordSlotReviewOutcome,
} from '@/lib/play-metrics';
import { comfyInputViewUrl, measureStillFaceMatch } from '@/lib/face-match-client';
import { describeFaceMatch } from '@/lib/face-match';
import { detectStillPose } from '@/lib/pose-detect-client';
import { bodyIsUsable, savePoseLibraryEntry, type NormalizedBody } from '@/lib/pose-library';
import {
  describePoseMatch,
  POSE_LIBRARY_MIN_SCORE,
  POSE_MISMATCH_NUDGE,
  scorePoseMatch,
  type PoseMatchResult,
} from '@/lib/pose-score';
import { isOpenPoseStyle } from '@/lib/pose-guide-prompt';
import {
  decideSlotQuality,
  FACE_MISMATCH_NUDGE,
  flaggedSlotIds,
  recordSlotDecision,
  reviewOutfitLabel,
  slotRerollNudge,
  slotRerollsUsed,
  type SlotQualityLedger,
} from '@/lib/play-slot-quality';
import { buildFaceComparePair } from '@/lib/play-face-compare';
import { buildPoseMissView, poseLimbFixNudge, type PoseMissView } from '@/lib/pose-coaching';
import { reviewDaySlotStill } from '@/lib/play-slot-review-client';

/**
 * Opt-in Day quality gate: when a still lands, vision-review it and requeue the slot (bounded
 * rerolls) if the face, hands, or outfit are broken. Reviews run one at a time and only while
 * the Day queue is idle so rerolls never overlap a Queue-all submit.
 *
 * When the slot had an Image 3 guide and ComfyUI has DWPose, the still's pose is also read back
 * and scored against the guide: a still that ignored its guide is rerolled, every score is logged
 * per guide style (the OpenPose-vs-legacy record), and well-matched stills feed the pose library.
 */
export function useDaySlotQualityGate(ctx: DayPlannerToolOrchestrationCore) {
  const { autoReviewStills, busy, mounted, queueSlot, rerollNudgeRef, shared, slots, stills } = ctx;
  const { poseGuideExpectRef, poseVariantRef } = ctx;
  const { plate, toolSettings, wardrobeLabelFor } = ctx;

  const [qualityStatus, setQualityStatus] = useState<string | null>(null);
  const [qualityLedger, setQualityLedger] = useState<SlotQualityLedger>({});
  /** Last pose miss per slot: guide vs still skeleton and the limbs that differ. */
  const [poseMissViews, setPoseMissViews] = useState<Record<string, PoseMissView>>({});
  const [tick, setTick] = useState(0);
  const stillsEmpty = stills.length === 0;
  const [wasStillsEmpty, setWasStillsEmpty] = useState(stillsEmpty);
  // A new Day clears the stills — reset the visible ledger/status when that happens.
  if (stillsEmpty !== wasStillsEmpty) {
    setWasStillsEmpty(stillsEmpty);
    if (stillsEmpty) {
      setQualityLedger({});
      setQualityStatus(null);
      setPoseMissViews({});
    }
  }
  const ledgerRef = useRef<SlotQualityLedger>({});
  const reviewedRef = useRef<Record<string, string>>({});
  const baselinedRef = useRef(false);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  /** Set once the detector reports it is not installed — skip pose checks for the session. */
  const poseCheckOffRef = useRef<string | null>(null);
  const [poseCheckOff, setPoseCheckOff] = useState<string | null>(null);
  const faceCheckOffRef = useRef<string | null>(null);
  const [faceCheckOff, setFaceCheckOff] = useState<string | null>(null);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    // A new Day clears the stills — start the review marks and ledger fresh.
    if (stills.length === 0) {
      baselinedRef.current = true;
      reviewedRef.current = {};
      ledgerRef.current = {};
      // New Day, new layouts: rerolled variants start from the stable drawing again.
      poseVariantRef.current = {};
      // A new Day is a fresh chance for a gate that paused on a vision error.
      pausedRef.current = false;
      return;
    }
    // Stills already finished when Day mounted belong to an earlier film — never re-review them.
    if (!baselinedRef.current) {
      baselinedRef.current = true;
      for (const still of stills) {
        if (still.status === 'completed' && still.imageUrl) {
          reviewedRef.current[still.slotId] = still.imageUrl;
        }
      }
    }
  }, [mounted, poseVariantRef, stills]);

  useEffect(() => {
    if (!autoReviewStills) {
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
        reviewedRef.current[slot.id] !== still.imageUrl
      );
    });
    const targetStill = target ? stills.find(entry => entry.slotId === target.id) : undefined;
    if (!target || !targetStill?.imageUrl) {
      return;
    }
    const imageUrl = targetStill.imageUrl;
    reviewedRef.current[target.id] = imageUrl;
    runningRef.current = true;

    const mood = normalizeDayMood(toolSettings.dayMood);
    const companionsPossible =
      toolSettings.allowCompanions === true ||
      (isDayAdultMood(mood) && normalizeDayIntimateMix(toolSettings.intimateMix) !== 'solo');
    // Heat moods swap the Keep outfit for their own kit, so only check outfit on everyday days.
    const outfit =
      mood === 'everyday'
        ? reviewOutfitLabel({
            customDescription: toolSettings.customGarmentDescription,
            wardrobeId: target.wardrobeId,
            wardrobeLabel: wardrobeLabelFor(target.wardrobeId),
          })
        : undefined;

    // Compare against the plate that queued as Image 1 — if the still drifted off it, identity
    // lock failed. Solo only: with a companion in frame the reviewer cannot say which face to match.
    const referenceUrl = companionsPossible ? '' : plate?.imageUrl?.trim() || '';

    void (async () => {
      try {
        setQualityStatus(`Reviewing ${target.label}…`);
        const pair = referenceUrl
          ? await buildFaceComparePair({ referenceUrl, stillUrl: imageUrl })
          : null;
        // Pose check first (ComfyUI DWPose). Never blocks the vision review: a missing node
        // pack turns it off for the session; any other error just skips it for this still.
        const expectation = poseGuideExpectRef.current[target.id];
        let poseMatch: PoseMatchResult | null = null;
        let poseNote = '';
        let detectedPeople: NormalizedBody[] = [];
        let detectedAspect = 1;
        if (expectation && !poseCheckOffRef.current) {
          setQualityStatus(`Checking ${target.label} pose…`);
          try {
            const detected = await detectStillPose(imageUrl);
            if (detected.available) {
              poseMatch = scorePoseMatch({
                guide: expectation.keypoints,
                guideAspect: expectation.aspect,
                detected: detected.pose,
              });
              detectedPeople = detected.pose.people;
              const { width, height } = detected.pose.canvas;
              detectedAspect = width > 0 && height > 0 ? width / height : expectation.aspect;
              poseNote = describePoseMatch(poseMatch);
            } else {
              poseCheckOffRef.current = detected.reason;
              setPoseCheckOff(detected.reason);
            }
          } catch (error) {
            poseNote = `pose check skipped (${error instanceof Error ? error.message : 'error'})`;
          }
        }
        // Face check (ComfyUI FaceAnalysis): solo stills only — with a companion in frame the
        // detector can't know which face should be the Cast.
        let faceMatch: number | null = null;
        const faceReferenceUrl = referenceUrl
          ? referenceUrl.includes('/api/comfyui/view?')
            ? referenceUrl
            : comfyInputViewUrl(plate?.filename)
          : null;
        if (faceReferenceUrl && !faceCheckOffRef.current) {
          setQualityStatus(`Checking ${target.label} face…`);
          try {
            const measured = await measureStillFaceMatch({
              referenceUrl: faceReferenceUrl,
              imageUrl,
            });
            if (measured?.available) {
              faceMatch = measured.similarity;
            } else if (measured && !measured.available) {
              faceCheckOffRef.current = measured.reason;
              setFaceCheckOff(measured.reason);
            }
          } catch (error) {
            console.warn('Day face check skipped:', error);
          }
        }
        setQualityStatus(`Reviewing ${target.label}…`);
        const report = await reviewDaySlotStill({
          imageUrl: pair ?? imageUrl,
          context: {
            beat: target.sceneHints,
            setting: target.location,
            outfit,
            expectedPeople: companionsPossible ? 'any' : 1,
            referencePair: Boolean(pair),
          },
          shared,
        });
        let poseLimbNudge = '';
        const decision = decideSlotQuality(
          report,
          slotRerollsUsed(ledgerRef.current, target.id),
          undefined,
          { poseMatch: poseMatch?.score ?? null, faceMatch }
        );
        if (faceMatch !== null) {
          recordFaceMatchScore(shared.model, faceMatch, Boolean(decision.faceMiss));
        }
        if (poseMatch && expectation) {
          recordPoseMatchScore(
            expectation.style,
            poseMatch.score,
            Boolean(decision.poseMiss),
            poseLayoutFromKey(expectation.poseKey),
            { cued: expectation.cued === true }
          );
          // A kept still that followed its guide closely is a real body in that layout:
          // save the detected skeletons (lead first) so later guides can reuse them.
          const ordered = poseMatch.assignment.map(index => detectedPeople[index]);
          const missView = decision.poseMiss
            ? buildPoseMissView({
                imageUrl,
                score: poseMatch.score,
                guide: expectation.keypoints,
                guideAspect: expectation.aspect,
                still: ordered,
                stillAspect: detectedAspect,
              })
            : null;
          poseLimbNudge = missView ? poseLimbFixNudge(missView.misses) : '';
          setPoseMissViews(previous => {
            if (!missView && !previous[target.id]) return previous;
            const next = { ...previous };
            if (missView) next[target.id] = missView;
            else delete next[target.id];
            return next;
          });
          if (
            decision.action === 'keep' &&
            !expectation.poseKey.startsWith('photo:') &&
            isOpenPoseStyle(expectation.style) &&
            poseMatch.score >= POSE_LIBRARY_MIN_SCORE &&
            ordered.every(body => body && bodyIsUsable(body))
          ) {
            savePoseLibraryEntry({
              id: `${expectation.poseKey}-${Date.now().toString(36)}`,
              key: expectation.poseKey,
              aspect: detectedAspect,
              people: ordered as NormalizedBody[],
              score: poseMatch.score,
              createdAt: Date.now(),
            });
          }
        }
        const poseSuffix = [poseNote, faceMatch !== null ? describeFaceMatch(faceMatch) : '']
          .filter(Boolean)
          .map(note => ` · ${note}`)
          .join('');
        ledgerRef.current = recordSlotDecision(ledgerRef.current, target.id, decision);
        setQualityLedger(ledgerRef.current);
        recordSlotReviewOutcome(decision.action);

        if (decision.action === 'keep') {
          setQualityStatus(
            decision.warnings.length > 0
              ? `${target.label} passed (${decision.overall}/5${poseSuffix}) — ${decision.warnings.join(', ')}.`
              : `${target.label} passed review (${decision.overall}/5${poseSuffix}).`
          );
        } else if (decision.action === 'flag') {
          setQualityStatus(
            `${target.label} needs a look: ${decision.reasons.join(', ')}. Retry or reroll it.`
          );
        } else {
          const nudge = [
            slotRerollNudge(report.flags),
            decision.poseMiss ? POSE_MISMATCH_NUDGE : '',
            decision.poseMiss ? poseLimbNudge : '',
            decision.faceMiss ? FACE_MISMATCH_NUDGE : '',
          ]
            .filter(Boolean)
            .join(' ');
          if (nudge) {
            rerollNudgeRef.current[target.id] = nudge;
          }
          // Broken bodies (extra people, merged limbs…) often come from the layout itself —
          // try a different arrangement. A pure pose miss keeps the guide and retries the render.
          const onlyPoseMiss = decision.poseMiss && decision.reasons.length === 1;
          if (!onlyPoseMiss) {
            poseVariantRef.current[target.id] = (poseVariantRef.current[target.id] ?? 0) + 1;
          }
          setQualityStatus(`Requeueing ${target.label}: ${decision.reasons.join(', ')}.`);
          await queueSlot(target);
        }
      } catch (error) {
        // Stop after the first failure so a missing vision model doesn't error on every slot.
        pausedRef.current = true;
        const message = error instanceof Error ? error.message : 'Review failed.';
        setQualityStatus(`Auto-review paused: ${message}`);
      } finally {
        runningRef.current = false;
        setTick(value => value + 1);
      }
    })();
  }, [
    autoReviewStills,
    busy,
    mounted,
    plate,
    poseGuideExpectRef,
    poseVariantRef,
    queueSlot,
    rerollNudgeRef,
    shared,
    slots,
    stills,
    tick,
    toolSettings.allowCompanions,
    toolSettings.customGarmentDescription,
    toolSettings.dayMood,
    toolSettings.intimateMix,
    wardrobeLabelFor,
  ]);

  return {
    qualityStatus: autoReviewStills
      ? qualityStatus
        ? [
            qualityStatus,
            poseCheckOff ? `(Pose check off: ${poseCheckOff})` : '',
            faceCheckOff ? `(Face check off: ${faceCheckOff})` : '',
          ]
            .filter(Boolean)
            .join(' ')
        : qualityStatus
      : null,
    qualityLedger,
    poseMissViews,
    flaggedSlotIds: flaggedSlotIds(qualityLedger),
  };
}
