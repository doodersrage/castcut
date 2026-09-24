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
