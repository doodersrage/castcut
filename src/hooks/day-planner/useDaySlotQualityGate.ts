'use client';

import { useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { isDayAdultMood, normalizeDayIntimateMix, normalizeDayMood } from '@/lib/day-planner';
import { recordSlotReviewOutcome } from '@/lib/play-metrics';
import {
  decideSlotQuality,
  flaggedSlotIds,
  recordSlotDecision,
  reviewOutfitLabel,
  slotRerollNudge,
  slotRerollsUsed,
  type SlotQualityLedger,
} from '@/lib/play-slot-quality';
import { buildFaceComparePair } from '@/lib/play-face-compare';
import { reviewDaySlotStill } from '@/lib/play-slot-review-client';

/**
 * Opt-in Day quality gate: when a still lands, vision-review it and requeue the slot (bounded
 * rerolls) if the face, hands, or outfit are broken. Reviews run one at a time and only while
 * the Day queue is idle so rerolls never overlap a Queue-all submit.
 */
export function useDaySlotQualityGate(ctx: DayPlannerToolOrchestrationCore) {
  const { autoReviewStills, busy, mounted, queueSlot, rerollNudgeRef, shared, slots, stills } = ctx;
  const { plate, toolSettings, wardrobeLabelFor } = ctx;

  const [qualityStatus, setQualityStatus] = useState<string | null>(null);
  const [qualityLedger, setQualityLedger] = useState<SlotQualityLedger>({});
  const [tick, setTick] = useState(0);
  const stillsEmpty = stills.length === 0;
  const [wasStillsEmpty, setWasStillsEmpty] = useState(stillsEmpty);
  // A new Day clears the stills — reset the visible ledger/status when that happens.
  if (stillsEmpty !== wasStillsEmpty) {
    setWasStillsEmpty(stillsEmpty);
    if (stillsEmpty) {
      setQualityLedger({});
      setQualityStatus(null);
    }
  }
  const ledgerRef = useRef<SlotQualityLedger>({});
  const reviewedRef = useRef<Record<string, string>>({});
  const baselinedRef = useRef(false);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    // A new Day clears the stills — start the review marks and ledger fresh.
    if (stills.length === 0) {
      baselinedRef.current = true;
      reviewedRef.current = {};
      ledgerRef.current = {};
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
  }, [mounted, stills]);

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
        const decision = decideSlotQuality(report, slotRerollsUsed(ledgerRef.current, target.id));
        ledgerRef.current = recordSlotDecision(ledgerRef.current, target.id, decision);
        setQualityLedger(ledgerRef.current);
        recordSlotReviewOutcome(decision.action);

        if (decision.action === 'keep') {
          setQualityStatus(
            decision.warnings.length > 0
              ? `${target.label} passed (${decision.overall}/5) — ${decision.warnings.join(', ')}.`
              : `${target.label} passed review (${decision.overall}/5).`
          );
        } else if (decision.action === 'flag') {
          setQualityStatus(
            `${target.label} needs a look: ${decision.reasons.join(', ')}. Retry or reroll it.`
          );
        } else {
          const nudge = slotRerollNudge(report.flags);
          if (nudge) {
            rerollNudgeRef.current[target.id] = nudge;
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
    qualityStatus: autoReviewStills ? qualityStatus : null,
    qualityLedger,
    flaggedSlotIds: flaggedSlotIds(qualityLedger),
  };
}
