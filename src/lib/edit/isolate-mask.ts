/**
 * Pure mask helpers for "Isolate on white" (client-safe; the matting itself runs server-side).
 *
 * A matting model returns a soft foreground mask. It can miss parts of the person — a dark cape
 * or dark jeans read as "background" and turn into white blotches, a white top on a white bed
 * vanishes. These helpers repair the mask from the photo's own colours, and composite the
 * ORIGINAL pixels through it, so isolation can only ever remove background — it never redraws
 * the person.
 */

export type MaskRgb = { r: number; g: number; b: number };

/** At or above this the mask says "solid person". */
const SOLID_ALPHA = 200;
/** Below this the mask says "background". */
const SUBJECT_ALPHA = 128;
/** Sure background — used to sample the backdrop colour. */
const SURE_BACKGROUND_ALPHA = 32;
/** A hole whose pixels are mostly within this distance of the backdrop is a real gap (arm/hip). */
const HOLE_NEAR_BACKDROP = 48;
/** Backdrop counts as plain (studio wall, white sweep) when most samples sit this close to it. */
const PLAIN_BACKDROP_SPREAD = 24;
const PLAIN_BACKDROP_SHARE = 0.8;
/** On a plain backdrop, "background" pixels this far from it that touch the person are the person. */
const FAR_FROM_BACKDROP = 96;
/** How far around a restored patch the model's soft rim is firmed up. */
const RIM_RADIUS = 3;

function colorDistance(rgba: ArrayLike<number>, pixel: number, color: MaskRgb): number {
  const o = pixel * 4;
  const dr = (rgba[o] ?? 0) - color.r;
  const dg = (rgba[o + 1] ?? 0) - color.g;
  const db = (rgba[o + 2] ?? 0) - color.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * The photo already sits on the fill (a plate isolated before, fed back in by Day, Story or a
 * new look): at least three of its four edges are the fill colour (or transparent) — the fourth
 * may be the person cropped by the frame. Matting it again only eats into the person (each pass
 * widened the holes), so callers keep it as it is.
 */
export function imageAlreadyOnFill(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  fill: MaskRgb,
  options: { tolerance?: number; minShare?: number; ring?: number } = {}
): boolean {
  if (width < 8 || height < 8) {
    return false;
  }
  const tolerance = options.tolerance ?? 3;
  const minShare = options.minShare ?? 0.95;
  const ring = Math.max(1, Math.min(options.ring ?? 2, Math.floor(Math.min(width, height) / 4)));
  const isFill = (x: number, y: number) => {
    const o = (y * width + x) * 4;
    return (
      (rgba[o + 3] ?? 255) < 16 ||
      (Math.abs((rgba[o] ?? 0) - fill.r) <= tolerance &&
        Math.abs((rgba[o + 1] ?? 0) - fill.g) <= tolerance &&
        Math.abs((rgba[o + 2] ?? 0) - fill.b) <= tolerance)
    );
  };
  const sideShare = (side: 'top' | 'bottom' | 'left' | 'right') => {
    let total = 0;
    let onFill = 0;
    for (let d = 0; d < ring; d++) {
      const along = side === 'top' || side === 'bottom' ? width : height;
      for (let t = 0; t < along; t++) {
        const x = side === 'left' ? d : side === 'right' ? width - 1 - d : t;
        const y = side === 'top' ? d : side === 'bottom' ? height - 1 - d : t;
        total += 1;
        if (isFill(x, y)) onFill += 1;
      }
    }
    return onFill / total;
  };
  const sides = (['top', 'bottom', 'left', 'right'] as const).filter(
    side => sideShare(side) >= minShare
  );
  return sides.length >= 3;
}

/** 4-connected components of `member` pixels; returns labels (0 = not a member) and count. */
function labelComponents(
  member: Uint8Array,
  width: number,
  height: number
): { labels: Int32Array; count: number } {
  const labels = new Int32Array(width * height);
  const queue = new Int32Array(width * height);
  let count = 0;
  for (let start = 0; start < member.length; start++) {
    if (!member[start] || labels[start]) {
      continue;
    }
    count += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = count;
    while (head < tail) {
      const p = queue[head++]!;
      const x = p % width;
      const neighbours = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        p >= width ? p - width : -1,
        p < width * (height - 1) ? p + width : -1,
      ];
      for (const n of neighbours) {
        if (n >= 0 && member[n] && !labels[n]) {
          labels[n] = count;
          queue[tail++] = n;
        }
      }
    }
  }
  return { labels, count };
}

