/**
 * Why a Gallery entry needs a look (2026-10-14): the checks Day, Story, Outfit and the clip check
 * leave on it — a pose or face miss, a clip that cuts to another shot or came out silent, marks
 * the repair couldn't put back. One list for the Gallery filter, the card badge and Redo these.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

export function galleryNeedsLookReasons(entry: Pick<ComfyGalleryEntry, 'playChecks'>): string[] {
  const checks = entry.playChecks;
  if (!checks) return [];
  return [
    checks.poseMiss ? "didn't follow its pose guide" : '',
    checks.faceMiss ? "doesn't look like the Cast" : '',
    typeof checks.clipCutAt === 'number'
      ? `cuts to another shot at ${checks.clipCutAt.toFixed(1)} s`
      : '',
    checks.clipSilent ? 'no sound' : '',
    checks.marksMissing ? `marks: ${checks.marksMissing}` : '',
  ].filter(Boolean);
}
