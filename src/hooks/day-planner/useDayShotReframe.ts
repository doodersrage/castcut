'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { dayStillsCachePatch, upsertDaySlotStill } from '@/lib/day/planner';
import { dayTwoTakesPending } from '@/lib/day/two-takes';
import { loadComfyGallery } from '@/lib/gallery/comfyui-gallery';
import { comfyViewUrlForStill } from '@/lib/comfyui/still-comfy-url';
import { pickedReframeShot } from '@/lib/pose/shot-reframe';
import { reframeStillToShot } from '@/lib/pose/shot-reframe-client';

/**
 * A slot whose camera pick is a waist-up or head-and-shoulders shot: Qwen-Image 2.1 draws it
 * thigh-up at best, so the finished take is cut to the shot around her face (shot-reframe.ts)
 * and the cut swapped into the slot. Runs first — Face finish, the pose check and the after
 * checks wait for it (`holdsStill`), so they look at the still the player gets. A take with no
 * face found, a lying pose, a two-person still or one already that close is left as it is.
 */
function stillKey(still: { imageUrl?: string; promptId?: string }): string {
  return still.promptId?.trim() || still.imageUrl?.trim() || '';
}

/** The take's queued prompt asks for a shot a cut makes. */
function wantsReframe(still: { promptId?: string }): boolean {
  const promptId = still.promptId?.trim();
  if (!promptId) return false;
  const entry = loadComfyGallery().find(item => item.promptId === promptId);
  return Boolean(entry && pickedReframeShot(entry.prompt));
}

export function useDayShotReframe(ctx: DayPlannerToolOrchestrationCore) {
  const { mounted, shared, slots, stills, stillsRef, updateToolSettings } = ctx;
  const [status, setStatus] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const handledRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Set<string>>(new Set());
  const baselinedRef = useRef(false);
  const runningRef = useRef(false);

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
    if (!mounted || runningRef.current || !baselinedRef.current) return;
    const target = slots.find(slot => {
      const still = stills.find(entry => entry.slotId === slot.id);
      return (
        still?.status === 'completed' &&
        Boolean(still.imageUrl) &&
        !dayTwoTakesPending(still) &&
        !handledRef.current.has(stillKey(still)) &&
        wantsReframe(still)
      );
    });
    const targetStill = target ? stills.find(entry => entry.slotId === target.id) : undefined;
    if (!target || !targetStill?.imageUrl) return;
    const sourceKey = stillKey(targetStill);
    handledRef.current.add(sourceKey);
    pendingRef.current.add(sourceKey);
    runningRef.current = true;
    void (async () => {
      try {
        const comfyStillUrl = comfyViewUrlForStill(targetStill, loadComfyGallery());
        if (!comfyStillUrl) return;
        setStatus(`Framing ${target.label} to the picked shot…`);
        const result = await reframeStillToShot(comfyStillUrl);
        if (!result.available) {
          setStatus(`${target.label} kept as rendered — ${result.reason}`);
          return;
        }
        const current = stillsRef.current.find(entry => entry.slotId === target.id);
        if (current?.status !== 'completed' || stillKey(current) !== sourceKey) {
          setStatus(`The ${target.label} cut was discarded — the slot changed meanwhile.`);
          return;
        }
        const nextStills = upsertDaySlotStill(stillsRef.current, {
          slotId: target.id,
          imageUrl: result.imageUrl,
          status: 'completed',
          finishedUrl: result.imageUrl,
          finishedFor: current.promptId,
          framedUrl: result.imageUrl,
        });
        stillsRef.current = nextStills;
        updateToolSettings(dayStillsCachePatch(nextStills, shared.activeCharacterId));
        setStatus(
          `${target.label} framed ${result.shot === 'head' ? 'head and shoulders' : 'waist-up'}.`
        );
      } catch (error) {
        setStatus(
          `${target.label} kept as rendered — ${error instanceof Error ? error.message : 'the cut failed.'}`
        );
      } finally {
        pendingRef.current.delete(sourceKey);
        runningRef.current = false;
        setTick(value => value + 1);
      }
    })();
  }, [mounted, shared.activeCharacterId, slots, stills, stillsRef, tick, updateToolSettings]);

  /** Face finish and the checks wait for this: the still is about to be cut to its shot. */
  const holdsStill = useCallback((still: { imageUrl?: string; promptId?: string }) => {
    const key = stillKey(still);
    if (pendingRef.current.has(key)) return true;
    return baselinedRef.current && !handledRef.current.has(key) && wantsReframe(still);
  }, []);

  return { shotReframeStatus: status, shotReframeTick: tick, holdsStillForReframe: holdsStill };
}
