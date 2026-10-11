/**
 * Does this still look like the Cast? One mark for a Day slot card and the Cut shot list, from
 * the measured face match (face-match.ts) against the bars the surface already uses: Day stills
 * against the plate (STILL_*), Story against its reference (STORY_*, staged expressions score
 * lower). Pure. UI review (2026-10-11): the face match only showed in the Gallery and on Story
 * beats, so a drifted Day still went into the cut unnoticed.
 */

import {
  STILL_FACE_MATCH_WARN_BELOW,
  STILL_MIN_FACE_MATCH,
  STORY_FACE_MATCH_WARN_BELOW,
  STORY_MIN_FACE_MATCH,
} from './face-match';

export type IdentityBars = { miss: number; warn: number };

export const DAY_IDENTITY_BARS: IdentityBars = {
  miss: STILL_MIN_FACE_MATCH,
  warn: STILL_FACE_MATCH_WARN_BELOW,
};

export const STORY_IDENTITY_BARS: IdentityBars = {
  miss: STORY_MIN_FACE_MATCH,
  warn: STORY_FACE_MATCH_WARN_BELOW,
};

export type IdentityMark = {
  tone: 'ok' | 'warn' | 'miss';
  /** Short chip text ("Looks like Nora"). */
  label: string;
  /** Longer line for a title / screen reader. */
  detail: string;
  /** Face match, 0–100. */
  pct: number;
};

/** The mark for a measured face match, or null when none was measured. */
export function identityMark(
  similarity: number | null | undefined,
  bars: IdentityBars,
  castName?: string | null
): IdentityMark | null {
  if (typeof similarity !== 'number' || !Number.isFinite(similarity)) return null;
  const name = castName?.trim() || 'the Cast';
  const pct = Math.round(similarity * 100);
  if (similarity < bars.miss) {
    return {
      tone: 'miss',
      label: `Not ${name}?`,
      detail: `Face match ${pct}% — this doesn't look like ${name}. Retry it or leave it out of the cut.`,
      pct,
    };
  }
  if (similarity < bars.warn) {
    return {
      tone: 'warn',
      label: 'Face may drift',
      detail: `Face match ${pct}% — close to ${name}, worth a look.`,
      pct,
    };
  }
  return { tone: 'ok', label: `Looks like ${name}`, detail: `Face match ${pct}%.`, pct };
}

/** Day: the face match of each slot's shown still, from its gallery entry's checks. */
export function dayFaceBySlot(
  stills: ReadonlyArray<{ slotId: string; promptId?: string }>,
  gallery: ReadonlyArray<{ promptId: string; playChecks?: { face?: number } }>
): Map<string, number> {
  const wanted = new Map<string, string>();
  for (const still of stills) {
    const id = still.promptId?.trim();
    if (id) wanted.set(id, still.slotId);
  }
  const out = new Map<string, number>();
  if (wanted.size === 0) return out;
  for (const entry of gallery) {
    const slotId = wanted.get(entry.promptId);
    const face = entry.playChecks?.face;
    if (slotId && typeof face === 'number') out.set(slotId, face);
  }
  return out;
}

/**
 * Story: a shot's mark from its beat's face match — only while that match is for the still the
 * beat shows now (a re-roll makes the old match stale). Shot keys are `${beat.id}@${beat.at}`.
 */
export function storyShotIdentity(
  story: ReadonlyArray<{
    id: string;
    at: number | string;
    imageUrl?: string;
    faceMatch?: { imageUrl: string; similarity: number };
  }>,
  castName?: string | null
): (shot: { key: string }) => IdentityMark | null {
  const byKey = new Map<string, number>();
  for (const beat of story) {
    const match = beat.faceMatch;
    if (match && match.imageUrl === beat.imageUrl?.trim()) {
      byKey.set(`${beat.id}@${beat.at}`, match.similarity);
    }
  }
  return shot => identityMark(byKey.get(shot.key), STORY_IDENTITY_BARS, castName);
}
