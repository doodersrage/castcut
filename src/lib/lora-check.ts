/**
 * "Check on Cast": does a LoRA change the Cast's face? Replays real Day stills of the active
 * Cast with the LoRA at 0 / 0.4 / 0.7 / 1.0 (same seed, the still's own stack otherwise) and
 * face-scores each render against the Cast plate (InsightFace, face-match.ts). The drop from
 * the no-LoRA render is the LoRA's own effect on identity. Pure — the ComfyUI side lives in
 * lora-check-server.ts behind /api/comfyui/lora-check.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { loraFamilyForModel, type LoraFamily } from './lora-family-detect';
import { chainLoraStackInWorkflow, readLoraStackFromWorkflow } from './lora-stack';

export const LORA_CHECK_STRENGTHS = [0.4, 0.7, 1] as const;
/** Stills replayed per check (each at 0 + every strength). */
export const LORA_CHECK_STILL_COUNT = 2;
/** Similarity drop (vs the same still without the LoRA) still counted as keeping the face. */
export const LORA_FACE_SAFE_DROP = 0.05;
/** Drop at which the LoRA is flagged as changing faces and skipped on Cast-locked queues. */
export const LORA_FACE_CHANGE_DROP = 0.08;
/** SaveImage prefix for check renders. */
export const LORA_CHECK_PREFIX = 'lora-check';

export type LoraFaceCheckPoint = {
  strength: number;
  /** Mean face similarity to the Cast plate. */
  similarity: number;
  /** Mean paired drop from the same still rendered without the LoRA. */
  drop: number;
  /**
   * Drop on the least-affected still. A LoRA re-composes the whole shot, so one still can lose
   * the face to framing or props (sunglasses, a turned head); only a drop on every still is the
   * LoRA changing who she is.
   */
  minDrop: number;
};

export type LoraFaceCheck = {
  checkedAt: number;
  model?: string;
  stills: number;
  /** Mean similarity without the LoRA. */
  baseline: number;
  points: LoraFaceCheckPoint[];
  /** Strongest tested strength that keeps the face; null when none does. */
  recommendedStrength: number | null;
};

export type LoraCheckSample = {
  stillKey: string;
  strength: number;
  /** Null when no face was found in the render. */
  similarity: number | null;
};

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Paired summary of check renders; null when no still has both a baseline and a LoRA render. */
export function summarizeLoraCheck(
  samples: LoraCheckSample[],
  meta?: { model?: string; checkedAt?: number }
): LoraFaceCheck | null {
  const baselines = new Map<string, number>();
  for (const sample of samples) {
    if (sample.strength === 0 && sample.similarity !== null) {
      baselines.set(sample.stillKey, sample.similarity);
    }
  }
  const strengths = [...new Set(samples.map(sample => sample.strength))]
    .filter(strength => strength > 0)
    .sort((a, b) => a - b);
  const points: LoraFaceCheckPoint[] = [];
  for (const strength of strengths) {
    const paired = samples.filter(
      sample =>
        sample.strength === strength && sample.similarity !== null && baselines.has(sample.stillKey)
    );
    if (paired.length === 0) continue;
    const drops = paired.map(sample => baselines.get(sample.stillKey)! - sample.similarity!);
    points.push({
      strength,
      similarity: round3(mean(paired.map(sample => sample.similarity!))),
      drop: round3(mean(drops)),
      minDrop: round3(Math.min(...drops)),
    });
  }
  if (points.length === 0) return null;
  const safe = points.filter(
    point => point.drop <= LORA_FACE_SAFE_DROP || point.minDrop < LORA_FACE_SAFE_DROP
  );
  return {
    checkedAt: meta?.checkedAt ?? Date.now(),
    ...(meta?.model ? { model: meta.model } : {}),
    stills: baselines.size,
    baseline: round3(mean([...baselines.values()])),
    points,
    recommendedStrength: safe.length > 0 ? safe[safe.length - 1]!.strength : null,
  };
}

/** Check point at the tested strength nearest `strength`. */
export function loraFacePointAt(
  check: LoraFaceCheck | undefined,
  strength: number
): LoraFaceCheckPoint | null {
  if (!check?.points?.length) return null;
  return [...check.points].sort(
    (a, b) => Math.abs(a.strength - strength) - Math.abs(b.strength - strength)
  )[0]!;
}

/** A point where the face dropped a lot on average and clearly on every still. */
export function isFaceChangingPoint(point: LoraFaceCheckPoint): boolean {
  return point.drop >= LORA_FACE_CHANGE_DROP && point.minDrop >= LORA_FACE_SAFE_DROP;
}

/** True when the check says this LoRA, at `strength`, pulls the Cast's face away. */
export function loraChangesFaceAt(check: LoraFaceCheck | undefined, strength: number): boolean {
  const point = loraFacePointAt(check, strength);
  return point !== null && isFaceChangingPoint(point);
}

/**
 * The still's graph with `filename` at `strength` (0 removes it); every other LoRA the still
 * was made with keeps its strength. Save nodes get the check prefix.
 */
export function graphWithLoraAt(
  graph: Record<string, unknown>,
  filename: string,
  strength: number
): Record<string, unknown> {
  const name = filename.trim();
  const others = readLoraStackFromWorkflow(graph).filter(entry => entry.filename !== name);
  const stack =
    strength > 0
      ? [
          ...others,
          {
            id: name,
            label: name,
            filename: name,
            strengthModel: strength,
            strengthClip: strength,
          },
        ]
      : others;
  const next = chainLoraStackInWorkflow(graph, stack).workflow as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;
  for (const node of Object.values(next)) {
    if (node?.class_type === 'SaveImage' && node.inputs) {
      node.inputs.filename_prefix = LORA_CHECK_PREFIX;
    }
  }
  return next;
}

/** ComfyUI view URL (app proxy) of a gallery entry's first image. */
export function galleryStillViewUrl(entry: ComfyGalleryEntry): string | null {
  const image = entry.images?.[0];
  if (!image?.filename || (image.format && !image.format.startsWith('image/'))) return null;
  if (!/\.(png|jpe?g|webp)$/i.test(image.filename)) return null;
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? '',
    type: image.type || 'output',
  });
  return `/api/comfyui/view?${params.toString()}`;
}

/**
 * Finished stills of `characterId` made on a `family` model — first-generation renders
 * only (no upscales / refines): best face-check scores first, then the newest.
 */
export function pickLoraCheckStills(
  gallery: ComfyGalleryEntry[],
  input: { family: LoraFamily; characterId: string; limit?: number }
): ComfyGalleryEntry[] {
  const limit = input.limit ?? LORA_CHECK_STILL_COUNT;
  const candidates = gallery
    .filter(
      entry =>
        entry.status === 'completed' &&
        entry.characterId === input.characterId &&
        !entry.derivedKind &&
        (entry.engineId ?? 'comfyui') === 'comfyui' &&
        loraFamilyForModel(entry.model) === input.family &&
        galleryStillViewUrl(entry) !== null
    )
    .sort((a, b) => (b.completedAt ?? b.queuedAt) - (a.completedAt ?? a.queuedAt));
  const faceOk = candidates.filter(
    entry => typeof entry.playChecks?.face === 'number' && entry.playChecks.faceMiss !== true
  );
  // A clear, well-matched face measures change best (small or turned faces score noisily).
  faceOk.sort((a, b) => (b.playChecks?.face ?? 0) - (a.playChecks?.face ?? 0));
  const rest = candidates.filter(entry => !faceOk.includes(entry));
  return [...faceOk, ...rest].slice(0, limit);
}
