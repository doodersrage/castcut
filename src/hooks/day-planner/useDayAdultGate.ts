'use client';

import { useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import {
  ADULT_GATE_REQUEUE_MESSAGE,
  ADULT_GATE_WITHHELD_MESSAGE,
  CLOTHED_GATE_REQUEUE_MESSAGE,
  CLOTHED_GATE_WITHHELD_MESSAGE,
} from '@/lib/adult/adult-appearance-gate';
import { dayMoodMustStayClothed } from '@/lib/wardrobe/clothed-coverage';
import {
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
  setGalleryAdultCheck,
} from '@/lib/gallery/comfyui-gallery';
import { COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/gallery/comfyui-gallery-storage-meta';
import { persistCompletedGalleryMedia } from '@/lib/gallery/comfyui-gallery-client';
import { dayPlayedMood } from '@/lib/day/still-prompt';
import { pushSystemTrayMessage } from '@/lib/app/system-tray-messages';

/** The slot's card still holds `promptId` (its take, or the second of two takes). */
function takeOnCard(
  stills: ReadonlyArray<{ slotId: string; promptId?: string; twoTakes?: { promptId: string } }>,
  slotId: string,
  promptId: string
): boolean {
  const still = stills.find(entry => entry.slotId === slotId);
  return still?.promptId?.trim() === promptId || still?.twoTakes?.promptId.trim() === promptId;
}

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
  const {
    busy,
    intimateEnabled,
    mounted,
    queueSlot,
    shared,
    slots,
    stills,
    stillsRef,
    toolSettings,
  } = ctx;
  const [adultGateStatus, setAdultGateStatus] = useState<string | null>(null);
  const runningRef = useRef(false);
  /** Prompt ids already decided this session (a re-render never asks twice). */
  const decidedRef = useRef<Set<string>>(new Set());
  /**
   * Slots waiting for the queue to be free to requeue: what the requeue is for, and the take it
   * redoes (a slot whose card moved on — the Scene page opened another scene — is not redone).
   */
  const requeueRef = useRef<Map<string, { cause: 'age' | 'bare'; promptId: string }>>(new Map());
  const [tick, setTick] = useState(0);
  /**
   * A take is held but its gallery entry isn't there (or not finished) yet — after a reload the
   * card's hold is restored before the Gallery has loaded. Nothing on the card changes when the
   * entry arrives, so the next gallery update looks again (2026-10-25: such a take stayed
   * "Checking…" for good; e2e scene.spec "a take at the adult check" failed 9 runs in 20).
   */
  const waitingForEntryRef = useRef(false);
  useEffect(() => {
    if (!mounted) return;
    const retry = () => {
      if (!waitingForEntryRef.current) return;
      waitingForEntryRef.current = false;
      setTick(value => value + 1);
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, retry);
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, retry);
  }, [mounted]);
  // The mood the Day plays as: Suggestive must stay clothed.
  const clothed = dayMoodMustStayClothed(dayPlayedMood(toolSettings.dayMood, intimateEnabled));

  useEffect(() => {
    if (!mounted || runningRef.current) return;
    // Each take is checked: the still, and the second of two takes (day-two-takes.ts).
    const candidates = stills.flatMap(still => [
      ...(still.adultHold === 'checking' && still.promptId?.trim()
        ? [{ slotId: still.slotId, promptId: still.promptId.trim(), second: false }]
        : []),
      ...(still.twoTakes?.adultHold === 'checking' && still.twoTakes.promptId.trim()
        ? [{ slotId: still.slotId, promptId: still.twoTakes.promptId.trim(), second: true }]
        : []),
    ]);
    const target = candidates.find(candidate => !decidedRef.current.has(candidate.promptId));
    if (!target) return;
    const promptId = target.promptId;
    const entry = loadComfyGallery().find(galleryEntry => galleryEntry.promptId === promptId);
    const imageUrl = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
    if (!entry || entry.status !== 'completed' || !imageUrl) {
      waitingForEntryRef.current = true;
      return;
    }
    waitingForEntryRef.current = false;
    runningRef.current = true;
    const label = slots.find(slot => slot.id === target.slotId)?.label ?? 'A still';
    setAdultGateStatus(`Checking ${label}…`);
    void (async () => {
      try {
        const strongTake = entry.adultCheck?.strong === true;
        const coveredTake = entry.adultCheck?.covered === true;
        const { checkStillAdultAppearance } =
          await import('@/lib/adult/adult-appearance-gate-client');
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
        // One of two takes withheld while the other is still in play: that one stands alone
        // (or is picked) — no requeue, no second message.
        const still = stills.find(entry => entry.slotId === target.slotId);
        const otherTakeInPlay = target.second
          ? Boolean(still && still.status !== 'error')
          : Boolean(still?.twoTakes && still.twoTakes.status !== 'error');
        if (otherTakeInPlay) {
          setAdultGateStatus(null);
          return;
        }
        // The take left the card while it was checked (the Scene page opened another scene):
        // the verdict is on its gallery entry, and nothing on the card now is redone for it.
        const onCard = takeOnCard(stillsRef.current, target.slotId, promptId);
        if (decision.verdict === 'requeue' && onCard) {
          requeueRef.current.set(target.slotId, { cause, promptId });
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
  }, [clothed, mounted, shared, slots, stills, stillsRef, tick]);

  // The one requeue, once the Day queue is free (never overlaps a Queue-all submit).
  useEffect(() => {
    if (!mounted || busy || requeueRef.current.size === 0) return;
    const [slotId, { cause, promptId }] = [...requeueRef.current.entries()][0]!;
    requeueRef.current.delete(slotId);
    const slot = slots.find(entry => entry.id === slotId);
    if (!slot || !takeOnCard(stillsRef.current, slotId, promptId)) {
      setAdultGateStatus(null);
      return;
    }
    void queueSlot(
      slot,
      cause === 'bare' ? { coverageLine: true } : { strongAgeLine: true }
    ).finally(() => {
      setAdultGateStatus(null);
      setTick(value => value + 1);
    });
  }, [busy, mounted, queueSlot, slots, stillsRef, tick]);

  return { adultGateStatus };
}
