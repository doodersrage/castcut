'use client';

/**
 * Cast home → Likeness → Measure: face-match the Cast's stills that have no score yet against
 * the look's plate, and keep each score on its Gallery entry (playChecks.face). Scores were only
 * recorded when Day's review gate ran, so most installs had none to chart (2026-10-14). The
 * check runs on ComfyUI's CPU through the Castcut nodes — no render job, the queue is untouched.
 */

import { looksOf, type CharacterLook, type CharacterRecord } from '@/lib/character-os';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery-entry';
import { loadComfyGallery, recordGalleryPlayChecks } from '@/lib/comfyui-gallery';
import { comfyInputViewUrl, measureStillFaceMatch } from '@/lib/face-match-client';
import { STILL_MIN_FACE_MATCH } from '@/lib/face-match';
import { galleryEntryComfyStillUrl } from '@/lib/fix-area-gallery';

/** One run measures at most this many (newest first); Measure again picks up the rest. */
export const LIKENESS_MEASURE_BATCH = 60;

function isComfyViewUrl(url: string): boolean {
  return url.includes('/api/comfyui/view?');
}

/** The plate a look's stills are judged against, as a ComfyUI view URL. */
export function lookPlateFaceUrl(look: Pick<CharacterLook, 'reference'>): string | null {
  const reference = look.reference;
  for (const url of [reference?.isolatedUrl, reference?.originalUrl]) {
    if (url?.trim() && isComfyViewUrl(url)) return url.trim();
  }
  return comfyInputViewUrl(reference?.isolatedFilename || reference?.originalFilename);
}

/** Day stills of this Cast and look with no face score yet, newest first. */
export function unmeasuredLookStills(
  entries: ReadonlyArray<ComfyGalleryEntry>,
  input: { characterId: string; lookId: string; defaultLookId: string }
): ComfyGalleryEntry[] {
  return entries
    .filter(
      entry =>
        entry.characterId === input.characterId &&
        (entry.lookId ?? input.defaultLookId) === input.lookId &&
        entry.tool === 'image-prompt' &&
        typeof entry.playChecks?.face !== 'number' &&
        Boolean(galleryEntryComfyStillUrl(entry))
    )
    .sort((a, b) => (b.completedAt ?? b.queuedAt ?? 0) - (a.completedAt ?? a.queuedAt ?? 0))
    .slice(0, LIKENESS_MEASURE_BATCH);
}

export async function measureLookLikeness(input: {
  character: CharacterRecord;
  look: CharacterLook;
  defaultLookId: string;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<{ measured: number; noFace: number; total: number; error?: string }> {
  const referenceUrl = lookPlateFaceUrl(input.look);
  if (!referenceUrl) return { measured: 0, noFace: 0, total: 0, error: 'This look has no plate.' };
  const todo = unmeasuredLookStills(loadComfyGallery(), {
    characterId: input.character.id,
    lookId: input.look.id,
    defaultLookId: input.defaultLookId,
  });
  let measured = 0;
  let noFace = 0;
  for (const [index, entry] of todo.entries()) {
    if (input.signal?.aborted) break;
    input.onProgress?.(index, todo.length);
    const imageUrl = galleryEntryComfyStillUrl(entry);
    if (!imageUrl) continue;
    try {
      const result = await measureStillFaceMatch({ referenceUrl, imageUrl });
      if (!result) {
        noFace += 1;
        continue;
      }
      if (!result.available) {
        return { measured, noFace, total: todo.length, error: result.reason };
      }
      recordGalleryPlayChecks(entry.promptId, {
        face: result.similarity,
        faceMiss: result.similarity < STILL_MIN_FACE_MATCH,
      });
      measured += 1;
    } catch (error) {
      // A plate with no face to find stops the run; a single still that fails is skipped.
      const message = error instanceof Error ? error.message : String(error);
      if (/reference/i.test(message))
        return { measured, noFace, total: todo.length, error: message };
    }
  }
  input.onProgress?.(todo.length, todo.length);
  return { measured, noFace, total: todo.length };
}

export type LookPlateComparison = {
  lookId: string;
  name: string;
  face: number | null;
  note?: string;
};

/**
 * Each look's plate face against the reference look's (Default, else the oldest): a plate that
 * drifted from the Cast drags every still made from it (2026-10-14). Plates are clean frontal
 * pictures, so they compare higher than stills do (PLATE_DRIFT_BELOW).
 */
export const PLATE_DRIFT_BELOW = 0.6;

export async function compareLookPlates(
  character: CharacterRecord,
  onProgress?: (done: number, total: number) => void
): Promise<LookPlateComparison[]> {
  const looks = looksOf(character);
  // The look named Default, else the oldest — the Cast as first made.
  const reference =
    looks.find(look => /^default$/i.test(look.name.trim())) ??
    [...looks].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0]!;
  const referenceUrl = lookPlateFaceUrl(reference);
  const results: LookPlateComparison[] = [];
  for (const [index, look] of looks.entries()) {
    onProgress?.(index, looks.length);
    if (look.id === reference.id) continue;
    const url = lookPlateFaceUrl(look);
    if (!referenceUrl || !url) {
      results.push({ lookId: look.id, name: look.name, face: null, note: 'no plate' });
      continue;
    }
    try {
      const measured = await measureStillFaceMatch({ referenceUrl, imageUrl: url });
      results.push({
        lookId: look.id,
        name: look.name,
        face: measured?.available ? measured.similarity : null,
        ...(measured && !measured.available
          ? { note: measured.reason }
          : measured
            ? {}
            : { note: 'no face found' }),
      });
    } catch (error) {
      results.push({
        lookId: look.id,
        name: look.name,
        face: null,
        note: error instanceof Error ? error.message : 'check failed',
      });
    }
  }
  onProgress?.(looks.length, looks.length);
  return results;
}
