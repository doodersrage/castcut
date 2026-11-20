/**
 * A still that came back with no scene (pure): its Cast plate on white, or the right people
 * standing in a white void. Adult duo stills on the fast Preview engine did this on 7 of ~22
 * renders in one evening (live 2026-11-20: 13191, 13193, 13194, 13200, 13206, 13216, 13228) —
 * the card showed the plate, and a clip made from one invented two strangers.
 *
 * Measured on pixels, cheaply: the share of near-white, colourless pixels over the whole frame
 * and over its edges (the sides and the top — the floor and bodies fill the bottom). On those
 * renders every failure had white on ≥97% of its edges; the brightest real room (white walls,
 * blinds, a bed) 69%, a white-tiled shower 66%. The page measures on a canvas
 * (still-backdrop-client.ts), the server with sharp (still-backdrop-server.ts).
 */

export type StillBackdropShares = {
  /** Near-white share of the whole frame, 0–1. */
  whole: number;
  /** Near-white share of the frame's left, right and top edges, 0–1. */
  edges: number;
};

export type StillBackdropVerdict = {
  status: 'ok' | 'plate' | 'void';
  /** A few words for the card and the run log (set when not ok). */
  reason?: string;
};

/** At or above this share of white edges, there is no scene behind them. */
export const STILL_VOID_MIN_EDGES = 0.9;
/** …and this much white overall (a lit white wall behind a close-up stays a scene). */
export const STILL_VOID_MIN_WHOLE = 0.45;
/** Mostly white overall too: one standing figure on white — the plate handed back. */
export const STILL_PLATE_COPY_MIN_WHOLE = 0.75;

/** The width × height a still is measured at (aspect kept roughly; the edges are proportional). */
export const STILL_BACKDROP_SAMPLE = { width: 160, height: 90 } as const;

/** A place that is meant to be white: a white studio, a seamless backdrop, snow. */
const WHITE_PLACE_RE =
  /\b(?:white (?:studio|backdrop|void|cyclorama|seamless)|seamless (?:white|backdrop|paper)|photo studio|cyclorama|snow(?:y|field)?|blizzard|whiteout)\b/i;

function nearWhite(r: number, g: number, b: number): boolean {
  const low = Math.min(r, g, b);
  return low > 210 && Math.max(r, g, b) - low < 28;
}

/**
 * The white shares of raw pixels: `channels` 3 (RGB) or 4 (RGBA), row-major. Edges: the outer
 * 15% on the left and right, and the top 12%.
 */
export function stillBackdropShares(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  channels: 3 | 4
): StillBackdropShares {
  let whole = 0;
  let edges = 0;
  let edgeCount = 0;
  const left = width * 0.15;
  const right = width * 0.85;
  const top = height * 0.12;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * channels;
      const white = nearWhite(pixels[at]!, pixels[at + 1]!, pixels[at + 2]!);
      if (white) whole += 1;
      if (x < left || x >= right || y < top) {
        edgeCount += 1;
        if (white) edges += 1;
      }
    }
  }
  const count = width * height;
  return {
    whole: count > 0 ? whole / count : 0,
    edges: edgeCount > 0 ? edges / edgeCount : 0,
  };
}

/** The decision. `place`: the moment's setting — a place meant to be white is never judged. */
export function judgeStillBackdrop(
  shares: StillBackdropShares | null | undefined,
  context?: { place?: string | null }
): StillBackdropVerdict {
  if (!shares || WHITE_PLACE_RE.test(context?.place ?? '')) return { status: 'ok' };
  if (shares.edges < STILL_VOID_MIN_EDGES || shares.whole < STILL_VOID_MIN_WHOLE) {
    return { status: 'ok' };
  }
  return shares.whole >= STILL_PLATE_COPY_MIN_WHOLE
    ? { status: 'plate', reason: 'came back as the Cast plate on white — no scene' }
    : { status: 'void', reason: 'came back on a white backdrop — no scene' };
}
