/**
 * A shot's lighting, and the film's style, as prompt lines (Part 18 R3). Both are opt-in: with
 * neither picked, a still's prompt is exactly as before.
 *
 * - **Lighting** (per shot — a Day slot, a Scene): a named setup, said as a `LIGHT:` line. It
 *   replaces Day's own time-of-day light line (dayTimeOfDayLightLine), so the two never argue.
 * - **Film style** (per Cast — everything their films render): a short look — a stock, a palette,
 *   a lens feel — said as a `STYLE:` line at the end, after the locks that keep her and the
 *   clothes, so it colours the picture without moving them.
 *
 * Pure.
 */

export type ShotLighting =
  | 'window'
  | 'golden'
  | 'overcast'
  | 'noon'
  | 'blue-hour'
  | 'night-practical'
  | 'neon'
  | 'candle'
  | 'backlit'
  | 'low-key';

export const SHOT_LIGHTINGS: ReadonlyArray<{ id: ShotLighting; label: string; line: string }> = [
  {
    id: 'window',
    label: 'Soft window light',
    line: 'soft daylight from a window to one side, gentle shadows falling across her and the room',
  },
  {
    id: 'golden',
    label: 'Golden hour',
    line: 'low warm sun from the side, a warm rim on her hair and shoulders, long soft shadows',
  },
  {
    id: 'overcast',
    label: 'Overcast',
    line: 'flat soft light from an overcast sky, no hard shadows, muted colours',
  },
  {
    id: 'noon',
    label: 'Hard noon sun',
    line: 'bright sun overhead, crisp short shadows under her and everything around her',
  },
  {
    id: 'blue-hour',
    label: 'Blue hour',
    line: 'the cool blue light just after sunset, the first lamps and windows glowing warm',
  },
  {
    id: 'night-practical',
    label: 'Night, the place’s own lights',
    line: 'night — lit only by the place’s own lamps and signs, pools of warm and cool light, deep shadows',
  },
  {
    id: 'neon',
    label: 'Neon',
    line: 'coloured neon light — magenta and cyan — glowing on her skin and the wet surfaces around her',
  },
  {
    id: 'candle',
    label: 'Candlelight',
    line: 'warm flickering candlelight close to her, the room falling away into dark',
  },
  {
    id: 'backlit',
    label: 'Backlit',
    line: 'strong light behind her — a bright halo on her hair and outline, her face in soft fill',
  },
  {
    id: 'low-key',
    label: 'Low-key, dramatic',
    line: 'one hard light from the side, the other half of her face in deep shadow, dark around her',
  },
];

export function normalizeShotLighting(value: unknown): ShotLighting | undefined {
  return SHOT_LIGHTINGS.some(entry => entry.id === value) ? (value as ShotLighting) : undefined;
}

export function shotLightingLine(value: unknown): string {
  const entry = SHOT_LIGHTINGS.find(item => item.id === value);
  return entry
    ? `LIGHT: ${entry.line}. She is lit by that light, like the place around her, not by a studio light.`
    : '';
}

export {
  FILM_STYLES,
  filmStyleLine,
  normalizeFilmStyle,
  type FilmStyle,
} from '../character/film-style';
import { filmStyleLine } from '../character/film-style';

/**
 * A still's prompt with its picked lighting and the film's style: a picked light replaces any
 * `LIGHT:` line (Day's own time-of-day light) where it stood — or goes after the `SCENE:` line,
 * or first; the style goes last. Unpicked: the prompt as it was.
 */
export function withShotLook(
  prompt: string,
  look: { lighting?: unknown; style?: unknown }
): string {
  let out = prompt;
  const light = shotLightingLine(look.lighting);
  if (light) {
    const lines = out.split('\n');
    const first = lines.findIndex(line => line.startsWith('LIGHT:'));
    const scene = lines.findIndex(line => line.startsWith('SCENE:'));
    const kept = lines.filter(line => !line.startsWith('LIGHT:'));
    // Where Day's own light line stood, else after the SCENE line, else first.
    const at = first >= 0 ? first : scene >= 0 ? scene + 1 : 0;
    kept.splice(Math.min(at, kept.length), 0, light);
    out = kept.join('\n');
  }
  const style = filmStyleLine(look.style);
  if (style && !out.includes(style)) out = `${out.replace(/\s+$/, '')}\n${style}`;
  return out;
}
