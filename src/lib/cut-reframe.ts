/**
 * Cut's face-following reframe: a vertical (or square) cut crops each wide shot. Centred, a face
 * off to one side is cut in half; here the crop window follows the face instead — sampled every
 * ~1.5 s through a clip, smoothed, and moved by a piecewise-linear ffmpeg crop expression. Pure:
 * the face finding is in video-server-encode.ts.
 */

/** One look at the shot: `t` seconds into what plays, the face centre (0–1 of the width) or null. */
export type ReframeSample = { t: number; cx: number | null };

/** The crop window's left edge over time, 0–1 of the source width. */
export type ReframePoint = { t: number; x: number };

/** Below this much travel (of the width) the crop holds still at its mean. */
const HOLD_BELOW = 0.04;

/** How wide the crop window is, 0–1 of the source width (1 = no crop needed). */
export function cropWidthFraction(
  source: { width: number; height: number },
  output: { width: number; height: number }
): number {
  const sourceAspect = source.width / Math.max(1, source.height);
  const outputAspect = output.width / Math.max(1, output.height);
  return Math.min(1, outputAspect / sourceAspect);
}

/**
 * The crop path for a shot: the window's left edge at each sample, centred on the face and kept
 * inside the picture; samples without a face take the nearest found one; smoothed over its
 * neighbours; held still when it would barely move. Null when no face was found at all (the
 * centre crop stays) or the shot needs no crop.
 */
export function reframePath(
  samples: ReadonlyArray<ReframeSample>,
  cropWidth: number
): ReframePoint[] | null {
  if (cropWidth >= 0.999) return null;
  const found = samples.filter((s): s is { t: number; cx: number } => s.cx !== null);
  if (found.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const filled = sorted.map(sample => {
    if (sample.cx !== null) return { t: sample.t, cx: sample.cx };
    const nearest = found.reduce((best, next) =>
      Math.abs(next.t - sample.t) < Math.abs(best.t - sample.t) ? next : best
    );
    return { t: sample.t, cx: nearest.cx };
  });
  const maxLeft = 1 - cropWidth;
  const left = filled.map(s => Math.min(maxLeft, Math.max(0, s.cx - cropWidth / 2)));
  const smoothed = left.map((_, i) => {
    const window = left.slice(Math.max(0, i - 1), i + 2);
    return window.reduce((sum, v) => sum + v, 0) / window.length;
  });
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const lo = Math.min(...smoothed);
  const hi = Math.max(...smoothed);
  if (hi - lo < HOLD_BELOW) {
    const mean = smoothed.reduce((sum, v) => sum + v, 0) / smoothed.length;
    return [{ t: 0, x: round(mean) }];
  }
  return filled.map((s, i) => ({ t: round(s.t), x: round(smoothed[i]!) }));
}

/**
 * The ffmpeg crop `x` for a path (pixels, from `iw`): constant for one point, else linear between
 * points and held before the first / after the last (single-quoted in the graph, so commas are fine).
 */
export function reframeCropX(path: ReadonlyArray<ReframePoint>): string {
  const n = (v: number) => Number(v.toFixed(4)).toString();
  if (path.length === 1) return `iw*${n(path[0]!.x)}`;
  let expr = n(path[path.length - 1]!.x);
  for (let i = path.length - 2; i >= 0; i -= 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const span = Math.max(0.001, b.t - a.t);
    const lerp = `${n(a.x)}+(${n(b.x - a.x)})*(t-${n(a.t)})/${n(span)}`;
    expr = `if(lt(t,${n(b.t)}),${i === 0 ? `if(lt(t,${n(a.t)}),${n(a.x)},${lerp})` : lerp},${expr})`;
  }
  return `iw*(${expr})`;
}

/** The scale + crop that replaces the centre crop for a reframed shot. */
export function reframeScaleFilter(
  path: ReadonlyArray<ReframePoint>,
  output: { width: number; height: number }
): string {
  return (
    `scale=-2:${output.height},crop=${output.width}:${output.height}:'min(iw-ow,max(0,${reframeCropX(path)}))':0,` +
    'setsar=1,fps=30,format=yuv420p'
  );
}

/** When to look at a clip: every ~1.5 s through what plays (at most 8 looks). */
export function reframeSampleTimes(playSec: number): number[] {
  if (!(playSec > 0)) return [0];
  const count = Math.min(8, Math.max(2, Math.round(playSec / 1.5) + 1));
  return Array.from(
    { length: count },
    (_, i) => Math.round(((playSec * i) / (count - 1)) * 1000) / 1000
  ).map((t, i, all) => (i === all.length - 1 ? Math.max(0, t - 0.05) : t));
}

/** The crop window's left edge at `t` on a path (as the render's crop expression moves it). */
export function reframeXAt(path: ReadonlyArray<ReframePoint>, t: number): number {
  if (path.length === 0) return 0.5;
  if (t <= path[0]!.t) return path[0]!.x;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    if (t < b.t) return a.x + ((b.x - a.x) * (t - a.t)) / Math.max(0.001, b.t - a.t);
  }
  return path[path.length - 1]!.x;
}