function borderLabels(labels: Int32Array, width: number, height: number): Set<number> {
  const found = new Set<number>();
  const add = (p: number) => {
    const label = labels[p] ?? 0;
    if (label) found.add(label);
  };
  for (let x = 0; x < width; x++) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    add(y * width);
    add(y * width + width - 1);
  }
  return found;
}

export type MaskRepair = {
  alpha: Uint8Array;
  /** Pixels restored inside the person (enclosed holes that were not the backdrop's colour). */
  filledHolePixels: number;
  /** Pixels restored at the person's edge on a plain backdrop (colour far from the backdrop). */
  regrownPixels: number;
  backdrop: MaskRgb | null;
  plainBackdrop: boolean;
};

/**
 * Repair a matte from the photo's colours:
 * 1. a "background" hole fully enclosed by the person whose colour is NOT the backdrop's (a dark
 *    cape patch) becomes person again; a hole that IS the backdrop (gap between arm and hip) stays;
 * 2. on a plain backdrop (studio wall, white sweep), "background" pixels clearly unlike the
 *    backdrop that touch the person (dark jeans near the floor, skin on a white sheet) become
 *    person again. Only for a weak matte (`regrowEdges`): after a good one (BiRefNet) it would
 *    only pull in the contact shadow under the shoes.
 */
export function repairSubjectMask(
  alphaIn: ArrayLike<number>,
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  options: { regrowEdges?: boolean } = {}
): MaskRepair {
  const regrowEdges = options.regrowEdges !== false;
  const pixels = width * height;
  const alpha = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    // Nearly-solid is solid: MODNet leaves skin at ~0.9 alpha, which faded the person toward white.
    const value = alphaIn[i] ?? 0;
    alpha[i] = value >= SOLID_ALPHA ? 255 : value;
  }
  if (pixels < 16) {
    return { alpha, filledHolePixels: 0, regrownPixels: 0, backdrop: null, plainBackdrop: false };
  }

  const background = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    background[i] = alpha[i]! < SUBJECT_ALPHA ? 1 : 0;
  }
  const { labels, count } = labelComponents(background, width, height);
  const outsideLabels = borderLabels(labels, width, height);

  // Backdrop colour: per-channel median of sure-background pixels connected to the frame edge
  // (a median, so dropped legs running to the frame edge do not drag it toward their colour).
  const histograms = [new Int32Array(256), new Int32Array(256), new Int32Array(256)] as const;
  let samples = 0;
  for (let i = 0; i < pixels; i++) {
    if (alpha[i]! < SURE_BACKGROUND_ALPHA && outsideLabels.has(labels[i]!)) {
      for (let c = 0; c < 3; c++) {
        histograms[c][Math.max(0, Math.min(255, Math.round(rgba[i * 4 + c] ?? 0)))]! += 1;
      }
      samples += 1;
    }
  }
  if (samples === 0) {
    return { alpha, filledHolePixels: 0, regrownPixels: 0, backdrop: null, plainBackdrop: false };
  }
  const median = (histogram: Int32Array) => {
    let seen = 0;
    for (let value = 0; value < 256; value++) {
      seen += histogram[value]!;
      if (seen * 2 >= samples) return value;
    }
    return 255;
  };
  const backdrop = { r: median(histograms[0]), g: median(histograms[1]), b: median(histograms[2]) };
  let close = 0;
  for (let i = 0; i < pixels; i++) {
    if (alpha[i]! < SURE_BACKGROUND_ALPHA && outsideLabels.has(labels[i]!)) {
      if (colorDistance(rgba, i, backdrop) < PLAIN_BACKDROP_SPREAD) close += 1;
    }
  }
  const plainBackdrop = close / samples >= PLAIN_BACKDROP_SHARE;

  // 1. Enclosed holes.
  const holeSize = new Int32Array(count + 1);
  const holeNear = new Int32Array(count + 1);
  for (let i = 0; i < pixels; i++) {
    const label = labels[i]!;
    if (!label || outsideLabels.has(label)) continue;
    holeSize[label]! += 1;
    if (colorDistance(rgba, i, backdrop) < HOLE_NEAR_BACKDROP) {
      holeNear[label]! += 1;
    }
  }
  let filledHolePixels = 0;
  for (let i = 0; i < pixels; i++) {
    const label = labels[i]!;
    if (!label || outsideLabels.has(label)) continue;
    if (holeNear[label]! / holeSize[label]! < 0.5) {
      alpha[i] = 255;
      filledHolePixels += 1;
    }
  }

  // 2. Plain backdrop: regrow person-coloured "background" that touches the person.
  let regrownPixels = 0;
  if (plainBackdrop && regrowEdges) {
    const far = new Uint8Array(pixels);
    for (let i = 0; i < pixels; i++) {
      // Soft (half-kept) pixels too: the model's haze over a dark cape is as wrong as a hole.
      far[i] = alpha[i]! < 255 && colorDistance(rgba, i, backdrop) > FAR_FROM_BACKDROP ? 1 : 0;
    }
    const farParts = labelComponents(far, width, height);
    const touches = new Uint8Array(farParts.count + 1);
    for (let i = 0; i < pixels; i++) {
      const label = farParts.labels[i]!;
      if (!label || touches[label]) continue;
      const x = i % width;
      if (
        (x > 0 && alpha[i - 1]! >= SUBJECT_ALPHA && !far[i - 1]) ||
        (x < width - 1 && alpha[i + 1]! >= SUBJECT_ALPHA && !far[i + 1]) ||
        (i >= width && alpha[i - width]! >= SUBJECT_ALPHA && !far[i - width]) ||
        (i < pixels - width && alpha[i + width]! >= SUBJECT_ALPHA && !far[i + width])
      ) {
        touches[label] = 1;
      }
    }
    for (let i = 0; i < pixels; i++) {
      const label = farParts.labels[i]!;
      if (label && touches[label]) {
        alpha[i] = 255;
        regrownPixels += 1;
      }
    }
  }

  // The model's soft edge around a restored patch would leave a faint light outline: firm up
  // nearby pixels that are not the backdrop's colour.
  if (filledHolePixels + regrownPixels > 0) {
    const restored = new Uint8Array(pixels);
    for (let i = 0; i < pixels; i++) {
      restored[i] = alpha[i] === 255 && (alphaIn[i] ?? 0) < SUBJECT_ALPHA ? 1 : 0;
    }
    const near = dilate(restored, width, height, RIM_RADIUS);
    for (let i = 0; i < pixels; i++) {
      if (near[i] && alpha[i]! < 255 && colorDistance(rgba, i, backdrop) >= HOLE_NEAR_BACKDROP) {
        alpha[i] = 255;
      }
    }
  }

  return { alpha, filledHolePixels, regrownPixels, backdrop, plainBackdrop };
}

