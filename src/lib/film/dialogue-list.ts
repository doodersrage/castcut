/**
 * The film's dialogue list: every line said on screen and every voice-over, shot by shot in film
 * order, with who says it and whether it is a talking clip (its sound recorded) or still to make —
 * the page a dialogue editor works from, and what subtitles and a dub start from. Pure.
 */

import type { FilmPlaylistShot } from '../media/kind';

export type DialogueShot = Pick<
  FilmPlaylistShot,
  'title' | 'kind' | 'spoken' | 'narrationText' | 'narrationUrl' | 'subtitle'
> & { speaker?: string };

export const DIALOGUE_LIST_COLUMNS = ['#', 'Shot', 'Who', 'Says', 'How', 'Sound'] as const;

/** One row per line (a shot with a line and narration gives two). */
export function dialogueListRows(shots: readonly DialogueShot[]): string[][] {
  const rows: string[][] = [];
  shots.forEach((shot, index) => {
    const number = String(index + 1);
    const said = shot.spoken?.trim();
    if (said) {
      rows.push([
        number,
        shot.title,
        shot.speaker ?? '',
        said,
        'On screen',
        shot.kind === 'clip' ? 'Talking clip' : 'Still — animate it to hear it',
      ]);
    }
    const voiceOver = shot.narrationText?.trim();
    if (voiceOver) {
      rows.push([
        number,
        shot.title,
        shot.speaker ? `${shot.speaker} (V.O.)` : 'Voice-over',
        voiceOver,
        'Voice-over',
        shot.narrationUrl ? 'Recorded' : 'Recorded when the film is cut',
      ]);
    }
  });
  return rows;
}
