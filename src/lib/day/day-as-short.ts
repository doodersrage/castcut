/**
 * A Day as a short (2026-11-06, the script-driven Short): the Day's moments as a script — a scene
 * per moment, its place and time as the heading, its beat as the action, its line said by the
 * lead — with a planned shot for each and a Scene made from it, the moment's still its kept take.
 * A copy: the Day is left as it is, and deleting the script (and its Scenes) undoes it. From there
 * it is a script like any other — a run, the Storyboard, Cut's Scenes.
 */

import { parseScript } from '../script/parse';
import type { CameraShot } from '../pose/camera-shot';
import type { DayToolCache } from '../play/settings';
import {
  dayPartOf,
  dayStillShownImage,
  normalizeDaySlotStills,
  normalizeDaySlots,
  type DaySlot,
  type DaySlotStill,
} from './planner';
import { keptTakeOf, sceneFromDaySlot, takeAsStill, type SavedScene } from './scenes';
import { createScript, type SavedScript } from './scene-scripts';
import type { PlannedShot } from './script-shots';

const TIME_OF_PART: Record<string, string> = {
  morning: 'MORNING',
  afternoon: 'DAY',
  evening: 'EVENING',
  night: 'NIGHT',
};

const OUTSIDE =
  /\b(beach|park|street|garden|yard|pier|harbou?r|market|rooftop|terrace|balcony|pool|trail|forest|woods|field|lake|river|shore|square|plaza|court|track|pitch|stadium|campsite|patio|deck|bridge|boardwalk|promenade|outside|outdoors?)\b/i;

/** "INT. KITCHEN - MORNING" for a moment: its place (else its label) and its part of the day. */
export function dayMomentHeading(slot: Pick<DaySlot, 'id' | 'label' | 'location'>): string {
  const place = (slot.location?.trim() || slot.label?.trim() || 'Home')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+-\s+/g, ' ')
    .slice(0, 60)
    .toUpperCase();
  const time = TIME_OF_PART[dayPartOf(slot.id)] ?? 'DAY';
  return `${OUTSIDE.test(place) ? 'EXT.' : 'INT.'} ${place} - ${time}`;
}

