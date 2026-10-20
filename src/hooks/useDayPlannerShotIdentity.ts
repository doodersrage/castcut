'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/gallery/comfyui-gallery-storage-meta';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery-entry';
import { getGalleryCache, warmGalleryStore } from '@/lib/gallery/db-store';
import { cutChecksCoverage, cutChecksCoverageLine, dayCutNotes } from '@/lib/film/delivery-check';
import { batchTimeLine, dayBatchCounts } from '@/lib/day/batch-plan';
import {
  DAY_IDENTITY_BARS,
  dayFaceBySlot,
  identityMark,
  type IdentityMark,
} from '@/lib/identity-mark';

const NO_GALLERY: ComfyGalleryEntry[] = [];

function subscribeGallery(onChange: () => void): () => void {
  window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onChange);
  return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onChange);
}

/**
 * The face checks live on gallery entries; the store is otherwise loaded by the background
 * poller after an idle delay, so Day's marks would show seconds late (never, in e2e builds).
 */
function useWarmGallery(): ComfyGalleryEntry[] {
  useEffect(() => {
    void warmGalleryStore();
  }, []);
  return useSyncExternalStore(subscribeGallery, getGalleryCache, () => NO_GALLERY);
}

/** Day: "does this slot's still look like the Cast?" for the slot cards and the Cut shot list. */
export function useDayShotIdentity(
  stills: ReadonlyArray<{ slotId: string; promptId?: string }>,
  castName?: string | null
): (shot: { key: string }) => IdentityMark | null {
  const gallery = useWarmGallery();
  const faces = useMemo(() => dayFaceBySlot(stills, gallery), [gallery, stills]);
  return useCallback(
    (shot: { key: string }) => identityMark(faces.get(shot.key), DAY_IDENTITY_BARS, castName),
    [castName, faces]
  );
}

/**
 * Day: what the cut will quietly do (dayCutNotes) and which checks have run on the shots going
 * in (cutChecksCoverage), for the line under Cut.
 */
export function useDayCutReadiness(input: {
  slots: Parameters<typeof dayCutNotes>[0];
  stills: Array<Parameters<typeof dayCutNotes>[1][number] & { promptId?: string }>;
  /** Day keys of the shots going into the cut (after leave-outs). */
  shotKeys: string[];
  reviewOn: boolean;
}): { notes: string[]; coverage: string } {
  const gallery = useWarmGallery();
  const { slots, stills, shotKeys, reviewOn } = input;
  const keyList = shotKeys.join('|');
  return useMemo(() => {
    const keys = keyList ? keyList.split('|') : [];
    const byPrompt = new Map(gallery.map(entry => [entry.promptId, entry.playChecks]));
    let face = 0;
    let pose = 0;
    for (const key of keys) {
      const promptId = stills.find(still => still.slotId === key)?.promptId?.trim();
      const checks = promptId ? byPrompt.get(promptId) : undefined;
      if (typeof checks?.face === 'number') face += 1;
      if (typeof checks?.pose === 'number') pose += 1;
    }
    return {
      notes: dayCutNotes(slots, stills),
      coverage: cutChecksCoverageLine(
        cutChecksCoverage({
          shotCount: keys.length,
          faceChecked: face,
          poseChecked: pose,
          reviewOn,
        })
      ),
    };
  }, [gallery, keyList, reviewOn, slots, stills]);
}

/**
 * Day: how long Queue the rest / Animate all would take on this machine, behind what is queued
 * (day-batch-plan.ts). Lines are null when that button has nothing to do.
 */
export function useDayPlannerBatchPlan(input: {
  slots: ReadonlyArray<{ id: string }>;
  stills: ReadonlyArray<{ slotId: string; status?: string; clipStatus?: string }>;
  model?: string;
}): { queueLine: string | null; animateLine: string | null } {
  const gallery = useWarmGallery();
  const { slots, stills, model } = input;
  return useMemo(() => {
    const counts = dayBatchCounts(slots, stills);
    const completed = gallery.filter(entry => entry.status === 'completed');
    const active = gallery.filter(
      entry => entry.status === 'pending' || entry.status === 'running'
    );
    return {
      queueLine: batchTimeLine({ count: counts.stills, kind: 'still', completed, active, model }),
      animateLine: batchTimeLine({ count: counts.clips, kind: 'clip', completed, active }),
    };
  }, [gallery, model, slots, stills]);
}
