/**
 * Film output size presets shared by the server ffmpeg encode and the browser fallback.
 * Client-safe (no Node imports). Vertical presets fill a 9:16 canvas for Shorts / Reels / Stories.
 */

export const FILM_RESOLUTION_PRESETS = [
  '720p',
  '1080p',
  '720p-vertical',
  '1080p-vertical',
] as const;

export type FilmResolutionPreset = (typeof FILM_RESOLUTION_PRESETS)[number];

export const FILM_PRESET_SIZE: Record<FilmResolutionPreset, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '720p-vertical': { width: 720, height: 1280 },
  '1080p-vertical': { width: 1080, height: 1920 },
};

export function isVerticalFilmResolution(preset: FilmResolutionPreset): boolean {
  return preset.endsWith('-vertical');
}

/** Accepts preset ids plus friendly aliases ('1080', 'fullhd', '9:16', 'vertical'). */
export function normalizeFilmResolution(value: unknown): FilmResolutionPreset {
  const id = String(value ?? '')
    .trim()
    .toLowerCase();
  const vertical = /vertical|9[:x]16|portrait/.test(id);
  const full = id.startsWith('1080') || id === 'fullhd';
  if (vertical) {
    return full ? '1080p-vertical' : '720p-vertical';
  }
  return full ? '1080p' : '720p';
}

/** Preset for the Cut options UI: a vertical toggle on top of the default 720p quality. */
export function filmResolutionForCutOptions(options?: {
  vertical?: boolean;
  quality?: '720p' | '1080p';
}): FilmResolutionPreset {
  const quality = options?.quality ?? '720p';
  return options?.vertical ? `${quality}-vertical` : quality;
}

/**
 * ffmpeg per-shot scale filter. Landscape presets letterbox (pad) so nothing is cropped; vertical
 * presets fill the frame (crop) because a padded 16:9 still in a 9:16 canvas is mostly black bars.
 */
export function buildFilmScaleFilter(width: number, height: number): string {
  const common = 'setsar=1,fps=30,format=yuv420p';
  if (height > width) {
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},${common}`;
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,${common}`;
}
