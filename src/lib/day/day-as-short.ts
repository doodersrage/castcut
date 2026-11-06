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
import { dayPartOf, normalizeDaySlots, type DaySlot } from './planner';
import { sceneFromDaySlot, type SavedScene } from './scenes';
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
  const script = createScript({ castId, source, name: title, now });
  if (!script) return null;
  const parsed = parseScript(source);
  // One scene per moment, in order (dayShortSource writes one heading each).
  if (parsed.scenes.length !== moments.length) return null;
  const leadSpeaker = speakerKey(input.leadName);
  const shots: PlannedShot[] = [];
  const scenes: SavedScene[] = [];
  moments.forEach((slot, index) => {
    const sceneId = parsed.scenes[index]!.id;
    const shotId = `${sceneId}-moment`;
    const scene = sceneFromDaySlot({
      day: input.day,
      slotId: slot.id,
      castId,
      name: slot.label?.trim() || `Moment ${index + 1}`,
      id: `scene-${script.id}-${index + 1}`,
      now: now + index,
    });
    if (!scene) return;
    // The Day's still is the one its cut uses: kept here too.
    const kept = scene.takes[scene.takes.length - 1]?.id;
    scenes.push({
      ...scene,
      ...(kept ? { keptTakeId: kept } : {}),
      fromScript: { scriptId: script.id, sceneId, shotId },
    });
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
      madeSceneId: scene.id,
    });
  });
  if (scenes.length !== moments.length) return null;
  return { script, shots, scenes, leadSpeaker };
}
