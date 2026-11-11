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
  orderDaySlots,
  dayStillShownImage,
  normalizeDaySlotStills,
  normalizeDaySlots,
  type DaySlot,
  type DaySlotStill,
} from './planner';
import { slotDayPart } from './parts';
import {
  keptTakeOf,
  normalizeSavedScenes,
  sceneFromDaySlot,
  scenesWithWorking,
  takeAsStill,
  upsertScene,
  type SavedScene,
  type SceneToolCache,
} from './scenes';
import { createScript, type SavedScript } from './scene-scripts';
import { sceneShowsOthers, type PlannedShot } from './script-shots';
import type { ScriptScene } from '../script/parse';
import type { DaySlotId } from './planner';
import { shortMomentHasMore, shortMomentsOf, type ShortMoment } from './short-moments';
import { patchedMomentScene, replannedMomentShots } from './short-scene-edit';

const TIME_OF_PART: Record<string, string> = {
  morning: 'MORNING',
  afternoon: 'DAY',
  evening: 'EVENING',
  night: 'NIGHT',
};

const OUTSIDE =
  /\b(beach|park|street|garden|yard|pier|harbou?r|market|rooftop|terrace|balcony|pool|trail|forest|woods|field|lake|river|shore|square|plaza|court|track|pitch|stadium|campsite|patio|deck|bridge|boardwalk|promenade|outside|outdoors?)\b/i;

/**
 * The place a heading names: the card's setting up to where it starts saying how it looks — "kitchen
 * lit by morning sun through rain-streaked windows" is the KITCHEN (Write it gives a setting its
 * light, for the still; a heading that carried it all read badly — live run, 2026-11-09). Pure.
 */
