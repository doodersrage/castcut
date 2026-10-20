/**
 * Cut's film look: a colour grade for the whole cut and an automatic shot match. AI shots drift in
 * light and tone from one to the next — the thing that most reads as "not one film". Both are a
 * 3×4 colour matrix (per output channel: R, G, B weights and an offset, in 0–1 units), so the
 * render (ffmpeg colorchannelmixer + lutrgb) and the live preview (SVG feColorMatrix on the
 * canvas) apply exactly the same numbers.
 */

/** Row-major 3×4: [rR, rG, rB, rOff, gR, gG, gB, gOff, bR, bG, bB, bOff]. */
export type ColourMatrix = readonly number[];

export type FilmLook = 'none' | 'natural' | 'warm' | 'cool' | 'filmic' | 'vivid' | 'faded' | 'mono';

export const FILM_LOOKS: ReadonlyArray<{ id: FilmLook; label: string; hint: string }> = [
  { id: 'none', label: 'As shot', hint: 'No grade' },
  { id: 'natural', label: 'Natural', hint: 'A touch more contrast and colour' },
  { id: 'warm', label: 'Warm', hint: 'Golden, sunlit' },
  { id: 'cool', label: 'Cool', hint: 'Crisp, blue-leaning' },
  { id: 'filmic', label: 'Filmic', hint: 'Cinema contrast, warm skin, cooler shadows' },
  { id: 'vivid', label: 'Vivid', hint: 'Rich colour' },
  { id: 'faded', label: 'Faded', hint: 'Soft, lifted blacks, vintage' },
  { id: 'mono', label: 'Black & white', hint: 'Monochrome' },
];

export const IDENTITY: ColourMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/** Rec. 601 luma weights (what the saturation and mono matrices pivot on). */
const LUMA = [0.299, 0.587, 0.114] as const;

/** Apply `inner` first, then `outer`. */
export function composeMatrices(outer: ColourMatrix, inner: ColourMatrix): number[] {
  const out: number[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) sum += outer[row * 4 + k]! * inner[k * 4 + col]!;
      out.push(sum);
    }
    let offset = outer[row * 4 + 3]!;
    for (let k = 0; k < 3; k += 1) offset += outer[row * 4 + k]! * inner[k * 4 + 3]!;
    out.push(offset);
  }
  return out;
}

function saturation(s: number): number[] {
  const out: number[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) out.push((1 - s) * LUMA[col]! + (row === col ? s : 0));
    out.push(0);
  }
  return out;
}

/** Contrast around mid grey, plus a lift (raised blacks). */
function contrast(c: number, lift = 0): number[] {
  const offset = (1 - c) / 2 + lift;
  return [c, 0, 0, offset, 0, c, 0, offset, 0, 0, c, offset];
}

function gains(r: number, g: number, b: number, offsets: [number, number, number] = [0, 0, 0]) {
  return [r, 0, 0, offsets[0], 0, g, 0, offsets[1], 0, 0, b, offsets[2]];
}

const chain = (...matrices: ColourMatrix[]): number[] =>
  matrices.reduce<number[]>((acc, m) => composeMatrices(m, acc), [...IDENTITY]);

const LOOKS: Record<FilmLook, ColourMatrix> = {
  none: IDENTITY,
  natural: chain(contrast(1.06), saturation(1.06)),
  warm: chain(gains(1.06, 1.0, 0.9, [0.012, 0.004, 0]), saturation(1.04)),
  cool: chain(gains(0.94, 1.0, 1.07, [0, 0.003, 0.012]), saturation(0.98)),
  filmic: chain(contrast(1.12, 0.012), gains(1.04, 1.0, 0.95, [0.004, 0, 0.01]), saturation(0.9)),
  vivid: chain(contrast(1.08), saturation(1.3)),
  faded: chain(contrast(0.84, 0.05), saturation(0.78), gains(1.03, 1.0, 0.95)),
  mono: chain(saturation(0), contrast(1.08)),
};

export function normalizeFilmLook(value: unknown): FilmLook {
  return typeof value === 'string' && value in LOOKS ? (value as FilmLook) : 'none';
}

/** 0–1, default 1 (the look in full). */
export function normalizeLookStrength(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

/** The look's matrix at a strength (0 = as shot). */
export function lookMatrix(look: FilmLook, strength = 1): number[] {
  const full = LOOKS[look] ?? IDENTITY;
  const s = normalizeLookStrength(strength);
  return full.map((value, i) => IDENTITY[i]! + (value - IDENTITY[i]!) * s);
}

/** A picture's colour: per-channel mean and spread, 0–1 (RGB). */
export type ShotColourStats = { mean: [number, number, number]; std: [number, number, number] };

/**
 * Mean and spread of an RGBA pixel buffer, ignoring the outer tenth (letterbox bars, vignettes)
 * and near-black / blown-out pixels that would pull the average.
 */
export function colourStatsFromPixels(
  pixels: ArrayLike<number>,
  width: number,
  height: number
): ShotColourStats | null {
  const sum = [0, 0, 0];
  const sumSq = [0, 0, 0];
  let n = 0;
  const x0 = Math.floor(width * 0.1);
  const x1 = Math.ceil(width * 0.9);
  const y0 = Math.floor(height * 0.1);
  const y1 = Math.ceil(height * 0.9);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * width + x) * 4;
      const r = pixels[i]! / 255;
      const g = pixels[i + 1]! / 255;
      const b = pixels[i + 2]! / 255;
      const luma = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
      if (luma < 0.02 || luma > 0.985) continue;
      sum[0] += r;
      sum[1] += g;
      sum[2] += b;
      sumSq[0] += r * r;
      sumSq[1] += g * g;
      sumSq[2] += b * b;
      n += 1;
    }
  }
  if (n < 16) return null;
  const mean = sum.map(v => v / n) as [number, number, number];
  const std = sumSq.map((v, c) => Math.sqrt(Math.max(0, v / n - mean[c]! ** 2))) as [
    number,
    number,
    number,
  ];
  return { mean, std };
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** The film's own colour: the median shot (robust to the odd night or white-out shot). */
export function filmReferenceStats(
  shots: ReadonlyArray<ShotColourStats | null>
): ShotColourStats | null {
  const known = shots.filter((s): s is ShotColourStats => s !== null);
  if (known.length < 2) return null;
  const pick = (key: 'mean' | 'std', c: number) => median(known.map(s => s[key][c]!));
  return {
    mean: [pick('mean', 0), pick('mean', 1), pick('mean', 2)],
    std: [pick('std', 0), pick('std', 1), pick('std', 2)],
  };
}

