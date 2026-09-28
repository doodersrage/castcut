/**
 * Face match: does a finished still show the same person as the Cast plate?
 *
 * Measured with face-recognition embeddings (InsightFace via cubiq's ComfyUI_FaceAnalysis,
 * `FaceEmbedDistance`, cosine metric) instead of asking a vision LLM. Pure — the ComfyUI run
 * lives in `face-match-server.ts` behind `/api/face-match`.
 */

export type FaceMatchResult =
  | {
      available: true;
      /** 1 − cosine distance: ~1 same image, ≳0.5 same person, ≲0.3 a different person. */
      similarity: number;
      distance: number;
      metric: string;
    }
  | { available: false; reason: string };

/**
 * Below this the still is treated as a different person (reroll while budget remains).
 * InsightFace ArcFace cosine similarity for the same identity usually sits well above 0.4;
 * unrelated faces cluster near 0–0.2. Uncalibrated for generated stills — see Film loop stats.
 */
export const DEFAULT_MIN_FACE_MATCH = 0.3;

/** Below this (but above the reroll bar) the still passes with a "face may drift" warning. */
export const FACE_MATCH_WARN_BELOW = 0.45;

/**
 * Plate-backed stills (Day slots, Fitting try-ons), calibrated live on Rapid AIO Day
 * (2026-09-27, similarity to the Cast plate): 22 visibly drifted stills vs 42 good ones.
 * Rerolling below 0.4 catches 86% of drift and rerolls ~21% of good stills (mostly
 * full-body walks where the face is tiny); the old 0.3 bar let 41% of drift through.
 * Film clips keep {@link DEFAULT_MIN_FACE_MATCH} — video frames are not calibrated.
 */
export const STILL_MIN_FACE_MATCH = 0.4;
export const STILL_FACE_MATCH_WARN_BELOW = 0.55;

/**
 * Story stills are staged expressively (hard golden backlight, open grins, tilted heads) and
 * InsightFace scores all of that as distance: 78 right-woman Story renders (2026-09-27) sat at
 * similarity 0.12–0.43 (median 0.26), so the 0.3 bar marked 68% of them as "not the Cast".
 * These bars flag ~5% (miss) and ~15% (warn) of those — a real wrong face still falls below.
 */
export const STORY_MIN_FACE_MATCH = 0.15;
export const STORY_FACE_MATCH_WARN_BELOW = 0.2;

/** Parse the distance PreviewAny shows (`"0.412"`, `0.412`, `"[0.412]"`, JSON list). */
export function parseFaceDistance(raw: unknown): number | null {
  const pick = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.length ? pick(value[0]) : null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      try {
        return pick(JSON.parse(trimmed));
      } catch {
        const found = trimmed.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
        const n = found ? Number.parseFloat(found[0]) : Number.NaN;
        return Number.isFinite(n) ? n : null;
      }
    }
    return null;
  };
  return pick(raw);
}

/**
 * FaceEmbedDistance reports this distance (as a success) when it finds no face in the still —
 * a missing face in the reference raises instead. Not a similarity: nothing to judge.
 */
export const FACE_EMBED_NO_FACE_DISTANCE = 100;

export function isNoFaceDistance(distance: number): boolean {
  return distance >= FACE_EMBED_NO_FACE_DISTANCE;
}

/** Similarity from a FaceEmbedDistance value for the metric that produced it. */
export function faceSimilarityFromDistance(distance: number, metric: string): number {
  if (metric === 'cosine') {
    return Math.max(0, Math.min(1, 1 - distance));
  }
  // L2 on normalized embeddings: d² = 2 − 2·cos → cos = 1 − d²/2.
  if (metric === 'L2_norm' || metric === 'euclidean') {
    return Math.max(0, Math.min(1, 1 - (distance * distance) / 2));
  }
  return Math.max(0, Math.min(1, 1 - distance));
}

export function describeFaceMatch(similarity: number): string {
  return `face match ${Math.round(similarity * 100)}%`;
}
