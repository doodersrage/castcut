/**
 * Outfit try-on review (pure). With Auto-review on, each landed try-on gets a measured face
 * match against the plate (ComfyUI FaceAnalysis) and a vision read of the outfit, face and
 * hands. Try-ons are only scored, never requeued — the player picks Keep with the numbers.
 */

import { DEFAULT_MIN_FACE_MATCH, FACE_MATCH_WARN_BELOW } from '@/lib/face-match';
import { slotReviewFlagLabel, type SlotQualityReport } from '@/lib/play-slot-quality';

export type TryOnReview = {
  /** The image that was reviewed — a requeued try-on gets a fresh review. */
  imageUrl: string;
  /** 'warn' when something is worth a requeue or a Pass; 'ok' otherwise. */
  status: 'ok' | 'warn';
  /** Plate-to-try-on face similarity, 0–1 (absent when FaceAnalysis is off or saw no face). */
  faceMatch?: number;
  /** 1–5 vision score: the visible clothing matches the kit / BYO garment. */
  outfitMatch?: number;
  notes: string[];
};

/** Vision scores at or under this read as a clear miss. */
const TRY_ON_POOR_SCORE = 2;

export function decideTryOnReview(input: {
  imageUrl: string;
  faceMatch?: number | null;
  report?: SlotQualityReport | null;
}): TryOnReview {
  const notes: string[] = [];
  let warn = false;
  const face = input.faceMatch;
  if (typeof face === 'number') {
    const pct = Math.round(face * 100);
    if (face < DEFAULT_MIN_FACE_MATCH) {
      notes.push(`face drifted from the plate (${pct}%)`);
      warn = true;
    } else if (face < FACE_MATCH_WARN_BELOW) {
      notes.push(`weak face match (${pct}%)`);
    }
  }
  const report = input.report;
  if (report) {
    if (report.outfitMatch <= TRY_ON_POOR_SCORE) {
      notes.push(`outfit doesn't match the kit (${report.outfitMatch}/5)`);
      warn = true;
    }
    if (report.faceIntegrity <= TRY_ON_POOR_SCORE) {
      notes.push('face looks distorted');
      warn = true;
    }
    if (report.anatomy <= TRY_ON_POOR_SCORE) {
      notes.push('hands or body look off');
      warn = true;
    }
    // Flags the scores above don't already cover. Skipped: skin (Skin refine's job) and
    // wrong-face — the reviewer sees the try-on alone, so identity is FaceAnalysis's call.
    for (const flag of report.flags) {
      if (
        flag === 'wrong-outfit' ||
        flag === 'face-distorted' ||
        flag === 'plastic-skin' ||
        flag === 'wrong-face'
      ) {
        continue;
      }
      const label = slotReviewFlagLabel(flag);
      if (!notes.includes(label)) {
        notes.push(label);
        warn = true;
      }
    }
  }
  return {
    imageUrl: input.imageUrl,
    status: warn ? 'warn' : 'ok',
    ...(typeof face === 'number' ? { faceMatch: face } : {}),
    ...(report ? { outfitMatch: report.outfitMatch } : {}),
    notes,
  };
}

/** Short score line for a Compare card, e.g. "Face 64% · Outfit 4/5" (null when nothing measured). */
export function tryOnReviewScoreLine(review: TryOnReview | undefined): string | null {
  if (!review) return null;
  const parts = [
    typeof review.faceMatch === 'number' ? `Face ${Math.round(review.faceMatch * 100)}%` : '',
    typeof review.outfitMatch === 'number' ? `Outfit ${review.outfitMatch}/5` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Which reviewed try-on to suggest keeping: the best face match among try-ons with no warning,
 * outfit score breaking ties. Null until at least two are reviewed (nothing to compare).
 */
export function suggestTryOnToKeep(
  reviews: Array<{ promptId: string; review: TryOnReview }>
): string | null {
  if (reviews.length < 2) return null;
  const clean = reviews.filter(entry => entry.review.status === 'ok');
  if (clean.length === 0) return null;
  const score = (review: TryOnReview) => (review.faceMatch ?? 0.5) + (review.outfitMatch ?? 3) / 50;
  return clean.reduce((best, entry) => (score(entry.review) > score(best.review) ? entry : best))
    .promptId;
}
