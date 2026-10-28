/**
 * Why a Gallery entry needs a look (2026-10-14): the checks Day, Story, Outfit and the clip check
 * leave on it — a pose or face miss, a clip that cuts to another shot or came out silent, marks
 * the repair couldn't put back. One list for the Gallery filter, the card badge and Redo these.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

/**
 * Whether the clip check (a hard cut inside, a talking clip with no sound) means anything for this
 * video. Not for a film Cut assembled: its cuts are the edit, and a film of stills is silent (M6).
 */
export function clipCheckApplies(entry: Pick<ComfyGalleryEntry, 'derivedKind'>): boolean {
  return entry.derivedKind !== 'film';
}

/** The checks on an entry, less clip checks a film was given before films were left out. */
export function entryPlayChecks(
  entry: Pick<ComfyGalleryEntry, 'playChecks' | 'derivedKind'>
): ComfyGalleryEntry['playChecks'] {
  const checks = entry.playChecks;
  if (!checks || clipCheckApplies(entry)) return checks;
  const { clipCutAt: _cut, clipSilent: _silent, ...rest } = checks;
  return rest;
}

export function galleryNeedsLookReasons(
  entry: Pick<ComfyGalleryEntry, 'playChecks' | 'derivedKind'>
): string[] {
  const checks = entryPlayChecks(entry);
  if (!checks) return [];
  return [
    checks.poseMiss ? "didn't follow its pose guide" : '',
    checks.faceMiss ? "doesn't look like the Cast" : '',
    typeof checks.clipCutAt === 'number'
      ? `cuts to another shot at ${checks.clipCutAt.toFixed(1)} s`
      : '',
    checks.clipSilent ? 'no sound' : '',
    checks.marksMissing ? `marks: ${checks.marksMissing}` : '',
    checks.outfitMiss ? `wearing ${checks.outfitMiss}, not the planned outfit` : '',
    checks.placeMiss ? `in ${checks.placeMiss}, not the planned place` : '',
  ].filter(Boolean);
}