/** How far a shot is moved toward the film (0–1): most of the way, never fully flattened. */
export const SHOT_MATCH_STRENGTH = 0.7;
const MAX_GAIN = 1.2;
const MIN_GAIN = 0.85;
const MAX_OFFSET = 0.1;

/**
 * The matrix that moves a shot's colour toward the film's: per channel, its spread scaled toward
 * the reference spread and its mean moved toward the reference mean — clamped, and only part of
 * the way, so a night shot stays a night shot.
 */
export function shotMatchMatrix(
  shot: ShotColourStats | null,
  reference: ShotColourStats | null,
  strength = SHOT_MATCH_STRENGTH
): number[] {
  if (!shot || !reference) return [...IDENTITY];
  const out: number[] = [];
  for (let c = 0; c < 3; c += 1) {
    const rawGain = reference.std[c]! / Math.max(0.01, shot.std[c]!);
    const gain = 1 + (Math.min(MAX_GAIN, Math.max(MIN_GAIN, rawGain)) - 1) * strength;
    // After the gain the mean is gain·m; move it toward the reference by `strength`.
    const target = shot.mean[c]! + (reference.mean[c]! - shot.mean[c]!) * strength;
    const offset = Math.min(MAX_OFFSET, Math.max(-MAX_OFFSET, target - gain * shot.mean[c]!));
    for (let k = 0; k < 3; k += 1) out.push(k === c ? gain : 0);
    out.push(offset);
  }
  return out;
}

/** True when the matrix changes nothing worth a filter. */
export function isIdentityMatrix(matrix: ColourMatrix): boolean {
  return matrix.every((value, i) => Math.abs(value - IDENTITY[i]!) < 0.002);
}

const n = (value: number) => Number(value.toFixed(4)).toString();

/**
 * ffmpeg filters for a matrix (inside a filter_complex chain): the 3×3 part as a
 * colorchannelmixer, the offsets as a lutrgb (values clip to 0–255 on their own). Empty for an
 * identity matrix.
 */
export function colourMatrixFfmpeg(matrix: ColourMatrix): string {
  if (isIdentityMatrix(matrix)) return '';
  const m = matrix;
  const mixer =
    `colorchannelmixer=rr=${n(m[0]!)}:rg=${n(m[1]!)}:rb=${n(m[2]!)}` +
    `:gr=${n(m[4]!)}:gg=${n(m[5]!)}:gb=${n(m[6]!)}` +
    `:br=${n(m[8]!)}:bg=${n(m[9]!)}:bb=${n(m[10]!)}`;
  const offsets = [m[3]!, m[7]!, m[11]!].map(o => Math.round(o * 255 * 100) / 100);
  const lut = offsets.some(o => Math.abs(o) >= 0.5)
    ? `,lutrgb=r=val${offsets[0]! >= 0 ? '+' : ''}${offsets[0]}:g=val${offsets[1]! >= 0 ? '+' : ''}${offsets[1]}:b=val${offsets[2]! >= 0 ? '+' : ''}${offsets[2]}`
    : '';
  return `format=rgb24,${mixer}${lut},format=yuv420p`;
}

/**
 * SVG feColorMatrix `values` (4×5, alpha untouched) for the same matrix — the preview draws each
 * shot through it (the filter needs color-interpolation-filters="sRGB" to match ffmpeg).
 */
export function colourMatrixSvgValues(matrix: ColourMatrix): string {
  const m = matrix;
  return [
    m[0],
    m[1],
    m[2],
    0,
    m[3],
    m[4],
    m[5],
    m[6],
    0,
    m[7],
    m[8],
    m[9],
    m[10],
    0,
    m[11],
    0,
    0,
    0,
    1,
    0,
  ]
    .map(value => n(value!))
    .join(' ');
}

/** Each shot's final matrix: its match toward the film, then the film's look. */
export function shotGradeMatrices(input: {
  stats: ReadonlyArray<ShotColourStats | null>;
  look: FilmLook;
  lookStrength?: number;
  matchShots: boolean;
}): number[][] {
  const look = lookMatrix(input.look, input.lookStrength ?? 1);
  const reference = input.matchShots ? filmReferenceStats(input.stats) : null;
  return input.stats.map(stats =>
    composeMatrices(look, input.matchShots ? shotMatchMatrix(stats, reference) : [...IDENTITY])
  );
}
