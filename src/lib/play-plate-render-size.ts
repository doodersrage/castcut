import { isQwenLightningModel } from './model-sampling-patch';

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
