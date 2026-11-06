/**
 * What changed in the edit since the last cut was rendered (Part 18 R7) — for whoever reviews the
 * next one: shots added, left out, moved, trimmed or re-timed, a new take, colour, the look, the
 * music and the sound, the text. One plain line each. Pure.
 */

import type { FilmCutOptionsValue } from '@/components/FilmCutOptionsControls';

type Edit = NonNullable<NonNullable<FilmCutOptionsValue['shotEdits']>['shots']>[string];

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function cutChangesSince(
  before: FilmCutOptionsValue,
  after: FilmCutOptionsValue,
  titleOf: (key: string) => string = key => key
): string[] {
  const out: string[] = [];
  const shotsBefore = before.shotEdits?.shots ?? {};
  const shotsAfter = after.shotEdits?.shots ?? {};
  const keys = [...new Set([...Object.keys(shotsBefore), ...Object.keys(shotsAfter)])];
  const changed = (field: keyof Edit) =>
    keys.filter(key => !same(shotsBefore[key]?.[field], shotsAfter[key]?.[field]));
  const named = (list: string[]) => (list.length <= 3 ? `: ${list.map(titleOf).join(', ')}` : '');

  const leftOut = keys.filter(
    key => shotsAfter[key]?.include === false && shotsBefore[key]?.include !== false
  );
  const back = keys.filter(
    key => shotsBefore[key]?.include === false && shotsAfter[key]?.include !== false
  );
  if (leftOut.length) out.push(`${plural(leftOut.length, 'shot')} left out${named(leftOut)}`);
  if (back.length) out.push(`${plural(back.length, 'shot')} put back${named(back)}`);
  if (!same(before.shotEdits?.order, after.shotEdits?.order)) out.push('Shots moved');
  const trimmed = [...new Set([...changed('trimStartSec'), ...changed('trimEndSec')])];
  if (trimmed.length) out.push(`${plural(trimmed.length, 'clip')} trimmed${named(trimmed)}`);
  const held = changed('holdSec');
  if (held.length) out.push(`${plural(held.length, 'still')} held longer or shorter${named(held)}`);
  const taken = changed('pin').filter(
    key => shotsAfter[key]?.pin?.url !== shotsBefore[key]?.pin?.url
  );
  if (taken.length) out.push(`${plural(taken.length, 'new take')}${named(taken)}`);
  const timed = [...new Set([...changed('speed'), ...changed('reverse')])];
  if (timed.length) out.push(`Speed changed on ${plural(timed.length, 'clip')}${named(timed)}`);
  const graded = changed('grade');
  if (graded.length) out.push(`Colour changed on ${plural(graded.length, 'shot')}${named(graded)}`);
  const sound = [
    ...new Set([
      ...changed('volume'),
      ...changed('volumeKeys'),
      ...changed('soundLeadSec'),
      ...changed('soundTailSec'),
    ]),
  ];
  if (sound.length)
    out.push(`A clip's sound changed on ${plural(sound.length, 'shot')}${named(sound)}`);
  const texts = [
    ...new Set([
      ...changed('subtitle'),
      ...changed('subtitleCues'),
      ...changed('lowerThird'),
      ...changed('caption'),
    ]),
  ];
  if (texts.length) out.push(`Text changed on ${plural(texts.length, 'shot')}${named(texts)}`);
  const moves = [
    ...new Set([...changed('transition'), ...changed('motion'), ...changed('clipMove')]),
  ];
  if (moves.length) out.push(`Transitions or moves changed on ${plural(moves.length, 'shot')}`);
  const overlays = [...new Set([...changed('pipUrl'), ...changed('pipFull')])];
  if (overlays.length) out.push(`Pictures over ${plural(overlays.length, 'shot')} changed`);

  if (
    !same(before.look, after.look) ||
    !same(before.lookStrength, after.lookStrength) ||
    !same(before.lut, after.lut)
  ) {
    out.push('The film’s look changed');
  }
  if (!same(before.audioBedUrl, after.audioBedUrl)) out.push('The music changed');
  else if (
    !same(before.musicLevel, after.musicLevel) ||
    !same(before.sound?.musicKeys, after.sound?.musicKeys)
  ) {
    out.push('The music’s level changed');
  }
  if (!same(before.sound?.effects, after.sound?.effects)) out.push('Sound effects changed');
  if (!same(before.credits, after.credits) || !same(before.titles, after.titles))
    out.push('Titles or credits changed');
  if (!same(before.shape, after.shape) || !same(before.quality, after.quality))
    out.push('Shape or size changed');
  if (!same(before.markers, after.markers)) out.push('Markers changed');
  return out;
}
