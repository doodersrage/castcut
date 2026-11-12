/**
 * A Short's shot list (2026-11-12): every planned shot of its script in script order, one row
 * each — the slate (1A, 1B…), where, how close, who, the line or the action, how many takes and
 * whether one is kept or the last run flagged it. Directors and ADs work from this table; the
 * cards hid which shots had no take or were flagged. Pure — the table renders these rows.
 */

import { SHOT_FRAMING_LABELS, SHOT_PURPOSE_LABELS, cueAsName, shotLabel } from './script-shots';
import type { ShortMoment } from './short-moments';

export type ShortShotStatus = 'kept' | 'to-check' | 'no-take' | 'not-made';

export type ShortShotRow = {
  shotId: string;
  /** The script scene it covers (script/parse.ts id), and its place in the script (1, 2…). */
  sceneKey: string;
  sceneNumber: number;
  /** The slate: the scene's number and the shot's letter ("2C"). */
  label: string;
  /** The script scene's heading ("INT. CRAMPED CORNER - DAY"). */
  heading: string;
  /** Short framing words ("Close-up"), and the full ones for a title. */
  size: string;
  sizeTitle: string;
  purpose: string;
  /** Who is in it, as names ("Slyne, Mr Harris"). */
  who: string;
  /** The line as "Name: text" (V.O. marked), else the action. */
  text: string;
  takes: number;
  status: ShortShotStatus;
  /** Why the last run flagged its kept take. */
  why?: string;
  /** Its Scene, once made. */
  sceneId?: string;
  /** The kept take's picture (its framed cut when it has one). */
  thumb?: string;
  seconds: number;
};

const SIZE_SHORT: Record<keyof typeof SHOT_FRAMING_LABELS, string> = {
  full: 'Wide',
  knees: 'Medium wide',
  waist: 'Medium',
  head: 'Close-up',
};

/** The scene's slate number: the made Scene's name says it ("2C CRAMPED…"), else its order. */
function slateOf(moment: ShortMoment, momentIndex: number, shotIndex: number): string {
  const named = moment.shots[shotIndex]?.scene?.name.match(/^(\d+[A-Z]+)\s/)?.[1];
  return named ?? shotLabel(String(momentIndex + 1), shotIndex);
}

export function shortShotRows(
  moments: readonly ShortMoment[],
  flagged: Readonly<Record<string, string>> = {}
): ShortShotRow[] {
  const rows: ShortShotRow[] = [];
  moments.forEach((moment, momentIndex) => {
    moment.shots.forEach((entry, shotIndex) => {
      const { shot, scene, kept } = entry;
      const why = scene ? flagged[scene.id] : undefined;
      const status: ShortShotStatus = !scene
        ? 'not-made'
        : why
          ? 'to-check'
          : kept
            ? 'kept'
            : 'no-take';
      const line = shot.line?.trim();
      const text = line
        ? `${cueAsName(shot.speaker ?? '')}${shot.offscreen ? ' (V.O.)' : ''}: ${line}`.replace(
            /^: /,
            ''
          )
        : (shot.action?.trim() ?? '');
      rows.push({
        shotId: shot.id,
        sceneKey: moment.sceneId,
        sceneNumber: momentIndex + 1,
        label: slateOf(moment, momentIndex, shotIndex),
        heading: moment.heading || moment.place,
        size: SIZE_SHORT[shot.framing] ?? shot.framing,
        sizeTitle: SHOT_FRAMING_LABELS[shot.framing] ?? shot.framing,
        purpose: SHOT_PURPOSE_LABELS[shot.purpose] ?? shot.purpose,
        who: shot.who.map(cueAsName).join(', '),
        text,
        takes: scene?.takes.length ?? 0,
        status,
        ...(why ? { why } : {}),
        ...(scene ? { sceneId: scene.id } : {}),
        ...(kept ? { thumb: kept.framedUrl || kept.imageUrl } : {}),
        seconds: shot.seconds,
      });
    });
  });
  return rows;
}

/** "5 shots · 3 kept · 1 to check · 1 not made": the list's summary, only what is there. */
export function shortShotSummary(rows: readonly ShortShotRow[]): string {
  const count = (status: ShortShotStatus) => rows.filter(row => row.status === status).length;
  const parts = [`${rows.length} shot${rows.length === 1 ? '' : 's'}`];
  const kept = count('kept');
  const check = count('to-check');
  const none = count('no-take');
  const notMade = count('not-made');
  if (kept) parts.push(`${kept} kept`);
  if (check) parts.push(`${check} to check`);
  if (none) parts.push(`${none} no take yet`);
  if (notMade) parts.push(`${notMade} not made`);
  const seconds = rows.reduce((sum, row) => sum + (row.seconds > 0 ? row.seconds : 0), 0);
  if (seconds)
    parts.push(`about ${seconds < 90 ? `${seconds} s` : `${Math.round(seconds / 60)} min`}`);
  return parts.join(' · ');
}

export type ShortShotGroup = {
  sceneKey: string;
  sceneNumber: number;
  heading: string;
  rows: ShortShotRow[];
  /** Its coverage: the sizes it has, widest first ("Wide · Medium · Close-up"), and kept takes. */
  coverage: string;
};

const SIZE_ORDER = ['Wide', 'Medium wide', 'Medium', 'Close-up'];

/** The shot list by script scene, in order, each with its coverage line (2026-11-12). */
export function shortShotGroups(rows: readonly ShortShotRow[]): ShortShotGroup[] {
  const groups: ShortShotGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.sceneKey === row.sceneKey) last.rows.push(row);
    else
      groups.push({
        sceneKey: row.sceneKey,
        sceneNumber: row.sceneNumber,
        heading: row.heading,
        rows: [row],
        coverage: '',
      });
  }
  for (const group of groups) {
    const sizes = [...new Set(group.rows.map(row => row.size))].sort(
      (a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b)
    );
    const kept = group.rows.filter(
      row => row.status === 'kept' || row.status === 'to-check'
    ).length;
    const count = group.rows.length;
    group.coverage = `${count} shot${count === 1 ? '' : 's'} · ${sizes.join(', ')} · ${kept} of ${count} with a take`;
  }
  return groups;
}