/** Square dilation by `radius` (separable max filter). */
function dilate(member: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const rows = new Uint8Array(member.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = 0;
      for (let dx = -radius; dx <= radius && !hit; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < width && member[y * width + nx]) hit = 1;
      }
      rows[y * width + x] = hit;
    }
  }
  const out = new Uint8Array(member.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = 0;
      for (let dy = -radius; dy <= radius && !hit; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < height && rows[ny * width + x]) hit = 1;
      }
      out[y * width + x] = hit;
    }
  }
  return out;
}

/**
 * Flatten the ORIGINAL photo through the mask onto the fill. Where the mask is solid the
 * person's pixels are copied unchanged; only the background (and soft edges) take the fill.
 */
export function compositeThroughMask(
  rgba: ArrayLike<number>,
  alpha: ArrayLike<number>,
  fill: MaskRgb
): Uint8ClampedArray {
  const pixels = alpha.length;
  const out = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    // A photo with its own transparency keeps it: both alphas must agree it is the person.
    const a = ((alpha[i] ?? 0) / 255) * ((rgba[o + 3] ?? 255) / 255);
    const inv = 1 - a;
    out[o] = Math.round((rgba[o] ?? 0) * a + fill.r * inv);
    out[o + 1] = Math.round((rgba[o + 1] ?? 0) * a + fill.g * inv);
    out[o + 2] = Math.round((rgba[o + 2] ?? 0) * a + fill.b * inv);
    out[o + 3] = 255;
  }
  return out;
}

/** Share of pixels the mask keeps as the person. */
export function maskSubjectShare(alpha: ArrayLike<number>): number {
  if (alpha.length === 0) return 0;
  let subject = 0;
  for (let i = 0; i < alpha.length; i++) {
    if ((alpha[i] ?? 0) >= SUBJECT_ALPHA) subject += 1;
  }
  return subject / alpha.length;
}
