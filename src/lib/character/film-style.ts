/**
 * A Cast's film style: the look of everything their films render — a ready style (a stock, a
 * palette) and / or words of their own — said as a STYLE line on each still (day/shot-look.ts adds
 * it on Day and Scene, story/cast-lines.ts on Story). Pure.
 */

/** Ready film styles (a Cast's films can also say their own, in words). */
export const FILM_STYLES: ReadonlyArray<{ id: string; label: string; words: string }> = [
  {
    id: 'film-35',
    label: '35 mm film',
    words: 'shot on 35 mm film — fine grain, gentle halation on highlights, soft natural contrast',
  },
  {
    id: 'muted-teal',
    label: 'Muted teal and amber',
    words: 'a muted palette of teal shadows and warm amber skin tones, low saturation',
  },
  {
    id: 'pastel',
    label: 'Soft pastel',
    words: 'soft pastel colours, airy bright exposure, gentle low contrast',
  },
  {
    id: 'moody',
    label: 'Moody, dark',
    words: 'dark moody exposure, deep blacks, rich shadows and a few warm highlights',
  },
  {
    id: 'vivid',
    label: 'Vivid summer',
    words: 'vivid saturated colours, bright sun-washed highlights, clear blue skies where seen',
  },
  {
    id: 'mono',
    label: 'Black and white',
    words: 'black and white photograph, rich greys, fine film grain',
  },
];

const STYLE_MAX = 200;

/** A Cast's film style: a ready style's id, or words of their own (kept short). */
export type FilmStyle = { preset?: string; words?: string };

export function normalizeFilmStyle(value: unknown): FilmStyle | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const preset = FILM_STYLES.some(entry => entry.id === record.preset)
    ? String(record.preset)
    : undefined;
  const words =
    typeof record.words === 'string'
      ? record.words.replace(/\s+/g, ' ').trim().slice(0, STYLE_MAX)
      : '';
  if (!preset && !words) return undefined;
  return { ...(preset ? { preset } : {}), ...(words ? { words } : {}) };
}

/** The style as one line ('' with none). */
export function filmStyleLine(value: unknown): string {
  const style = normalizeFilmStyle(value);
  if (!style) return '';
  const preset = FILM_STYLES.find(entry => entry.id === style.preset)?.words ?? '';
  const words = [preset, style.words].filter(Boolean).join('; ');
  return words
    ? `STYLE: the whole picture looks ${words}. Her face, body and clothes stay exactly as described.`
    : '';
}
