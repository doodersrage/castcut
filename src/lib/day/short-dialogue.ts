/**
 * A Short's moments written as scenes with their dialogue (Step 5c, 2026-11-09: "Write it"
 * writes each moment's scene — the user: on by default, a switch beside it; who speaks is who is
 * in the moment). The cards are the outline — a moment's heading, its beat as what happens, who
 * is in it — and the episode writer's scene step writes each one (/api/script-episode). Each
 * written scene replaces its moment's scene in the short; its shots are planned again, every
 * Scene carried (short-scene-edit.ts), the card's own Scene on the lead's first line. Pure.
 */

import { parseScript } from '../script/parse';
import type { DayToolCache } from '../play/settings';
import { dayMomentHeading } from './day-as-short';
import type { EpisodeCastMember, EpisodeOutline } from './episode-writer';
import { normalizeDaySlots, type DaySlot, type DaySlotId } from './planner';
import type { SavedScene } from './scenes';
import type { SavedScript } from './scene-scripts';
import { replannedMomentShots } from './short-scene-edit';
import { shortMomentsOf } from './short-moments';

/** Someone in a moment besides the lead: a Cast member (castId) or the writer's to name. */
export type MomentPerson = EpisodeCastMember & { castId?: string };

/** Another person in the beat (the premise writer says so plainly: "with her partner"). */
const SOMEONE_ELSE_RE =
  /\b(partner|boyfriend|girlfriend|husband|wife|friend|friends|date|together|with (?:him|her|them)|both|couple|guests?|neighbou?rs?|stranger|mother|father|mum|mom|dad|sister|brother|colleague|barista|waiter|waitress)\b/i;

