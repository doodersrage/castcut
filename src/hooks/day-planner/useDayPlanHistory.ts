'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DaySlot } from '@/lib/day/planner';
import {
  EMPTY_PLAN_HISTORY,
  planChangeLabel,
  recordPlanStep,
  redoPlanStep,
  samePlan,
  undoPlanStep,
  type DayPlanHistory,
} from '@/lib/day/plan-history';

/** Edits closer together than this are one step (typing a beat is one undo, not forty). */
const BURST_MS = 1000;

/**
 * Undo / redo for the Day plan (day-plan-history.ts). One step per burst of edits; cleared when
 * the Day changes owner (another Cast's plan must never come back here).
 */
export function useDayPlanHistory(input: {
  slots: DaySlot[];
  owner: string;
  applySlots: (slots: DaySlot[]) => void;
}) {
  const { slots, owner, applySlots } = input;
  // The ref is the truth (undo / redo read and write it outside render); the state re-renders.
  const historyRef = useRef<DayPlanHistory>(EMPTY_PLAN_HISTORY);
  const [history, setHistory] = useState<DayPlanHistory>(EMPTY_PLAN_HISTORY);
  const [editing, setEditing] = useState(false);
  const previousRef = useRef<DaySlot[]>(slots);
  const burstStartRef = useRef<DaySlot[] | null>(null);
  const timerRef = useRef<number | null>(null);
  const applyingRef = useRef(false);
  const ownerRef = useRef(owner);

  const commit = useCallback((next: DayPlanHistory) => {
    historyRef.current = next;
    setHistory(next);
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const before = burstStartRef.current;
    burstStartRef.current = null;
    setEditing(false);
    if (before && !samePlan(before, previousRef.current)) {
      commit(recordPlanStep(historyRef.current, before));
    }
  }, [commit]);

  useEffect(() => {
    if (ownerRef.current !== owner) {
      ownerRef.current = owner;
      burstStartRef.current = null;
      previousRef.current = slots;
      commit(EMPTY_PLAN_HISTORY);
      return;
    }
    if (samePlan(previousRef.current, slots)) return;
    if (applyingRef.current) {
      applyingRef.current = false;
      previousRef.current = slots;
      return;
    }
    if (!burstStartRef.current) {
      burstStartRef.current = previousRef.current;
      setEditing(true);
    }
    previousRef.current = slots;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, BURST_MS);
  }, [commit, flush, owner, slots]);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    []
  );

  const undo = useCallback(() => {
    flush();
    const step = undoPlanStep(historyRef.current, previousRef.current);
    if (!step) return;
    applyingRef.current = true;
    commit(step.history);
    applySlots(step.slots);
  }, [applySlots, commit, flush]);

  const redo = useCallback(() => {
    const step = redoPlanStep(historyRef.current, previousRef.current);
    if (!step) return;
    applyingRef.current = true;
    commit(step.history);
    applySlots(step.slots);
  }, [applySlots, commit]);

  const lastPast = history.past[history.past.length - 1];
  const firstFuture = history.future[0];
  return {
    canUndoPlan: Boolean(lastPast) || editing,
    canRedoPlan: Boolean(firstFuture),
    undoPlanLabel: lastPast ? planChangeLabel(slots, lastPast) : 'the last edit',
    redoPlanLabel: firstFuture ? planChangeLabel(slots, firstFuture) : 'the plan',
    undoPlan: undo,
    redoPlan: redo,
  };
}
