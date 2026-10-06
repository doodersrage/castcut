'use client';

import { useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { dayStillsCachePatch, upsertDaySlotStill } from '@/lib/day-planner';
import {
  dayTwoTakesNeedsOrder,
  dayTwoTakesOrderPatch,
  dayTwoTakesPairId,
} from '@/lib/day-two-takes';
import { countDuoStill } from '@/lib/duo-still-check-client';
import { likelierTwoTake, type DuoStillCounts } from '@/lib/duo-still-check';
import { comfyViewUrlForStill } from '@/lib/still-comfy-url';

/**
 * Two takes (intimate stills, "Two takes, you pick"): when both takes of a slot land, count
 * faces, hands, bodies and limbs on each (duo-still-check.ts, one ComfyUI check graph per take)
 * and show the take with fewer counted oddities first on the card, with a note. Nothing is
 * redone and the pick stays the player's — the counts order a bad / good pair right only
 * 35–47% of the time (ties 28–44%), far from what an automatic redo would need. Once per pair,
 * only while the Day queue is idle; off for the session when ComfyUI lacks a node or model.
 */
export function useDayTwoTakesOrder(ctx: DayPlannerToolOrchestrationCore) {
  // Not gated on queueBlockReason: the count queues no render, so a Day without a plate (an
  // older Day's stills) still gets its takes ordered.
  const { busy, mounted, slots, stills, stillsRef, updateToolSettings } = ctx;
  const { toolSettings } = ctx;
  const characterId = ctx.shared.activeCharacterId;
  const active = toolSettings.twoTakesIntimate === true;

  const [status, setStatus] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const runningRef = useRef(false);
  /** Pairs counted (or being counted) this session. */
  const checkedRef = useRef<Set<string>>(new Set());
  /** Set once the check reports it can't run here — no counts this session. */
  const offRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active || !mounted || busy || runningRef.current) return;
    if (offRef.current) return;
    const target = slots.find(slot => {
      const still = stills.find(entry => entry.slotId === slot.id);
      return dayTwoTakesNeedsOrder(still) && !checkedRef.current.has(dayTwoTakesPairId(still));
    });
    const still = target ? stills.find(entry => entry.slotId === target.id) : undefined;
    if (!target || !still?.twoTakes) return;
    const pairId = dayTwoTakesPairId(still);
    checkedRef.current.add(pairId);
    runningRef.current = true;
    const gallery = loadComfyGallery();
    const firstUrl = comfyViewUrlForStill(still, gallery) ?? still.imageUrl ?? '';
    const second = still.twoTakes;
    const secondUrl = comfyViewUrlForStill(second, gallery) ?? second.imageUrl ?? '';

    void (async () => {
      try {
        setStatus(`Counting ${target.label}'s two takes…`);
        const read = async (url: string): Promise<DuoStillCounts | null> => {
          const result = await countDuoStill(url);
          if (!result.available) {
            offRef.current = result.reason;
            return null;
          }
          return result.counts;
        };
        const firstCounts = await read(firstUrl);
        const secondCounts = firstCounts ? await read(secondUrl) : null;
        if (offRef.current) {
          setStatus(`Two takes order off: ${offRef.current}`);
          return;
        }
        const likelier = likelierTwoTake(firstCounts, secondCounts);
        const current = stillsRef.current.find(entry => entry.slotId === target.id);
        const patch = dayTwoTakesOrderPatch(current, pairId, likelier);
        if (!patch) return;
        const next = upsertDaySlotStill(stillsRef.current, patch);
        stillsRef.current = next;
        updateToolSettings(dayStillsCachePatch(next, characterId));
        setStatus(
          likelier
            ? `${target.label}: take ${likelier.pick === 'first' ? 1 : 2} first — the other counted more oddities. You pick.`
            : `${target.label}: both takes counted alike — you pick.`
        );
      } catch (error) {
        setStatus(
          `${target.label} take count skipped (${error instanceof Error ? error.message : 'error'}).`
        );
      } finally {
        runningRef.current = false;
        setTick(value => value + 1);
      }
    })();
  }, [active, busy, characterId, mounted, slots, stills, stillsRef, tick, updateToolSettings]);

  return { twoTakesOrderStatus: active ? status : null };
}
