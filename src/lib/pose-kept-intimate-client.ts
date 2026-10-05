'use client';

/**
 * Browser side of pose-kept-intimate.ts: a Gallery keeper on an intimate two-person take reads
 * the still one person at a time and files the pose in this install's pose library. Quiet and
 * best-effort — a missing node pack, a failed read or a merged couple just skips the still.
 */

import { comfyViewUrlForStill } from '@/lib/still-comfy-url';
import { detectStillPose } from '@/lib/pose-detect-client';
import { keptIntimateLayout, keptIntimateLibraryEntry } from '@/lib/pose-kept-intimate';
import { loadPoseLibrary, savePoseLibraryEntry } from '@/lib/pose-library';
import { loadPoseOutcomeStats } from '@/lib/pose-outcome-stats';

type KeptEntry = {
  promptId?: string | null;
  images?: Array<{ filename?: string; subfolder?: string; type?: string }> | null;
};

/** Takes read this page session (a re-star doesn't read the still again). */
const seen = new Set<string>();

/** Learn from each kept entry whose take drew a learnable intimate layout. */
export async function learnKeptIntimatePoses(entries: readonly KeptEntry[]): Promise<void> {
  const takes = loadPoseOutcomeStats().takes ?? {};
  for (const entry of entries) {
    const takeId = entry.promptId?.trim();
    if (!takeId || seen.has(takeId)) continue;
    const layout = keptIntimateLayout(takes[takeId]?.k);
    if (!layout) continue;
    seen.add(takeId);
    if (loadPoseLibrary().some(saved => saved.id.endsWith(`-${takeId.slice(0, 24)}`))) continue;
    const imageUrl = comfyViewUrlForStill({ promptId: takeId }, [entry]);
    if (!imageUrl) continue;
    try {
      const detected = await detectStillPose(imageUrl, { perPerson: true });
      if (!detected.available) continue;
      const read = keptIntimateLibraryEntry({ layout, detected: detected.pose, takeId });
      if (read.ok) savePoseLibraryEntry(read.entry);
    } catch {
      // Learning is a nicety: never let it disturb the Gallery.
    }
  }
}