function speakerKey(name: string): string {
  return (
    name
      .trim()
      .replace(/[^\p{L}\p{N} '-]/gu, '')
      .toUpperCase()
      .slice(0, 40) || 'HER'
  );
}

/** The moments worth a scene: a place, a beat or a line set (an empty card is left out). */
function momentsOf(day: Pick<DayToolCache, 'slots' | 'dayLength'>): DaySlot[] {
  return normalizeDaySlots(day.slots, day.dayLength).filter(
    slot => slot.location?.trim() || slot.sceneHints?.trim() || slot.line?.trim()
  );
}

/** The Fountain for a Day's moments. */
export function dayShortSource(input: {
  day: Pick<DayToolCache, 'slots' | 'dayLength'>;
  leadName: string;
  title: string;
}): string {
  const lead = speakerKey(input.leadName);
  const blocks = momentsOf(input.day).map(slot => {
    const lines = [dayMomentHeading(slot), ''];
    const beat = slot.sceneHints?.trim().replace(/\s+/g, ' ');
    lines.push(beat ? beat : `${input.leadName.trim() || 'She'} is here.`, '');
    const said = slot.line?.trim().replace(/\s+/g, ' ');
    if (said) lines.push(lead, said, '');
    return lines.join('\n');
  });
  return [`Title: ${input.title.trim() || 'A short'}`, '', ...blocks].join('\n').trimEnd() + '\n';
}

/**
 * What the Day's moments are, as a short reads them — when it changes, the short is out of date.
 * (Stills count: a new take on the Day is one the short doesn't have yet.)
 */
export function dayShortFingerprint(day: DayToolCache): string {
  const stills = new Map(
    (day.stills ?? []).map(still => [
      still.slotId,
      still.status === 'completed' ? still.promptId : '',
    ])
  );
  return JSON.stringify(
    momentsOf(day).map(slot => [
      slot.id,
      slot.location ?? '',
      slot.sceneHints ?? '',
      slot.line ?? '',
      stills.get(slot.id) ?? '',
    ])
  ).concat(String(day.dayMood ?? ''));
}

export type DayAsShort = {
  script: SavedScript;
  shots: PlannedShot[];
  scenes: SavedScene[];
  /** The lead's speaker key, for Who's who. */
  leadSpeaker: string;
};

/**
 * The Day as a script, its planned shots and their Scenes — or null when there is no moment to
 * make one of (or no Cast). Each Scene is the slot's shot exactly ("Open as Scene"), its still
 * as the kept take when the Day's stills are this Cast's.
 */
export function dayAsShort(input: {
  day: DayToolCache;
  castId: string;
  leadName: string;
  title?: string;
  now?: number;
  /**
   * The Day's short already made (its link): updated in place — same script, each moment's Scene
   * matched by its slot, its takes and kept take kept, the Day's newer still added — so the Day
   * has one short however often it's made.
   */
  existing?: { script: SavedScript; scenes: readonly SavedScene[] };
}): DayAsShort | null {
  const castId = input.castId.trim();
  const moments = momentsOf(input.day);
  if (!castId || !moments.length) return null;
  const now = input.now ?? Date.now();
  const title =
    input.title?.trim() ||
    (input.day.dayEvent?.text?.trim() ?? '') ||
    `${input.leadName.trim() || 'Her'}’s day`;
  const source = dayShortSource({ day: input.day, leadName: input.leadName, title });
  // The Day's mood (Sport, Vacation, a theme…) goes with it: Scenes made later wear it too.
  const mood = typeof input.day.dayMood === 'string' ? input.day.dayMood : undefined;
  const fresh = createScript({ castId, source, name: title, now, mood });
  if (!fresh) return null;
  const prior = input.existing?.script.castId === castId ? input.existing : undefined;
  const script: SavedScript = prior
    ? {
        ...prior.script,
        source: fresh.source,
        ...(mood ? { mood } : {}),
        updatedAt: now,
      }
    : fresh;
  const parsed = parseScript(source);
  // One scene per moment, in order (dayShortSource writes one heading each).
  if (parsed.scenes.length !== moments.length) return null;
  const leadSpeaker = speakerKey(input.leadName);
  const shots: PlannedShot[] = [];
  const scenes: SavedScene[] = [];
  // Ids the short's Scenes have: a new moment's Scene takes none of them. (By position alone, a
  // moment written between two old ones got the id of the one after — two Scenes, one id, one
  // lost on save; live 2026-11-07, 10 Scenes for 12 moments.)
  const taken = new Set(
    (prior?.scenes ?? [])
      .filter(entry => entry.fromScript?.scriptId === script.id)
      .map(entry => entry.id)
  );
  moments.forEach((slot, index) => {
    const sceneId = parsed.scenes[index]!.id;
    const shotId = `${sceneId}-moment`;
    const before = prior?.scenes.find(
      entry => entry.fromScript?.scriptId === script.id && entry.fromDaySlot === slot.id
    );
    const byPosition = `scene-${script.id}-${index + 1}`;
    const id = before?.id ?? (taken.has(byPosition) ? `scene-${script.id}-${slot.id}` : byPosition);
    taken.add(id);
    const scene = sceneFromDaySlot({
      day: input.day,
      slotId: slot.id,
      castId,
      name: slot.label?.trim() || `Moment ${index + 1}`,
      id,
      now: now + index,
    });
    if (!scene) return;
    const fromScript = { scriptId: script.id, sceneId, shotId };
    if (before) {
      // The moment's shot as the Day has it now; every take it had, and the Day's still if new.
      // A still the Scene already has (a take of its own the board shows, under the take's render
      // id) isn't new — or a just-unkept take came back as kept on the next sync (live, 6 of 12).
      const known = (take: (typeof scene.takes)[number]) =>
        before.takes.some(
          entry =>
            entry.id === take.id ||
            (Boolean(take.promptId) && entry.promptId === take.promptId) ||
            entry.imageUrl === take.imageUrl
        );
      const fromDay = scene.takes.filter(take => !known(take));
      const takes = [...before.takes, ...fromDay];
      // A moment written anew (another beat or place, not a tweak): the take kept for the old
      // one isn't this moment's — it stays among the takes, unkept, and Make the short renders
      // the moment again. (Live 2026-11-07: a seaside day's kept stills stood in for an
      // old-town day written over it, and the run skipped seven of its twelve moments.)
      const rewritten = momentRewritten(before.slot, scene.slot);
      // Else its kept take, or a still the Day made since (not one the Scene had: that could be
      // the take just unkept).
      const kept = rewritten ? undefined : (before.keptTakeId ?? fromDay[fromDay.length - 1]?.id);
      const { keptTakeId: _old, ...rest } = before;
      scenes.push({
        ...rest,
        slot: scene.slot,
        takes,
        ...(kept ? { keptTakeId: kept } : {}),
        fromScript,
        updatedAt: now + index,
      });
    } else {
      // The Day's still is the one its cut uses: kept here too.
      const kept = scene.takes[scene.takes.length - 1]?.id;
      scenes.push({ ...scene, ...(kept ? { keptTakeId: kept } : {}), fromScript });
    }
    const said = slot.line?.trim();
    const framing: CameraShot = slot.poseCamera?.shot ?? (said ? 'waist' : 'knees');
    shots.push({
      id: shotId,
      sceneId,
      purpose: said ? 'dialogue' : 'action',
      framing,
      who: said ? [leadSpeaker] : [],
      ...(slot.sceneHints?.trim() ? { action: slot.sceneHints.trim().slice(0, 400) } : {}),
      ...(said ? { line: said.slice(0, 400), speaker: leadSpeaker } : {}),
      seconds: said ? 5 : 3,
      madeSceneId: scenes[scenes.length - 1]!.id,
    });
  });
  if (scenes.length !== moments.length) return null;
  return { script, shots, scenes, leadSpeaker };
}

const momentWords = (value: string | undefined) =>
  new Set(
    (value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
  );

/** Under half the words in common (Jaccard): another sentence, not the same one tweaked. */
function wordsChanged(before: string | undefined, after: string | undefined): boolean {
  const a = momentWords(before);
  const b = momentWords(after);
  if (!a.size && !b.size) return false;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared) < 0.5;
}

/**
 * Whether a moment was written anew on the board: its beat or its place is another sentence
 * (a typo fixed, a word added, is not). Pure.
 */
export function momentRewritten(
  before: { sceneHints?: string; location?: string },
  after: { sceneHints?: string; location?: string }
): boolean {
  return (
    wordsChanged(before.sceneHints, after.sceneHints) ||
    wordsChanged(before.location, after.location)
  );
}

/**
 * Short ← its short (the board on the script road, 2026-11-06): each moment's kept take on its
 * Scene as the moment's still on the Day — Make the short's renders show on the board, its reel
 * and Cut's Short source. Null when nothing changes. A still rendering on the Day now is left
 * alone, and only the Day's own Cast's stills are touched.
 */
export function dayStillsFromShort(
  day: Pick<DayToolCache, 'slots' | 'dayLength' | 'stills' | 'stillsCharacterId'>,
  scenes: readonly SavedScene[],
  link: { castId: string; scriptId: string }
): DaySlotStill[] | null {
  const owner = day.stillsCharacterId?.trim();
  if (owner && owner !== link.castId) return null;
  const slots = normalizeDaySlots(day.slots, day.dayLength);
  let stills = normalizeDaySlotStills(day.stills, slots);
  let changed = false;
  for (const scene of scenes) {
    if (scene.fromScript?.scriptId !== link.scriptId || scene.castId !== link.castId) continue;
    const slotId = scene.fromDaySlot;
    if (!slotId || !slots.some(slot => slot.id === slotId)) continue;
    const kept = keptTakeOf(scene);
    if (!kept) continue;
    const before = stills.find(still => still.slotId === slotId);
    if (before && before.status !== 'completed' && before.status !== 'error' && before.promptId)
      continue;
    const next = takeAsStill(slotId, kept);
    // Already the Day's still: the same take (by its prompt — the Day may have reframed or
    // finished its picture since), else the same picture.
    if (
      before?.status === 'completed' &&
      (next.promptId
        ? before.promptId === next.promptId
        : !before.promptId && before.imageUrl === next.imageUrl)
    )
      continue;
    const shown = dayStillShownImage(before);
    stills = [
      ...stills.filter(still => still.slotId !== slotId),
      {
        ...next,
        ...(before?.status === 'completed' && shown && shown !== kept.imageUrl
          ? {
              previousTake: {
                imageUrl: shown,
                ...(before.promptId ? { promptId: before.promptId } : {}),
              },
            }
          : {}),
      },
    ];
    changed = true;
  }
  return changed ? stills : null;
}
