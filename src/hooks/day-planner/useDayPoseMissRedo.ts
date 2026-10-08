'use client';

import { useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { loadComfyGallery, recordGalleryPlayChecks } from '@/lib/comfyui-gallery';
import { isIntimateDuoStillPrompt } from '@/lib/still-clip-prompt';
import { isDayHardPose } from '@/lib/day-best-of-two';
import { dayTwoTakesJudged, dayTwoTakesPending } from '@/lib/day-two-takes';
import {
  notePoseRedoTake,
  poseRedoDecision,
  poseRedoMark,
  poseRedoTakeId,
  type PoseRedoLedger,
} from '@/lib/day-pose-redo';
import { detectStillPose } from '@/lib/pose-detect-client';
import {
  buildPoseMissView,
  gestureMissWords,
  poseLimbFixNudge,
  type PoseMissView,
} from '@/lib/pose-coaching';
import { gestureFixNudge } from '@/lib/pose-gesture';
import type { RealismVerdict } from '@/lib/still-realism';
import {
  DEFAULT_MIN_POSE_MATCH,
  POSE_MISMATCH_NUDGE,
  posturePairWords,
  scorePoseMatch,
  guidePostureContradictsWords,
} from '@/lib/pose-score';
import { comfyViewUrlForStill } from '@/lib/still-comfy-url';

/**
 * Day "Redo pose misses once" (opt-in, Auto-review off): when a still lands, read its pose back
 * (DWPose) against the slot's guide and, on a miss, queue the slot once more with the pose spelled
 * out — the nudge Auto-review's pose reroll uses (POSE_MISMATCH_NUDGE plus the limbs that were
 * off; it also turns on the pose cue line). A still that holds the posture but drops the beat's
 * gesture (pose-gesture.ts: hands + one vision question) is a miss too, redone with a GESTURE
 * line naming what it dropped. One redo per take (day-pose-redo.ts), only while the
 * Day queue is idle, and never on a still Face finish is about to replace.
 *
 * The same vision call rates how real the still looks (still-realism.ts); a take that looks drawn
 * or computer-made is redone once too, on a new seed ("Redone — looked computer-made"; a real-photo
 * line in the prompt changed nothing in replays, so none is added).
 * A still with no guide is rated alone (its only vision call).
 *
 * With `checks` (Balanced: Face finish waits for this check) the check runs on the take as it
 * lands, not after Face finish, and reports each take it keeps (`onSettled`) — no redo is coming
 * for it, so Face finish may start.
 */
export function useDayPoseMissRedo(
  ctx: DayPlannerToolOrchestrationCore,
  faceFinish?: {
    holdsStill: (still: { imageUrl?: string; promptId?: string }) => boolean;
    tick: number;
  },
  checks?: {
    /** This take's checks are done and it stays (no redo queued for it). */
    onSettled: (slotId: string, take: string) => void;
    /** The pose check can't run this session — nothing to wait for. */
    onChecksOff: () => void;
  }
) {
  const { autoReviewStills, busy, mounted, queueBlockReason, queueSlot, redoPoseMisses } = ctx;
  const { bestOfTwoHardPoses } = ctx;
  const { poseGuideExpectRef, rerollNudgeRef, slots, stills } = ctx;
  const { leadNoun, shared } = ctx;
  const active = redoPoseMisses && !autoReviewStills;

  const [ledger, setLedger] = useState<PoseRedoLedger>({});
  const [missViews, setMissViews] = useState<Record<string, PoseMissView>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const stillsEmpty = stills.length === 0;
  const [wasStillsEmpty, setWasStillsEmpty] = useState(stillsEmpty);
  // A new Day clears the stills — and the redo marks with them.
  if (stillsEmpty !== wasStillsEmpty) {
    setWasStillsEmpty(stillsEmpty);
    if (stillsEmpty) {
      setLedger({});
      setMissViews({});
      setStatus(null);
    }
  }
  const ledgerRef = useRef<PoseRedoLedger>({});
  /** The take each slot's pose was last checked on. */
  const checkedRef = useRef<Record<string, string>>({});
  const baselinedRef = useRef(false);
  const runningRef = useRef(false);
  /** The take being checked right now. */
  const inFlightRef = useRef<string | null>(null);
  /** Set once DWPose reports it is not installed — no pose checks this session. */
  const poseCheckOffRef = useRef<string | null>(null);

  useEffect(() => {
    if (!mounted) return;
    if (stills.length === 0) {
      baselinedRef.current = true;
      checkedRef.current = {};
      ledgerRef.current = {};
      return;
    }
    // Stills already finished when Day mounted belong to an earlier session — never redo them.
    if (!baselinedRef.current) {
      baselinedRef.current = true;
      for (const still of stills) {
        if (still.status === 'completed' && still.imageUrl) {
          checkedRef.current[still.slotId] = poseRedoTakeId(still);
        }
      }
    }
  }, [mounted, stills]);

  // Every landed take: the first one after a redo is that redo's result (its card mark). While
  // the switch is off (or Auto-review owns it), landed takes count as seen, so turning it on
  // only acts on stills that land from then on.
  useEffect(() => {
    let next = ledgerRef.current;
    for (const still of stills) {
      if (still.status === 'completed' && still.imageUrl) {
        const take = poseRedoTakeId(still);
        next = notePoseRedoTake(next, still.slotId, take);
        if (!active) checkedRef.current[still.slotId] = take;
      }
    }
    if (next !== ledgerRef.current) {
      ledgerRef.current = next;
      setLedger(next);
    }
  }, [active, stills]);

  // Takes this check will never look at (landed while it was off, or before Day mounted) are
  // settled for Face finish at once; a take being checked or redone is not.
  useEffect(() => {
    if (!checks) return;
    for (const still of stills) {
      if (still.status !== 'completed' || !still.imageUrl) continue;
      const take = poseRedoTakeId(still);
      if (
        take &&
        checkedRef.current[still.slotId] === take &&
        inFlightRef.current !== take &&
        ledgerRef.current[still.slotId]?.missedTake !== take
      ) {
        checks.onSettled(still.slotId, take);
      }
    }
  }, [checks, stills]);

  useEffect(() => {
    if (!active || !mounted || busy || queueBlockReason || runningRef.current) return;
    if (!baselinedRef.current || poseCheckOffRef.current) return;
    const target = slots.find(slot => {
      const still = stills.find(entry => entry.slotId === slot.id);
      return (
        still?.status === 'completed' &&
        Boolean(still.imageUrl) &&
        checkedRef.current[slot.id] !== poseRedoTakeId(still) &&
        !faceFinish?.holdsStill(still) &&
        // Two takes still to pick from: the player judges them.
        !dayTwoTakesPending(still)
      );
    });
    const still = target ? stills.find(entry => entry.slotId === target.id) : undefined;
    if (!target || !still?.imageUrl) return;
    const take = poseRedoTakeId(still);
    checkedRef.current[target.id] = take;
    const expectation = poseGuideExpectRef.current[target.id];
    // Two-person intimate stills are never redone automatically: those engines take the pose
    // from the words, and the checks can't judge them (DWPose merges the two bodies on ~40%;
    // the best defect check caught 28% at 19% false alarms) — a redrawn guide only raised the
    // false "missed the pose" redos. The player's "Looks wrong" / Two takes handle them. A hard
    // pose with Best of two on is paired instead (useDayBestOfTwo) — never both. A pick from two
    // takes was judged by the player: nothing to redo.
    const stillPrompt =
      loadComfyGallery().find(entry => entry.promptId === still.promptId)?.prompt ?? '';
    if (
      isIntimateDuoStillPrompt(stillPrompt) ||
      dayTwoTakesJudged(still) ||
      (expectation && bestOfTwoHardPoses && isDayHardPose(expectation.poseKey))
    ) {
      checks?.onSettled(target.id, take);
      setTick(value => value + 1);
      return;
    }
    /** Set when this take was queued again — then it never settles (it is replaced). */
    let redone = false;
    inFlightRef.current = take;
    const imageUrl = still.imageUrl;
    const checkUrl = comfyViewUrlForStill(still, loadComfyGallery()) ?? imageUrl;
    runningRef.current = true;

    /** Queue the redo the decision asked for, with its nudge. */
    const redoFor = async (reason: 'pose' | 'realism', nudge: string, message: string) => {
      if (nudge) rerollNudgeRef.current[target.id] = nudge;
      ledgerRef.current = { ...ledgerRef.current, [target.id]: { missedTake: take, reason } };
      setLedger(ledgerRef.current);
      setStatus(message);
      redone = true;
      await queueSlot(target);
    };

    // No guide queued with this still: no pose to check — only how real it looks.
    if (!expectation) {
      void (async () => {
        try {
          setStatus(`Checking ${target.label}…`);
          const { checkStillRealism } = await import('@/lib/pose-gesture-vision-client');
          const realism = await checkStillRealism({ imageUrl, shared });
          const decision = poseRedoDecision({
            enabled: redoPoseMisses,
            autoReview: autoReviewStills,
            slotId: target.id,
            take,
            poseScore: null,
            realismMiss: realism?.computerMade === true,
            ledger: ledgerRef.current,
          });
          if (!decision.redo) {
            setStatus(null);
            return;
          }
          await redoFor(
            'realism',
            '',
            `Redoing ${target.label}: it looked computer-made (${realism?.rating}/10).`
          );
        } catch (error) {
          setStatus(
            `${target.label} check skipped (${error instanceof Error ? error.message : 'error'}).`
          );
        } finally {
          if (!redone) checks?.onSettled(target.id, take);
          inFlightRef.current = null;
          runningRef.current = false;
          setTick(value => value + 1);
        }
      })();
      return;
    }

    void (async () => {
      try {
        setStatus(`Checking ${target.label} pose…`);
        const detected = await detectStillPose(checkUrl);
        if (!detected.available) {
          poseCheckOffRef.current = detected.reason;
          checks?.onChecksOff();
          setStatus(`Pose check off: ${detected.reason}`);
          return;
        }
        let match = scorePoseMatch({
          guide: expectation.keypoints,
          guideAspect: expectation.aspect,
          detected: detected.pose,
        });
        // Posture unread or the beat has an action: one vision call checks both, and rates how
        // real the still looks.
        let realism: RealismVerdict | null = null;
        if (match.score >= DEFAULT_MIN_POSE_MATCH) {
          setStatus(`Checking ${target.label} gesture…`);
          const { checkStillPoseVision } = await import('@/lib/pose-gesture-vision-client');
          ({ match, realism } = await checkStillPoseVision({
            imageUrl,
            beat: expectation.beat ?? target.sceneHints,
            poseKey: expectation.poseKey,
            lead: leadNoun,
            guide: expectation.keypoints,
            guideAspect: expectation.aspect,
            detected: detected.pose,
            match,
            realism: true,
            shared,
          }));
        }
        // A pose map that contradicts the scene's own posture cannot judge the still (the words
        // drew it): no pose redo against it.
        if (guidePostureContradictsWords(match, expectation.beat ?? target.sceneHints)) {
          setStatus(
            `${target.label}: pose not judged — the pose drawing disagrees with the scene.`
          );
          return;
        }
        const gestureMissed = gestureMissWords(match);
        const decision = poseRedoDecision({
          enabled: redoPoseMisses,
          autoReview: autoReviewStills,
          slotId: target.id,
          take,
          poseScore: match.score,
          minPoseMatch: DEFAULT_MIN_POSE_MATCH,
          realismMiss: realism?.computerMade === true,
          ledger: ledgerRef.current,
        });
        const pct = Math.round(match.score * 100);
        const poseRedo = decision.redo && decision.reason === 'pose';
        recordGalleryPlayChecks(still.promptId, { pose: match.score, poseMiss: poseRedo });
        const { width, height } = detected.pose.canvas;
        const missView =
          match.score < DEFAULT_MIN_POSE_MATCH
            ? buildPoseMissView({
                imageUrl,
                score: match.score,
                guide: expectation.keypoints,
                guideAspect: expectation.aspect,
                still: match.assignment.map(index => detected.pose.people[index]),
                stillAspect: width > 0 && height > 0 ? width / height : expectation.aspect,
                posture: posturePairWords(match),
                gesture: gestureMissed,
              })
            : null;
        setMissViews(previous => {
          if (!missView && !previous[target.id]) return previous;
          const next = { ...previous };
          if (missView) next[target.id] = missView;
          else delete next[target.id];
          return next;
        });
        if (!decision.redo) {
          setStatus(
            !missView
              ? `${target.label} pose matched (${pct}%).`
              : `${target.label} missed the pose again (${pct}%${gestureMissed ? `, missed: ${gestureMissed}` : ''}) — redone once already; retry it or pick another pose.`
          );
          return;
        }
        if (decision.reason === 'realism') {
          await redoFor(
            'realism',
            '',
            `Redoing ${target.label}: it looked computer-made (${realism?.rating}/10).`
          );
          return;
        }
        // The same nudge Auto-review's pose reroll sends — it spells the pose out in words — plus
        // the gesture it dropped, with the layout's cue.
        await redoFor(
          'pose',
          [
            POSE_MISMATCH_NUDGE,
            missView ? poseLimbFixNudge(missView.misses) : '',
            gestureFixNudge(gestureMissed, expectation.poseKey, leadNoun),
          ]
            .filter(Boolean)
            .join(' '),
          gestureMissed
            ? `Redoing ${target.label} for the gesture (missed: ${gestureMissed}).`
            : `Redoing ${target.label} for the pose (${pct}% match).`
        );
      } catch (error) {
        setStatus(
          `${target.label} pose check skipped (${error instanceof Error ? error.message : 'error'}).`
        );
      } finally {
        if (!redone) checks?.onSettled(target.id, take);
        inFlightRef.current = null;
        runningRef.current = false;
        setTick(value => value + 1);
      }
    })();
  }, [
    active,
    autoReviewStills,
    bestOfTwoHardPoses,
    redoPoseMisses,
    busy,
    checks,
    faceFinish,
    leadNoun,
    mounted,
    poseGuideExpectRef,
    queueBlockReason,
    queueSlot,
    rerollNudgeRef,
    shared,
    slots,
    stills,
    tick,
  ]);

  const poseRedoMarks: Record<string, string> = {};
  for (const still of stills) {
    const mark = poseRedoMark(ledger, still.slotId, poseRedoTakeId(still));
    if (mark) poseRedoMarks[still.slotId] = mark;
  }

  return {
    poseRedoStatus: active ? status : null,
    poseRedoMarks,
    poseRedoMissViews: missViews,
  };
}
