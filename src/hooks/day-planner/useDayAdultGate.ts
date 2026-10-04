'use client';

import { useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import {
  ADULT_GATE_REQUEUE_MESSAGE,
  ADULT_GATE_WITHHELD_MESSAGE,
  CLOTHED_GATE_REQUEUE_MESSAGE,
  CLOTHED_GATE_WITHHELD_MESSAGE,
} from '@/lib/adult-appearance-gate';
import { checkStillAdultAppearance } from '@/lib/adult-appearance-gate-client';
import { dayMoodMustStayClothed } from '@/lib/clothed-coverage';
import {
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
  setGalleryAdultCheck,
} from '@/lib/comfyui-gallery';
import { persistCompletedGalleryMedia } from '@/lib/comfyui-gallery-client';
import { dayPlayedMood } from '@/lib/day-still-prompt';
import { pushSystemTrayMessage } from '@/lib/system-tray-messages';

/**
 * The adult-appearance gate on Day (adult-appearance-gate.ts): every Suggestive / Intimate /
 * Raunchy still is held (`adultHold: 'checking'`) until the vision model says all people shown
 * clearly look like adults over 21. A take that does not is withheld for good, and the slot is
 * requeued once with the stronger age sentence; a second withheld take stops with a message on
 * the card. Always on — independent of Auto-review — and one check at a time.
 *
 * Suggestive is a clothed mood: the same question also asks whether anyone's chest, genitals
 * or buttocks are bare (clothed-coverage.ts). A "yes" is treated like a pose miss — withheld,
 * and requeued once with the strong coverage line — so a nude still is never shown as
 * Suggestive.
 */
export function useDayAdultGate(ctx: DayPlannerToolOrchestrationCore) {
  const { busy, intimateEnabled, mounted, queueSlot, shared, slots, stills, toolSettings } = ctx;
  const [adultGateStatus, setAdultGateStatus] = useState<string | null>(null);
  const runningRef = useRef(false);
  /** Prompt ids already decided this session (a re-render never asks twice). */
  const decidedRef = useRef<Set<string>>(new Set());
  /** Slots waiting for the queue to be free to requeue, and what the requeue is for. */
  const requeueRef = useRef<Map<string, 'age' | 'bare'>>(new Map());
  const [tick, setTick] = useState(0);
  // The mood the Day plays as: Suggestive must stay clothed.
  const clothed = dayMoodMustStayClothed(dayPlayedMood(toolSettings.dayMood, intimateEnabled));

  useEffect(() => {
    if (!mounted || runningRef.current) return;
    const target = stills.find(
      still =>
        still.adultHold === 'checking' &&
        Boolean(still.promptId?.trim()) &&
        !decidedRef.current.has(still.promptId!.trim())
    );
    if (!target?.promptId) return;
    const promptId = target.promptId.trim();
    const entry = loadComfyGallery().find(galleryEntry => galleryEntry.promptId === promptId);
    const imageUrl = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
    if (!entry || entry.status !== 'completed' || !imageUrl) return;
    runningRef.current = true;
    const label = slots.find(slot => slot.id === target.slotId)?.label ?? 'A still';
    setAdultGateStatus(`Checking ${label}…`);
    void (async () => {
      try {
        const strongTake = entry.adultCheck?.strong === true;
        const coveredTake = entry.adultCheck?.covered === true;
        const decision = await checkStillAdultAppearance({
          imageUrl,
          strongTake,
          clothed,
          coveredTake,
          shared,
        });
        decidedRef.current.add(promptId);
        const takeMarks = {
          ...(strongTake ? { strong: true } : {}),
          ...(coveredTake ? { covered: true } : {}),
        };
        if (decision.verdict === 'pass' || decision.verdict === 'unchecked') {
          setGalleryAdultCheck(promptId, {
            state: decision.verdict === 'pass' ? 'passed' : 'unchecked',
            reason: decision.reason,
            ...takeMarks,
          });
          void persistCompletedGalleryMedia({ ...entry, adultCheck: undefined });
          setAdultGateStatus(null);
          return;
        }
        const cause = decision.cause ?? 'age';
        setGalleryAdultCheck(promptId, {
          state: 'withheld',
          reason: decision.reason,
          cause,
          ...takeMarks,
        });
        console.warn('Adult check withheld a Day still:', label, decision.reason);
        if (decision.verdict === 'requeue') {
          requeueRef.current.set(target.slotId, cause);
          pushSystemTrayMessage({
            text: `${label}: ${cause === 'bare' ? CLOTHED_GATE_REQUEUE_MESSAGE : ADULT_GATE_REQUEUE_MESSAGE}`,
            tone: 'warning',
          });
          setAdultGateStatus(
            cause === 'bare'
              ? `${label}: redoing with a coverage line…`
              : `${label}: redoing with a stronger age line…`
          );
        } else {
          pushSystemTrayMessage({
            text: `${label}: ${cause === 'bare' ? CLOTHED_GATE_WITHHELD_MESSAGE : ADULT_GATE_WITHHELD_MESSAGE}.`,
            tone: 'warning',
            ttlMs: 20_000,
          });
          setAdultGateStatus(null);
        }
      } finally {
        runningRef.current = false;
        setTick(value => value + 1);
      }
    })();
  }, [clothed, mounted, shared, slots, stills, tick]);

  // The one requeue, once the Day queue is free (never overlaps a Queue-all submit).
  useEffect(() => {
    if (!mounted || busy || requeueRef.current.size === 0) return;
    const [slotId, cause] = [...requeueRef.current.entries()][0]!;
    requeueRef.current.delete(slotId);
    const slot = slots.find(entry => entry.id === slotId);
    if (!slot) return;
    void queueSlot(
      slot,
      cause === 'bare' ? { coverageLine: true } : { strongAgeLine: true }
    ).finally(() => {
      setAdultGateStatus(null);
      setTick(value => value + 1);
    });
  }, [busy, mounted, queueSlot, slots, tick]);

  return { adultGateStatus };
}
