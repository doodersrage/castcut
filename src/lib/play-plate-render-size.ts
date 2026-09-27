import { isQwenLightningModel } from './model-sampling-patch';
import { snapLatentSize } from './browser-image-dimensions';

/**
 * Play fits the Cast plate into the still (ResizeAndPad → EmptyLatent). The
 * pixels the edit model actually sees are that canvas, not the source file.
 * Official Qwen medium is 1328 on the long edge; step plate-backed Play stills
 * up so identity has more pixels. Lightning stays on its native ladder —
 * off-ladder sizes mosaic CFG-1.
 */
export const PLAY_CAST_PLATE_MIN_LONG_EDGE = 1536;

export function enlargePlayCastPlateLatent(
  size: { width: number; height: number },
  model?: string | null
): { width: number; height: number } | null {
  if (isQwenLightningModel(model ?? undefined)) {
    return null;
  }
  const width = Math.round(size.width);
  const height = Math.round(size.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const longEdge = Math.max(width, height);
  if (longEdge >= PLAY_CAST_PLATE_MIN_LONG_EDGE) {
    return null;
  }
  const scale = PLAY_CAST_PLATE_MIN_LONG_EDGE / longEdge;
  const snap = (value: number) => Math.max(64, Math.round((value * scale) / 8) * 8);
  return { width: snap(width), height: snap(height) };
}

/** Plate-shaped Play latents keep the plate's own size inside this long-edge band. */
export const PLAY_CAST_PLATE_FIT_MIN_LONG_EDGE = 1328;
export const PLAY_CAST_PLATE_FIT_MAX_LONG_EDGE = 1536;

/**
 * Latent for a Play still whose Image 1 is the Cast plate: the plate's aspect
 * and roughly its own size, never the sidebar orientation. A square latent pads
 * a tall plate with white bars and the face drifts; stepping a portrait plate up
 * to a 1536 long edge also scored worse live (1104×1472 plate: 0.46 face distance
 * at native size vs 0.56 at 1152×1536). Lightning snaps to its ladder instead.
 */
export function fitPlayCastPlateLatent(
  plate: { width: number; height: number },
  model?: string | null
): { width: number; height: number } | null {
  if (isQwenLightningModel(model ?? undefined)) {
    return null;
  }
  const { width, height } = plate;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const longEdge = Math.max(width, height);
  const target = Math.min(
    PLAY_CAST_PLATE_FIT_MAX_LONG_EDGE,
    Math.max(PLAY_CAST_PLATE_FIT_MIN_LONG_EDGE, longEdge)
  );
  const scale = target / longEdge;
  return snapLatentSize(width * scale, height * scale);
}
