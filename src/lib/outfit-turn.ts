/**
 * Turn her around (Outfit / Wardrobe): the runway clip (runwayClipPrompt — front, side, back, side,
 * front, then standing) played as a drag-to-rotate viewer. Every angle is a real frame of the
 * clip, so the face, fabric and shoes stay hers. Live LTX clips turn in the first ~2.5 s of 5 s
 * and then stand still, so the viewer keeps only the frames of one turn and loops them.
 */

/** Small greyscale signature of a frame (the middle half of the width, where she stands). */
export const TURN_SIGNATURE_W = 32;
export const TURN_SIGNATURE_H = 48;

/** Mean absolute difference of two signatures (0–255). */
export function signatureDiff(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) sum += Math.abs(a[i]! - b[i]!);
  return n ? sum / n : 0;
}

/**
 * The frames of the turn: [0, end) with `end` just after the last frame she is still clearly
 * moving (frame-to-frame motion above 40% of the clip's peak, smoothed over 5 frames) — LTX
 * turns in ~2.5 s and then stands, H3 turns over the whole clip. Whole-frame likeness to the
 * first frame does not work: the background and camera drift more than she changes.
 * `full` when the turn's last frame looks like its first (the viewer wraps; else it stops at the
 * ends). `turns` false when nothing moves.
 */
export function turnLoop(signatures: Uint8Array[]): { end: number; full: boolean; turns: boolean } {
  const n = signatures.length;
  if (n < 8) return { end: n, full: false, turns: false };
  const motion = signatures
    .slice(1)
    .map((signature, i) => signatureDiff(signatures[i]!, signature));
  const smooth = motion.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(motion.length - 1, i + 2); j += 1) {
      sum += motion[j]!;
      count += 1;
    }
    return sum / count;
  });
  const peak = Math.max(...smooth);
  if (peak < 1.5) return { end: n, full: false, turns: false };
  let last = smooth.length - 1;
  while (last > 0 && smooth[last]! < peak * 0.4) last -= 1;
  const end = Math.min(n, Math.max(last + 2, 8));
  const first = signatures[0]!;
  let far = 0;
  for (let i = 1; i < end; i += 1) far = Math.max(far, signatureDiff(first, signatures[i]!));
  const full = signatureDiff(first, signatures[end - 1]!) <= far * 0.5;
  return { end, full, turns: true };
}

/** The frame shown after dragging `dx` pixels from `start` (wraps on a full turn). */
export function turnFrameAfterDrag(input: {
  start: number;
  dx: number;
  count: number;
  full: boolean;
  /** Pixels for one full turn (the viewer's width, so a full drag across is one turn). */
  pixelsPerTurn: number;
}): number {
  const { start, dx, count, full, pixelsPerTurn } = input;
  if (count <= 1) return 0;
  const step = Math.round((dx / Math.max(pixelsPerTurn, 1)) * count);
  const next = start + step;
  if (full) return ((next % count) + count) % count;
  return Math.min(Math.max(next, 0), count - 1);
}