/** The speaker key a name is written under (script cues are capitals). */
export function cueOf(name: string): string {
  return (
    name
      .trim()
      .replace(/[^\p{L}\p{N} '-]/gu, '')
      .toUpperCase()
      .slice(0, 40) || 'HER'
  );
}

/**
 * Who is in a moment besides the lead: a Cast member set on it (third / fourth), and her partner
 * when the beat has someone with her and companions are on. Alone: nobody.
 */
export function momentPeople(
  slot: Pick<DaySlot, 'sceneHints' | 'thirdCastId' | 'fourthCastId'>,
  input: {
    companions: boolean;
    partner?: MomentPerson | null;
    castById: (id: string) => MomentPerson | undefined;
  }
): MomentPerson[] {
  const people: MomentPerson[] = [];
  for (const id of [slot.thirdCastId, slot.fourthCastId]) {
    const member = id ? input.castById(id) : undefined;
    if (member) people.push(member);
  }
  if (input.companions && SOMEONE_ELSE_RE.test(slot.sceneHints ?? '')) {
    const partner = input.partner ?? { name: 'her partner' };
    if (!people.some(person => person.name === partner.name)) people.unshift(partner);
  }
  return people;
}

/** The moments worth a scene (a place, a beat or a line), in board order. */
function writtenMoments(day: Pick<DayToolCache, 'slots' | 'dayLength'>): DaySlot[] {
  return normalizeDaySlots(day.slots, day.dayLength).filter(
    slot => slot.location?.trim() || slot.sceneHints?.trim() || slot.line?.trim()
  );
}

/**
 * The writer's outline from the board: each moment a scene — its heading (the card's, so the
 * written scene keeps its id), what happens (its beat; alone, a line or two of hers at most),
 * who is in it.
 */
export function momentDialogueOutline(input: {
  day: Pick<DayToolCache, 'slots' | 'dayLength'>;
  title: string;
  logline: string;
  peopleOf: (slot: DaySlot) => readonly MomentPerson[];
}): { outline: EpisodeOutline; slotIds: DaySlotId[] } {
  const moments = writtenMoments(input.day);
  return {
    slotIds: moments.map(slot => slot.id),
    outline: {
      title: input.title.trim() || 'A short',
      logline: input.logline.trim(),
      scenes: moments.map(slot => {
        const people = input.peopleOf(slot);
        const said = slot.sceneHints?.trim().replace(/\s+/g, ' ') || 'She is here.';
        const beat = /[.!?…]$/.test(said) ? said : `${said}.`;
        return {
          heading: dayMomentHeading(slot),
          summary: people.length
            ? beat
            : `${beat} She is alone: at most a line or two of hers, to herself or on the phone.`,
          who: people.map(person => person.name),
        };
      }),
    },
  };
}

/**
 * One written scene into the short, in place of its moment's: the script's text, its shots for
 * that scene planned again (each carrying its Scene; new ones unmade until the run), the Scenes
 * whose link moved, the card's line (the lead's first) and Who's who for its Cast members. Null
 * when the moment has no scene in the short, or the written text isn't one scene.
 */
/**
 * The people in the moment are there, seen: a (V.O.) / (O.S.) on their cue is taken off (a live
 * run wrote "PARTNER (V.O.)" for every line of the partner sitting across the table from her,
 * 2026-11-09 — then rendered as a voice over her shots). Someone else heard, not seen (a voice on
 * the phone), keeps it. Matched by cue: "her partner" is PARTNER too. Pure.
 */
export function withPeoplePresent(written: string, people: readonly MomentPerson[]): string {
  const cues = new Set(
    people.flatMap(person => [
      cueOf(person.name),
      cueOf(person.name.replace(/^(?:her|his|their|the|a|an)\s+/i, '')),
    ])
  );
  if (!cues.size) return written;
  return written
    .split('\n')
    .map(line => {
      const match = /^(\s*)([^a-z(]+?)\s*\((?:V\.?\s?O\.?|O\.?\s?S\.?|O\.?\s?C\.?)\)\s*$/.exec(
        line
      );
      return match && cues.has(match[2]!.trim()) ? `${match[1]}${match[2]!.trim()}` : line;
    })
    .join('\n');
}

/** Whether two cues are one slip apart: a letter changed, added, dropped, or two swapped. */
function oneSlipApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const off = [...a].flatMap((char, index) => (char === b[index] ? [] : [index]));
    if (off.length === 1) return true;
    return (
      off.length === 2 &&
      off[1] === off[0]! + 1 &&
      a[off[0]!] === b[off[1]!] &&
      a[off[1]!] === b[off[0]!]
    );
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  for (let index = 0; index < long.length; index++) {
    if (long.slice(0, index) + long.slice(index + 1) === short) return true;
  }
  return false;
}

/**
 * A misspelt cue put right (2026-11-11): a live run's writer wrote SYLNE for Slyne, so her lines
 * were nobody's in Who's who (unmapped, "the face doesn't match" on 3 of them) and her shot text
 * read "Sylne says". A cue one slip from exactly one known name (the lead's, the people's), four
 * letters or more, is written as that name. Pure.
 */
export function withKnownCues(written: string, names: readonly string[]): string {
  const known = [
    ...new Set(
      names.flatMap(name => [
        cueOf(name),
        cueOf(name.replace(/^(?:her|his|their|the|a|an)\s+/i, '')),
      ])
    ),
  ];
  const lead = names[0] ? cueOf(names[0]) : '';
  const others = [
    ...new Set(
      names.slice(1).map(name => cueOf(name.replace(/^(?:her|his|their|the|a|an)\s+/i, '')))
    ),
  ].filter(name => name && name !== lead);
  const lines = written.split('\n');
  return lines
    .map((line, index) => {
      // A cue that is only how the voice is heard ("V.O. (PHONE)"): the one other person here,
      // when there is exactly one, says it off screen (2026-11-11: the shots read "V.o. says").
      const tagOnly = /^(\s*)(?:V\.?\s*O|O\.?\s*[SC]|VOICE)\.?(?:\s*\(.*\))?\s*$/.exec(line);
      if (tagOnly && lines[index + 1]?.trim()) {
        return others.length === 1 ? `${tagOnly[1]}${others[0]} (V.O.)` : line;
      }
      const match = /^(\s*)([A-Z][A-Z0-9 '\-]*[A-Z0-9])(\s*\(.*\))?\s*$/.exec(line);
      if (!match || /^(?:INT|EXT|EST|I\/E)\b/.test(match[2]!)) return line;
      if (!lines[index + 1]?.trim()) return line;
      const cue = match[2]!;
      if (cue.length < 4 || known.includes(cue)) return line;
      const near = known.filter(name => name.length >= 4 && oneSlipApart(cue, name));
      return near.length === 1 ? `${match[1]}${near[0]}${match[3] ?? ''}` : line;
    })
    .join('\n');
}

export function withMomentDialogue(input: {
  script: SavedScript;
  scenes: readonly SavedScene[];
  slotId: DaySlotId;
  /** The written scene (Fountain; parseEpisodeScene's — the card's heading on it). */
  written: string;
  castId: string;
  leadName: string;
  /** Cast members who may speak in it: their cue → their id, for Who's who. */
  people: readonly MomentPerson[];
  now?: number;
}): { script: SavedScript; scenes: SavedScene[]; line?: string } | null {
  const now = input.now ?? Date.now();
  const moment = shortMomentsOf(input.script, input.scenes).find(
    entry => entry.daySlot === input.slotId
  );
  if (!moment) return null;
  const parsed = parseScript(input.script.source);
  const at = parsed.scenes.findIndex(scene => scene.id === moment.sceneId);
  const old = parsed.scenes[at];
  const text = withKnownCues(withPeoplePresent(input.written.trim(), input.people), [
    input.leadName,
    ...input.people.map(person => person.name),
  ]);
  const written = parseScript(text);
  if (!old || written.scenes.length !== 1) return null;
  const lines = input.script.source.split('\n');
  lines.splice(old.from - 1, old.to - old.from + 1, ...text.split('\n'));
  const source = `${lines.join('\n').trimEnd()}\n`;
  const reparsed = parseScript(source);
  if (reparsed.scenes.length !== parsed.scenes.length) return null;
  const scene = reparsed.scenes[at]!;
  // Ids are headings: another scene renumbered by this one's new heading follows it.
  const moved = new Map(
    parsed.scenes.map((entry, index) => [entry.id, reparsed.scenes[index]!.id] as const)
  );
  const lead = cueOf(input.leadName);
  const leads = [
    lead,
    ...Object.entries(input.script.castMap ?? {})
      .filter(([, id]) => id === input.castId)
      .map(([speaker]) => speaker.toUpperCase()),
  ];
  const planned = replannedMomentShots(
    moment.shots.map(entry => entry.shot),
    scene
  );
  // The card's own Scene: on its shot if it kept one, else her first line's, else the first free.
  const card = [...moment.shots.map(entry => entry.scene), ...moment.loose].find(
    entry => entry?.fromDaySlot === input.slotId
  );
  if (card && !planned.some(shot => shot.madeSceneId === card.id)) {
    const free =
      planned.find(
        shot =>
          !shot.madeSceneId && shot.purpose === 'dialogue' && leads.includes(shot.speaker ?? '')
      ) ?? planned.find(shot => !shot.madeSceneId);
    if (free) free.madeSceneId = card.id;
  }
  const cardShot = card ? planned.find(shot => shot.madeSceneId === card.id) : undefined;
  const line =
    cardShot?.purpose === 'dialogue' &&
    leads.includes(cardShot.speaker ?? '') &&
    !cardShot.offscreen
      ? cardShot.line
      : undefined;
  const shotOf = new Map(planned.map(shot => [shot.madeSceneId, shot.id]));
  const scenes: SavedScene[] = [];
  for (const entry of input.scenes) {
    const link = entry.fromScript;
    if (link?.scriptId !== input.script.id) continue;
    const sceneId = moved.get(link.sceneId) ?? link.sceneId;
    const shotId =
      link.sceneId === moment.sceneId ? (shotOf.get(entry.id) ?? link.shotId) : link.shotId;
    const isCard = card && entry.id === card.id;
    if (sceneId === link.sceneId && shotId === link.shotId && !isCard) continue;
    const { line: _old, ...slot } = entry.slot;
    scenes.push({
      ...entry,
      ...(isCard ? { slot: line ? { ...slot, line } : slot } : {}),
      fromScript: { ...link, sceneId, shotId },
      updatedAt: now,
    });
  }
  const shots = [
    ...(input.script.shots ?? [])
      .filter(shot => shot.sceneId !== moment.sceneId)
      .map(shot => {
        const sceneId = moved.get(shot.sceneId) ?? shot.sceneId;
        return sceneId === shot.sceneId ? shot : { ...shot, sceneId };
      }),
    ...planned,
  ];
  const order = new Map(reparsed.scenes.map((entry, index) => [entry.id, index]));
  shots.sort((a, b) => (order.get(a.sceneId) ?? 0) - (order.get(b.sceneId) ?? 0));
  const castMap = { ...(input.script.castMap ?? {}), [lead]: input.castId };
  for (const person of input.people) {
    if (person.castId && !(cueOf(person.name) in castMap))
      castMap[cueOf(person.name)] = person.castId;
  }
  return {
    script: { ...input.script, source, shots, castMap, updatedAt: now },
    scenes,
    ...(line ? { line } : {}),
  };
}