export function momentHeadingPlace(setting: string): string {
  const flat = setting
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const cut = flat
    .split(
      /\s*[,;:(]\s*|\s+[-–—]\s+|\s+(?:lit|with|where|through|under|beneath|overlooking|facing|full of|filled with|glowing|bathed|at (?:dawn|dusk|night|sunset|sunrise)|in the (?:morning|afternoon|evening|rain|dark))\b/i
    )[0]!
    .trim();
  const place = cut.length >= 3 ? cut : flat;
  return place.split(' ').slice(0, 6).join(' ');
}

/** "INT. KITCHEN - MORNING" for a moment: its place (else its label) and its part of the day. */
export function dayMomentHeading(slot: Pick<DaySlot, 'id' | 'label' | 'location'>): string {
  const setting = slot.location?.trim() || slot.label?.trim() || 'Home';
  const place = momentHeadingPlace(setting)
    .replace(/\s+-\s+/g, ' ')
    .slice(0, 60)
    .toUpperCase();
  const time = TIME_OF_PART[slotDayPart(slot)] ?? 'DAY';
  // Inside or out by the whole setting ("… damp pavement light outside" is out).
  return `${OUTSIDE.test(setting) ? 'EXT.' : 'INT.'} ${place} - ${time}`;
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

/** A moment's scene as the board writes it: heading, beat, the lead's line. */
function momentBlock(slot: DaySlot, leadName: string): string {
  const lines = [dayMomentHeading(slot), ''];
  const beat = slot.sceneHints?.trim().replace(/\s+/g, ' ');
  lines.push(beat ? beat : `${leadName.trim() || 'She'} is here.`, '');
  const said = slot.line?.trim().replace(/\s+/g, ' ');
  if (said) lines.push(speakerKey(leadName), said, '');
  return lines.join('\n');
}

/** The Fountain for a Day's moments. */
export function dayShortSource(input: {
  day: Pick<DayToolCache, 'slots' | 'dayLength'>;
  leadName: string;
  title: string;
}): string {
  const blocks = momentsOf(input.day).map(slot => momentBlock(slot, input.leadName));
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
  // The whole moment (2026-11-08): a pose, camera, clothes or time edited on the board is a change
  // the short must take — with the short as the record (4b), one it didn't take came back as the
  // old pose when Short opened again (CI: the 3D pose editor's saved pose reverted to the preset).
  return JSON.stringify(momentsOf(day).map(slot => [slot, stills.get(slot.id) ?? ''])).concat(
    String(day.dayMood ?? '')
  );
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
  // In the board's order (Step 5f): a new moment's scene goes after the card before it there.
  const moments = orderDaySlots(momentsOf(input.day), input.day.slotOrder);
  if (!castId || !moments.length) return null;
  const now = input.now ?? Date.now();
  const title =
    input.title?.trim() ||
    (input.day.dayEvent?.text?.trim() ?? '') ||
    `${input.leadName.trim() || 'Her'}’s day`;
  const prior0 = input.existing?.script.castId === castId ? input.existing : undefined;
  const leadSpeaker0 = speakerKey(input.leadName);
  // Every moment the short has (Step 5b-ii): the board writes only what its card owns (heading,
  // beat, the lead's line) into the scene's own text, the rest kept as written on Script. One
  // that is a whole scene (another voice, more shots) has its shots planned again too.
  const priorMoments = new Map<
    DaySlotId,
    { moment: ShortMoment; scene: ScriptScene; whole: boolean }
  >();
  const parsedPrior = prior0 ? parseScript(prior0.script.source) : undefined;
  const priorLines = prior0 ? prior0.script.source.split('\n') : [];
  const leads = [
    ...new Set([
      leadSpeaker0,
      ...Object.entries(prior0?.script.castMap ?? {})
        .filter(([, id]) => id === castId)
        .map(([speaker]) => speaker.toUpperCase()),
    ]),
  ];
  if (prior0 && parsedPrior) {
    for (const moment of shortMomentsOf(prior0.script, prior0.scenes)) {
      const scene = parsedPrior.scenes.find(entry => entry.id === moment.sceneId);
      if (moment.daySlot && scene && !priorMoments.has(moment.daySlot))
        priorMoments.set(moment.daySlot, {
          moment,
          scene,
          whole: shortMomentHasMore(moment, leads),
        });
    }
  }
  const sceneMoments = new Map(
    [...priorMoments].filter(([, entry]) => entry.whole).map(([id, entry]) => [id, entry])
  );
  // The card as it last went into the short (its Scene's slot): only what changed since is
  // written — a beat rewritten on Script isn't put back by a card that never touched it.
  const syncedOf = (slotId: DaySlotId) =>
    syncedSlotOf(
      prior0?.scenes.find(
        entry => entry.fromScript?.scriptId === prior0.script.id && entry.fromDaySlot === slotId
      )
    );
  const patched = (slot: DaySlot): string | null => {
    const own = priorMoments.get(slot.id);
    if (!own) return null;
    const synced = syncedOf(slot.id);
    const same = (a: string | undefined, b: string | undefined) =>
      (a ?? '').replace(/\s+/g, ' ').trim() === (b ?? '').replace(/\s+/g, ' ').trim();
    const headingNow = dayMomentHeading(slot);
    const lineMoved = !synced || !same(synced.line, slot.line);
    const lines = patchedMomentScene(priorLines, own.scene, {
      heading: synced && headingNow === dayMomentHeading(synced) ? own.scene.heading : headingNow,
      ...(!synced || !same(synced.sceneHints, slot.sceneHints) ? { beat: slot.sceneHints } : {}),
      ...(lineMoved ? { line: slot.line, lineBefore: synced?.line } : {}),
      leadSpeakers: leads,
      leadCue: leadSpeaker0,
    });
    return lines ? `${lines.join('\n').trimEnd()}\n` : null;
  };
  // The scenes in the short's order: its own, each moment's where it was, a scene written on
  // Script (no card) kept where it is; a new moment after the one before it on the board.
  type Entry = { slot: DaySlot } | { kept: ScriptScene };
  const entries: Entry[] = [];
  const slotOfScene = new Map([...priorMoments].map(([id, entry]) => [entry.scene.id, id]));
  for (const scene of parsedPrior?.scenes ?? []) {
    const slotId = slotOfScene.get(scene.id);
    if (!slotId) entries.push({ kept: scene });
    else {
      const slot = moments.find(entry => entry.id === slotId);
      // A moment emptied on the board: its scene goes, as before (its Scenes stay).
      if (slot) entries.push({ slot });
    }
  }
  moments.forEach((slot, index) => {
    if (entries.some(entry => 'slot' in entry && entry.slot.id === slot.id)) return;
    const previous = moments
      .slice(0, index)
      .reverse()
      .map(before => entries.findIndex(entry => 'slot' in entry && entry.slot.id === before.id))
      .find(at => at >= 0);
    const firstMoment = entries.findIndex(entry => 'slot' in entry);
    const at =
      previous !== undefined ? previous + 1 : firstMoment >= 0 ? firstMoment : entries.length;
    entries.splice(at, 0, { slot });
  });
  const firstPrior = parsedPrior?.scenes[0];
  const titlePage =
    prior0 && firstPrior
      ? priorLines
          .slice(0, firstPrior.from - 1)
          .join('\n')
          .trimEnd()
      : `Title: ${title.trim() || 'A short'}`;
  const source =
    [
      titlePage,
      '',
      ...entries.map(entry =>
        'slot' in entry
          ? (patched(entry.slot) ?? momentBlock(entry.slot, input.leadName))
          : `${priorLines
              .slice(entry.kept.from - 1, entry.kept.to)
              .join('\n')
              .trimEnd()}\n`
      ),
    ]
      .join('\n')
      .trimEnd() + '\n';
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
  // One scene per entry, in order (each block holds one heading).
  if (parsed.scenes.length !== entries.length) return null;
  const sceneOfSlot = new Map(
    entries.flatMap((entry, at) => ('slot' in entry ? [[entry.slot.id, parsed.scenes[at]!]] : []))
  );
  const leadSpeaker = speakerKey(input.leadName);
  const shots: PlannedShot[] = [];
  const scenes: SavedScene[] = [];
  // A scene moment's other Scenes (its other shots', its loose ones): moved onto the scene's new
  // id and their shots — never dropped (Step 5b-ii).
  const alongside: SavedScene[] = [];
  // Ids the short's Scenes have: a new moment's Scene takes none of them. (By position alone, a
  // moment written between two old ones got the id of the one after — two Scenes, one id, one
  // lost on save; live 2026-11-07, 10 Scenes for 12 moments.)
  const taken = new Set(
    (prior?.scenes ?? [])
      .filter(entry => entry.fromScript?.scriptId === script.id)
      .map(entry => entry.id)
  );
  moments.forEach((slot, index) => {
    const sceneId = sceneOfSlot.get(slot.id)!.id;
    const before = prior?.scenes.find(
      entry => entry.fromScript?.scriptId === script.id && entry.fromDaySlot === slot.id
    );
    // A whole-scene moment: its shots planned again from its new text, each carrying its Scene.
    const own = sceneMoments.get(slot.id);
    const lineBefore = syncedSlotOf(before)?.line;
    const planned = own
      ? replannedMomentShots(
          own.moment.shots.map(entry => entry.shot),
          sceneOfSlot.get(slot.id)!,
          lineBefore !== slot.line
            ? { speaker: leadSpeaker, from: lineBefore, to: slot.line }
            : undefined
        )
      : undefined;
    const shotId =
      planned?.find(shot => before && shot.madeSceneId === before.id)?.id ?? `${sceneId}-moment`;
    const byPosition = `scene-${script.id}-${index + 1}`;
    const id = before?.id ?? (taken.has(byPosition) ? `scene-${script.id}-${slot.id}` : byPosition);
    taken.add(id);
    const fromSlot = sceneFromDaySlot({
      day: input.day,
      slotId: slot.id,
      castId,
      name: slot.label?.trim() || `Moment ${index + 1}`,
      id,
      now: now + index,
    });
    if (!fromSlot) return;
    // The card's shot shows whom its written scene shows: her alone when nobody else is seen.
    const company = sceneShowsOthers(sceneOfSlot.get(slot.id)!, [
      leadSpeaker,
      speakerKey(input.leadName.trim().split(/\s+/)[0] ?? ''),
      ...Object.entries(script.castMap ?? {})
        .filter(([, member]) => member === castId)
        .map(([speaker]) => speaker),
    ]);
    const { allowCompanions: _companions, ...withoutCompanions } = fromSlot;
    const scene: SavedScene = company ? { ...fromSlot, allowCompanions: true } : withoutCompanions;
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
      const rewritten = momentRewritten(syncedSlotOf(before)!, scene.slot);
      // Else its kept take, or a still the Day made since (not one the Scene had: that could be
      // the take just unkept).
      const kept = rewritten ? undefined : (before.keptTakeId ?? fromDay[fromDay.length - 1]?.id);
      const { keptTakeId: _old, shortSynced: _synced, ...rest } = before;
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
    if (own && planned) {
      shots.push(...planned);
      const anchor = scenes[scenes.length - 1]!;
      // The card's own Scene lost its shot (its line went): it takes the first shot with no
      // Scene yet; with none, it stays — loose, never deleted.
      if (!planned.some(shot => shot.madeSceneId === anchor.id)) {
        const free = planned.find(shot => !shot.madeSceneId);
        if (free) {
          free.madeSceneId = anchor.id;
          anchor.fromScript = { ...fromScript, shotId: free.id };
        }
      }
      const shotOf = new Map(planned.map(shot => [shot.madeSceneId, shot.id]));
      for (const other of [...own.moment.shots.map(entry => entry.scene), ...own.moment.loose]) {
        if (!other || other.id === anchor.id || !other.fromScript) continue;
        alongside.push({
          ...other,
          fromScript: {
            ...other.fromScript,
            sceneId,
            shotId: shotOf.get(other.id) ?? other.fromScript.shotId,
          },
        });
      }
      return;
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
  // A scene written on Script keeps its shots and Scenes — on its id now (headings are its id,
  // so a moment's new heading can renumber a twin's).
  entries.forEach((entry, at) => {
    if (!('kept' in entry) || !prior) return;
    const was = entry.kept.id;
    const now = parsed.scenes[at]!.id;
    shots.push(
      ...(prior.script.shots ?? [])
        .filter(shot => shot.sceneId === was)
        .map(shot => (was === now ? shot : { ...shot, sceneId: now }))
    );
    if (was === now) return;
    for (const scene of prior.scenes) {
      if (scene.fromScript?.scriptId !== script.id || scene.fromScript.sceneId !== was) continue;
      alongside.push({ ...scene, fromScript: { ...scene.fromScript, sceneId: now } });
    }
  });
  // In the script's order (Cut and the run read shots in order).
  const order = new Map(parsed.scenes.map((scene, at) => [scene.id, at]));
  shots.sort((a, b) => (order.get(a.sceneId) ?? 0) - (order.get(b.sceneId) ?? 0));
  return { script, shots, scenes: [...scenes, ...alongside], leadSpeaker };
}

/**
 * The card as its short's script last took it (Step 5f part 3c): the Scene's own moment, unless
 * the board wrote an edit into it that the script hasn't taken yet.
 */
export function syncedSlotOf(scene: SavedScene | undefined): DaySlot | undefined {
  return scene ? (scene.shortSynced ?? scene.slot) : undefined;
}

/**
 * The board's card edits into its short's Scenes at once (Step 5f part 3c, 2026-11-10): each card
 * a Scene of the short holds, as that Scene's moment — what dayAsShort writes there a moment
 * later with the script — the card as the script last took it kept beside it (`shortSynced`).
 * A card back as the script has it loses that again. Not a card with no Scene, or an emptied one
 * (its scene goes with the script's update). Only a Scene that still holds the card as `inStep` had it
 * (the board when it last matched its short): one changed since from elsewhere — on Scene,
 * another tab, a page just opened that hasn't matched yet — is left for the script's update and
 * its clash check, as before. The changed Scenes; null when none. Pure.
 */
export function shortScenesWithBoard(input: {
  day: DayToolCache;
  /** The board as it last matched its short; none: nothing is written. */
  inStep: DayToolCache | null;
  scenes: readonly SavedScene[];
  link: { castId: string; scriptId: string };
  now?: number;
}): SavedScene[] | null {
  const { link, inStep } = input;
  if (!inStep) return null;
  const now = input.now ?? Date.now();
  const changed: SavedScene[] = [];
  const momentOf = (day: DayToolCache, scene: SavedScene, slotId: DaySlotId) =>
    sceneFromDaySlot({ day, slotId, castId: link.castId, name: scene.name, id: scene.id, now })
      ?.slot;
  for (const slot of momentsOf(input.day)) {
    const scene = input.scenes.find(
      entry =>
        entry.fromScript?.scriptId === link.scriptId &&
        entry.castId === link.castId &&
        entry.fromDaySlot === slot.id
    );
    if (!scene) continue;
    const synced = syncedSlotOf(scene)!;
    const was = momentOf(inStep, scene, slot.id);
    if (!was || JSON.stringify(was) !== JSON.stringify(synced)) continue;
    const moment = momentOf(input.day, scene, slot.id);
    if (!moment || JSON.stringify(moment) === JSON.stringify(scene.slot)) continue;
    const { shortSynced: _synced, ...rest } = scene;
    changed.push({
      ...rest,
      slot: moment,
      ...(JSON.stringify(moment) === JSON.stringify(synced) ? {} : { shortSynced: synced }),
      updatedAt: Math.max(now, scene.updatedAt + 1),
    });
  }
  return changed.length ? changed : null;
}

/**
 * shortScenesWithBoard on Scene's settings: what to save, or null. The Scene open on Scene is
 * read as its page left it (its working copy recorded, as the script's update reads it), and
 * written there too: its page shows the card's edit, and doesn't write the old moment back.
 */
export function shortSceneCachePatch(input: {
  cache: SceneToolCache;
  day: DayToolCache;
  inStep: DayToolCache | null;
  link: { castId: string; scriptId: string };
  now?: number;
}): (Pick<SceneToolCache, 'scenes'> & Partial<Pick<SceneToolCache, 'slots'>>) | null {
  const now = input.now ?? Date.now();
  const scenes = normalizeSavedScenes(
    scenesWithWorking(input.cache, now) ?? input.cache.scenes ?? [],
    now
  );
  const changed = shortScenesWithBoard({ ...input, scenes, now });
  if (!changed) return null;
  const open = changed.find(scene => scene.id === input.cache.activeSceneId);
  return {
    scenes: changed.reduce((all, scene) => upsertScene(all, scene), scenes),
    ...(open ? { slots: [open.slot] } : {}),
  };
}

/**
 * Board edits written into the Scenes that the short's script never took (Step 5f part 3c): its
 * script kept as it is (chosen over the board's edits) — each Scene back to its moment as the
 * script has it. Null when none. Pure.
 */
export function shortScenesUnedited(
  scenes: readonly SavedScene[],
  scriptId: string,
  now = Date.now()
): SavedScene[] | null {
  const back = scenes
    .filter(scene => scene.shortSynced && scene.fromScript?.scriptId === scriptId)
    .map(({ shortSynced, ...scene }) => ({
      ...scene,
      slot: shortSynced!,
      updatedAt: Math.max(now, scene.updatedAt + 1),
    }));
  return back.length ? back : null;
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

/**
 * Short ← its short, the moments too (step 4a, 2026-11-08): each board moment as its Scene holds
 * it — the Scene keeps the whole moment (setting, beat, line, pose, camera, clothes; Open as
 * Scene), so an edit made on Script or Scene is the board's. Matched by the moment's slot
 * (`fromDaySlot`); a Scene whose time was changed on Scene (its slot id moved) comes back as the
 * same moment at that time. A moment with no Scene in the short (an empty one, or one whose Scene
 * was deleted) is left as the board has it: nothing is dropped here. Null when nothing changes.
 * Pure; Day → dayAsShort → this is the Day again.
 */
export function dayMomentsFromShort(
  day: Pick<DayToolCache, 'slots' | 'dayLength'>,
  scenes: readonly SavedScene[],
  link: { castId: string; scriptId: string }
): DaySlot[] | null {
  const slots = normalizeDaySlots(day.slots, day.dayLength);
  const raw = slots.map(slot => {
    const scene = scenes.find(
      entry =>
        entry.fromScript?.scriptId === link.scriptId &&
        entry.castId === link.castId &&
        entry.fromDaySlot === slot.id
    );
    if (!scene) return slot;
    const { timeOfDay: chosen, ...held } = scene.slot;
    // Its time moved on Scene (the slot id there is its time): this moment, at that time.
    const part = slotDayPart(scene.slot);
    const timeOfDay = chosen ?? (part !== slotDayPart({ id: slot.id }) ? part : undefined);
    // What a Scene doesn't keep (the Day's event wiring, sceneFromDaySlot) stays the board's.
    return {
      ...held,
      id: slot.id,
      ...(timeOfDay ? { timeOfDay } : {}),
      ...(slot.eventMove ? { eventMove: slot.eventMove } : {}),
      ...(slot.sceneHintsDay ? { sceneHintsDay: slot.sceneHintsDay } : {}),
    } as DaySlot;
  });
  const next = normalizeDaySlots(raw, day.dayLength);
  return JSON.stringify(next) === JSON.stringify(slots) ? null : next;
}

/**
 * A Short's board as its short has it (step 4c, 2026-11-08): the moments and stills its Scenes
 * hold, on the board's saved copy — for what reads a Short away from the board (Cut, Play, a
 * Cast's file), so it sees what the board would show, not a copy left behind when the Scenes
 * were edited on Script or Scene. Only when the copy has no edit of its own waiting (its
 * fingerprint is the link's). The script's own text changed since (on Script) doesn't stop it
 * (part 2b, 2026-11-09): the Scenes still hold the moments, and a slim copy (slimDayBoard) has
 * nothing else. The copy as it is otherwise. Pure; the copy itself isn't touched.
 */
export function dayBoardFromShort<
  T extends Pick<
    DayToolCache,
    'slots' | 'stills' | 'dayLength' | 'stillsCharacterId' | 'shortLink' | 'dayMood'
  >,
>(day: T, scenes: readonly SavedScene[]): T {
  const link = day.shortLink;
  if (!link?.scriptId || !link.castId) return day;
  if (dayShortFingerprint(day as DayToolCache) !== link.fingerprint) return day;
  const moments = dayMomentsFromShort(day, scenes, link);
  const withMoments = moments ? { ...day, slots: moments } : day;
  const stills = dayStillsFromShort(withMoments, scenes, link);
  const whole = stills ? { ...withMoments, stills } : withMoments;
  if (whole === day) return day;
  // In step still (Step 5f part 3, 2026-11-10): the link's fingerprint is the board read back,
  // so a page holding it (or a slim copy filled) has no edit waiting that it would write.
  return {
    ...whole,
    shortLink: { ...link, fingerprint: dayShortFingerprint(whole as DayToolCache) },
  };
}

/**
 * The board's copy as a linked Short will save it (step 4c part 2b, 2026-11-09; not saved yet —
 * the release after this one starts, so this one can be rolled back to): each moment with a
 * Scene in its short kept as its id and what a Scene doesn't hold (`eventMove`,
 * `sceneHintsDay`); a moment with no Scene, the order, and every still kept whole. The link's
 * fingerprint is the slim copy's, so dayBoardFromShort (and the board) read it back whole.
 * Null when it can't be slimmed without losing anything: no link, an edit waiting to go into the
 * short, or Scenes that don't say what the board does yet. Pure.
 */
export function slimDayBoard<
  T extends Pick<
    DayToolCache,
    'slots' | 'stills' | 'dayLength' | 'stillsCharacterId' | 'shortLink' | 'dayMood'
  >,
>(day: T, scenes: readonly SavedScene[]): T | null {
  const link = day.shortLink;
  if (!link?.scriptId || !link.castId) return null;
  if (dayShortFingerprint(day as DayToolCache) !== link.fingerprint) return null;
  if (dayMomentsFromShort(day, scenes, link)) return null;
  const held = new Set(
    scenes
      .filter(
        scene =>
          scene.fromScript?.scriptId === link.scriptId &&
          scene.castId === link.castId &&
          scene.fromDaySlot
      )
      .map(scene => scene.fromDaySlot)
  );
  const slots = normalizeDaySlots(day.slots, day.dayLength);
  if (!slots.some(slot => held.has(slot.id))) return null;
  const slim = slots.map(slot =>
    held.has(slot.id)
      ? ({
          id: slot.id,
          ...(slot.eventMove ? { eventMove: slot.eventMove } : {}),
          ...(slot.sceneHintsDay ? { sceneHintsDay: slot.sceneHintsDay } : {}),
        } as DaySlot)
      : slot
  );
  const next = { ...day, slots: slim };
  const whole = dayBoardFromShort(
    { ...next, shortLink: { ...link, fingerprint: dayShortFingerprint(next as DayToolCache) } },
    scenes
  );
  // Read back, it must be the board again — else keep the whole copy.
  if (JSON.stringify(normalizeDaySlots(whole.slots, day.dayLength)) !== JSON.stringify(slots))
    return null;
  return {
    ...next,
    shortLink: { ...link, fingerprint: dayShortFingerprint(next as DayToolCache) },
  };
}

/**
 * The moments where the board and the script both changed the same thing since the short last
 * took the board (Step 5b-ii, 2026-11-09): the heading (place, time), the beat or the lead's
 * line — each to something else. Only then is it asked which goes on; any other mix of edits
 * goes in (the card's into the scene, the script's kept). Their labels; empty: no clash. Pure.
 */
export function shortEditClashes(input: {
  day: Pick<DayToolCache, 'slots' | 'dayLength'>;
  script: Pick<SavedScript, 'id' | 'source' | 'shots' | 'castMap'>;
  scenes: readonly SavedScene[];
  castId: string;
  leadName: string;
}): string[] {
  const flat = (text: string | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const lead = speakerKey(input.leadName);
  const leads = [
    lead,
    ...Object.entries(input.script.castMap ?? {})
      .filter(([, id]) => id === input.castId)
      .map(([speaker]) => speaker.toUpperCase()),
  ];
  const parsed = parseScript(input.script.source);
  const clashes: string[] = [];
  const bySlot = new Map(
    shortMomentsOf(input.script, input.scenes)
      .filter(moment => moment.daySlot)
      .map(moment => [moment.daySlot!, moment])
  );
  for (const slot of momentsOf(input.day)) {
    const moment = bySlot.get(slot.id);
    const scene = moment ? parsed.scenes.find(entry => entry.id === moment.sceneId) : undefined;
    const synced = syncedSlotOf(
      input.scenes.find(
        entry => entry.fromScript?.scriptId === input.script.id && entry.fromDaySlot === slot.id
      )
    );
    if (!scene || !synced) continue;
    const both = (card: string, was: string, written: string) =>
      card !== was && written !== was && card !== written;
    // The beat the board writes for an empty one ("She is here.") is no edit of the script's.
    const placeholder = flat(`${input.leadName.trim() || 'She'} is here.`);
    const action = flat(scene.elements.find(element => element.kind === 'action')?.text);
    const leadLine = flat(
      scene.elements.find(
        element =>
          element.kind === 'dialogue' && leads.includes((element.speaker ?? '').toUpperCase())
      )?.text
    );
    if (
      both(dayMomentHeading(slot), dayMomentHeading(synced), scene.heading) ||
      both(
        flat(slot.sceneHints),
        flat(synced.sceneHints),
        !flat(synced.sceneHints) && action === placeholder ? '' : action
      ) ||
      both(flat(slot.line), flat(synced.line), leadLine)
    )
      clashes.push(slot.label?.trim() || slot.id);
  }
  return clashes;
}
