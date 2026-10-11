/**
 * Film output size presets shared by the server ffmpeg encode and the browser fallback.
 * Client-safe (no Node imports). Vertical presets fill a 9:16 canvas for Shorts / Reels / Stories;
 * square ones a 1:1 canvas for feed posts.
 */

export const FILM_RESOLUTION_PRESETS = [
  '720p',
  '1080p',
  '720p-vertical',
  '1080p-vertical',
  '720p-square',
  '1080p-square',
] as const;

export type FilmResolutionPreset = (typeof FILM_RESOLUTION_PRESETS)[number];

export const FILM_PRESET_SIZE: Record<FilmResolutionPreset, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '720p-vertical': { width: 720, height: 1280 },
  '1080p-vertical': { width: 1080, height: 1920 },
  '720p-square': { width: 720, height: 720 },
  '1080p-square': { width: 1080, height: 1080 },
};

/** The film's frame shape in the Cut options. */
export type FilmShape = 'wide' | 'vertical' | 'square';
export const FILM_SHAPES: ReadonlyArray<{ id: FilmShape; label: string; hint: string }> = [
  { id: 'wide', label: 'Widescreen 16:9', hint: 'TV, laptop, YouTube' },
  { id: 'vertical', label: 'Vertical 9:16', hint: 'Shorts, Reels, Stories' },
  { id: 'square', label: 'Square 1:1', hint: 'Feed posts' },
];

export function normalizeFilmShape(value: unknown): FilmShape {
  return value === 'vertical' || value === 'square' ? value : 'wide';
}

export function isVerticalFilmResolution(preset: FilmResolutionPreset): boolean {
  return preset.endsWith('-vertical');
}

/**
 * The canvas is the preset's own size (vertical / square), not the shots' — the browser encode
 * sizes a landscape cut from the first shot instead.
 */
export function isFixedCanvasFilmResolution(preset: FilmResolutionPreset): boolean {
  return preset.endsWith('-vertical') || preset.endsWith('-square');
}

/** Accepts preset ids plus friendly aliases ('1080', 'fullhd', '9:16', 'vertical', '1:1'). */
export function normalizeFilmResolution(value: unknown): FilmResolutionPreset {
  const id = String(value ?? '')
    .trim()
    .toLowerCase();
  const vertical = /vertical|9[:x]16|portrait/.test(id);
  const square = /square|1[:x]1(?!\d)/.test(id);
  const full = id.startsWith('1080') || id === 'fullhd';
  if (vertical) {
    return full ? '1080p-vertical' : '720p-vertical';
  }
  if (square) {
    return full ? '1080p-square' : '720p-square';
  }
  return full ? '1080p' : '720p';
}

/**
 * Preset for the Cut options: shape (widescreen / vertical / square) and size. `vertical` is the
 * older toggle, still read when no shape was picked.
 */
export function filmResolutionForCutOptions(options?: {
  vertical?: boolean;
  shape?: FilmShape;
  quality?: '720p' | '1080p';
}): FilmResolutionPreset {
  const quality = options?.quality === '1080p' ? '1080p' : '720p';
  const shape = options?.shape
    ? normalizeFilmShape(options.shape)
    : options?.vertical
      ? 'vertical'
      : 'wide';
  return shape === 'wide' ? quality : `${quality}-${shape}`;
}

/** The shape the Cut options are set to (shape, else the older vertical toggle). */
export function filmShapeOf(options?: { vertical?: boolean; shape?: FilmShape }): FilmShape {
  return options?.shape
    ? normalizeFilmShape(options.shape)
    : options?.vertical
      ? 'vertical'
      : 'wide';
}

/**
 * ffmpeg per-shot scale filter. Landscape presets letterbox (pad) so nothing is cropped; vertical
 * and square presets fill the frame (crop) because a padded still in them is mostly black bars.
 */
export function buildFilmScaleFilter(width: number, height: number): string {
  const common = 'setsar=1,fps=30,format=yuv420p';
  if (height >= width) {
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},${common}`;
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,${common}`;
}
