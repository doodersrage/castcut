/**
 * Scenes — "one shot, exactly as you want it": a one-slot Day without Day's planning. Each Cast
 * keeps a list of scenes; a scene is one shot (setting, beat, pose, camera, look, engine, the
 * people in it, the mood) and the takes rendered of it, one of them kept.
 *
 * The Scene page runs Day's own engine (useDayPlannerToolOrchestration with the `scene` settings
 * key), so its working fields are a Day's — `slots` (one slot), `stills`, the mood fields. This
 * module moves a scene in and out of those fields, records the takes that land, and links scenes
 * with Day (Open as Scene, Send to Day slot) and Cut (the kept takes). Pure.
 */
import type { DayToolCache } from '../play/settings';
import type { KeyedShot } from '../film/cut-plan';
import { migrateDayMoodFields } from './mood-flavor';
import {
  dayStillHasItsFrame,
  dayStillShownImage,
  daySlotDefaultLabel,
  isDaySlotId,
  normalizeDayIntimateMix,
  normalizeDaySlots,
  normalizeDaySlotStills,
  type DayIntimateMix,
  type DayMoodSetting,
  type DaySlot,
  type DaySlotId,
  type DaySlotStill,
} from './planner';
import { normalizeDayWeather, type DayWeather } from './weather';

/** One render of a scene. */
export type SceneTake = {
  /** The take's ComfyUI prompt id (its gallery entry). */
  id: string;
  promptId?: string;
  /** The picture as shown: face-finished or framed when it was. */
  imageUrl: string;
  /** The take as rendered, when {@link imageUrl} is a finish of it. */
  rawUrl?: string;
  /**
   * The take cut to the picked camera shot (a close shot: shot-reframe), when {@link imageUrl}
   * is that cut. Back on the card it stays the cut — not the gallery's full frame, not cut again.
   */
  framedUrl?: string;
  /** Its clip (Animate, Copy moves, the Director), once one landed. */
  clipUrl?: string;
  clipPromptId?: string;
  at: number;
};

export type SavedScene = {
  id: string;
  /** The Cast lead this scene is of. */
  castId: string;
  name: string;
  /** The shot: setting, beat, pose, camera, look, engine, line, group — a Day slot. */
  slot: DaySlot;
  dayMood?: DayMoodSetting;
  intimatePlayful?: boolean;
  intimateMix?: DayIntimateMix;
  allowCompanions?: boolean;
  dayWeather?: DayWeather;
  /** Cast member who plays the second person (unset: an invented stranger). */
  partnerCharacterId?: string;
  /**
   * What she wears in this scene and the plate it is made from (Day's page-wide fields, kept per
   * scene so switching scenes switches them: user request 2026-10-24). Missing: a scene saved
   * before it was kept — opening it keeps what is on the page, which it then records.
   */
  outfit?: SceneOutfit;
  /** Oldest first. */
  takes: SceneTake[];
  /** The take Cut uses and Make it move starts from. */
  keptTakeId?: string;
  /** "Open as Scene": the Day slot it was copied from. */
  fromDaySlot?: DaySlotId;
  /**
   * Takes that had rendered but were still at the adult check when another scene was opened
   * (their prompt ids). The verdict lands on their gallery entry: a pass adds the take here
   * ({@link resolveSceneChecks}), a withheld one is dropped; one not yet checked goes back on the
   * card when the scene opens again, and is checked there.
   */
  checkingTakeIds?: string[];
  createdAt: number;
  updatedAt: number;
};

/**
 * The Scene page's settings (`tools.scene`): Day's working fields for the open scene (the engine
 * reads and writes those), the saved scenes of every Cast, and which one is open.
 */
export type SceneToolCache = DayToolCache & {
  scenes?: SavedScene[];
  activeSceneId?: string;
  /** The scene each Cast had open last (it opens again when the page comes back to them). */
  openByCast?: Record<string, string>;
  /**
   * The jobs the Scene page queued (newest last, at most {@link SCENE_JOB_LOG_LIMIT}): the Queue
   * page labels them "Scene" by id — a scene still is queued like a Day still, and its prompt
   * text says "Day". Kept after a take is dropped or its scene deleted.
   */
  jobLog?: SceneJob[];
};

/** A job the Scene page queued: its take or its clip, and the scene's name then. */
export type SceneJob = { promptId: string; scene: string; kind: 'still' | 'clip' };

export const SCENE_JOB_LOG_LIMIT = 200;

/**
 * The job log with the card's still and clip jobs added (same array when there is nothing new).
 */
export function recordSceneJobs(
  log: ReadonlyArray<SceneJob> | undefined,
  still: Pick<DaySlotStill, 'promptId' | 'clipPromptId' | 'twoTakes'> | undefined,
  sceneName: string
): SceneJob[] {
  const list = Array.isArray(log) ? (log as SceneJob[]) : [];
  const known = new Set(list.map(job => job.promptId));
  const added: SceneJob[] = [];
  const add = (id: string | undefined, kind: SceneJob['kind']) => {
    const promptId = id?.trim();
    if (!promptId || known.has(promptId)) return;
    known.add(promptId);
    added.push({ promptId, scene: sceneName.slice(0, 60) || 'Scene', kind });
  };
  add(still?.promptId, 'still');
  add(still?.twoTakes?.promptId, 'still');
  add(still?.clipPromptId, 'clip');
  return added.length ? [...list, ...added].slice(-SCENE_JOB_LOG_LIMIT) : list;
}

/** Takes kept per scene (the kept take always stays). Older ones stay in the Gallery. */
export const SCENE_TAKE_LIMIT = 24;
/**
 * Scenes kept per Cast. Only empty scenes go to stay under it, the least recently touched first;
 * a scene with a take (or one at the adult check) is never dropped, so a Cast can hold more.
 */
export const SCENE_LIMIT_PER_CAST = 60;
/** A new scene's time of day when nothing says otherwise. */
export const DEFAULT_SCENE_SLOT_ID: DaySlotId = 'afternoon';

/** The mood fields a scene keeps with its shot (Day's working fields while it is open). */
const SCENE_MOOD_FIELDS = [
  'dayMood',
  'intimatePlayful',
  'intimateMix',
  'allowCompanions',
  'dayWeather',
  'partnerCharacterId',
] as const;

type SceneMoodFields = Pick<SavedScene, (typeof SCENE_MOOD_FIELDS)[number]>;

/**
 * Day's page-wide clothing and plate fields a scene keeps: the clothing photo and its words, the
 * shoes, and the plate (the Cast picture stills are made from). The outfit kit is the slot's own.
 */
export const SCENE_OUTFIT_FIELDS = [
  'customGarmentImageUrl',
  'customGarmentImageFilename',
  'customGarmentDescription',
  'footwear',
  'footwearImageUrl',
  'footwearImageFilename',
  'plateImageUrl',
  'plateImageFilename',
  'plateOriginalUrl',
  'plateOriginalFilename',
  'plateCharacterId',
  'plateIsolateSourceKey',
] as const;

export type SceneOutfit = Partial<Record<(typeof SCENE_OUTFIT_FIELDS)[number], string>>;

const OUTFIT_URL_FIELDS = new Set<string>([
  'customGarmentImageUrl',
  'footwearImageUrl',
  'plateImageUrl',
  'plateOriginalUrl',
]);

/** The outfit fields of Day's working settings (or a stored scene's), cleaned. */
export function sceneOutfitOf(input: Record<string, unknown> | null | undefined): SceneOutfit {
  const out: SceneOutfit = {};
  for (const field of SCENE_OUTFIT_FIELDS) {
    const value = OUTFIT_URL_FIELDS.has(field)
      ? storableUrl(input?.[field])
      : text(input?.[field], field === 'customGarmentDescription' ? 2000 : 400);
    if (value) out[field] = value;
  }
  return out;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function time(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** A picture worth keeping in settings — not an inline data URL (demo stills, previews). */
function storableUrl(value: unknown): string {
  const url = text(value, 2048);
  return url && !url.startsWith('data:') && !url.startsWith('blob:') ? url : '';
}

/**
 * The scene's one slot from Day-shaped slots: the first with a real slot id (its time of day),
 * normalised like a Day slot. Nothing usable → an empty afternoon.
 */
export function sceneSlotOf(
  input: ReadonlyArray<DaySlot | null | undefined> | null | undefined
): DaySlot {
  const first = (input ?? []).find(slot => slot && isDaySlotId(slot.id));
  const id = first?.id ?? DEFAULT_SCENE_SLOT_ID;
  // Eight slots hold every slot id, so the one slot is normalised exactly as Day does it.
  const all = normalizeDaySlots(first ? [first] : [], 8);
  return all.find(slot => slot.id === id) ?? { id, label: daySlotDefaultLabel(id) };
}

/**
 * What the Scene engine writes as its slots: one. Day's helpers (mood fit, beat fill) normalize to
 * a whole Day — a single slot came back as four, and the scene's shot turned into the first of
 * them (Intimate on a scene with no beat replaced its setting with a morning's). From a longer
 * list, the slot with the scene's time of day is kept.
 */
export function sceneSlotsPatch(
  next: ReadonlyArray<DaySlot>,
  current: ReadonlyArray<DaySlot | null | undefined> | null | undefined
): DaySlot[] {
  if (next.length <= 1) return [...next];
  const id = sceneSlotOf(current).id;
  return [next.find(slot => slot.id === id) ?? sceneSlotOf(next)];
}

/** The scene slot at another time of day (its plan unchanged). */
export function sceneSlotAt(slot: DaySlot, id: DaySlotId): DaySlot {
  if (slot.id === id) return slot;
  const relabel = !slot.label || slot.label === daySlotDefaultLabel(slot.id);
  return { ...slot, id, label: relabel ? daySlotDefaultLabel(id) : slot.label };
}

function normalizeTake(raw: unknown, now: number): SceneTake | null {
  if (!raw || typeof raw !== 'object') return null;
  const take = raw as Partial<SceneTake>;
  const id = text(take.id, 160);
  const imageUrl = storableUrl(take.imageUrl);
  if (!id || !imageUrl) return null;
  const rawUrl = storableUrl(take.rawUrl);
  const framedUrl = storableUrl(take.framedUrl);
  const clipUrl = storableUrl(take.clipUrl);
  const promptId = text(take.promptId, 160);
  const clipPromptId = text(take.clipPromptId, 160);
  return {
    id,
    ...(promptId ? { promptId } : {}),
    imageUrl,
    ...(rawUrl && rawUrl !== imageUrl ? { rawUrl } : {}),
    ...(framedUrl ? { framedUrl } : {}),
    ...(clipUrl ? { clipUrl } : {}),
    ...(clipUrl && clipPromptId ? { clipPromptId } : {}),
    at: time(take.at, now),
  };
}

/** Takes oldest first, one per id, at most {@link SCENE_TAKE_LIMIT} (the kept one stays). */
function boundedTakes(takes: SceneTake[], keptTakeId: string | undefined): SceneTake[] {
  const byId = new Map<string, SceneTake>();
  for (const take of takes) byId.set(take.id, take);
  const ordered = [...byId.values()].sort((a, b) => a.at - b.at);
  if (ordered.length <= SCENE_TAKE_LIMIT) return ordered;
  const kept = ordered.find(take => take.id === keptTakeId);
  const newest = ordered.filter(take => take !== kept).slice(-(SCENE_TAKE_LIMIT - (kept ? 1 : 0)));
  return kept ? [...newest, kept].sort((a, b) => a.at - b.at) : newest;
}

function moodFieldsOf(
  input: Partial<Record<(typeof SCENE_MOOD_FIELDS)[number], unknown>>
): SceneMoodFields {
  // A scene saved while Raunchy was its own mood opens as Intimate with Playful on.
  const migrated = migrateDayMoodFields({
    dayMood: typeof input.dayMood === 'string' ? input.dayMood : undefined,
    intimatePlayful: input.intimatePlayful === true ? true : undefined,
  });
  const out: SceneMoodFields = {};
  if (migrated.dayMood) out.dayMood = migrated.dayMood as DayMoodSetting;
  if (migrated.intimatePlayful === true) out.intimatePlayful = true;
  if (input.intimateMix !== undefined) out.intimateMix = normalizeDayIntimateMix(input.intimateMix);
  if (input.allowCompanions === true) out.allowCompanions = true;
  const weather = normalizeDayWeather(input.dayWeather);
  if (weather) out.dayWeather = weather;
  const partner = text(input.partnerCharacterId, 120);
  if (partner) out.partnerCharacterId = partner;
  return out;
}

/** Take prompt ids awaiting the adult check: clean, one each, at most two (a take and its pair). */
function checkingIdsField(value: unknown): Pick<SavedScene, 'checkingTakeIds'> {
  const ids = [
    ...new Set((Array.isArray(value) ? value : []).map(id => text(id, 160)).filter(Boolean)),
  ].slice(-2);
  return ids.length ? { checkingTakeIds: ids } : {};
}

/** A stored scene read back (an older or hand-edited copy cleaned), or null when it isn't one. */
export function normalizeSavedScene(raw: unknown, now = Date.now()): SavedScene | null {
  if (!raw || typeof raw !== 'object') return null;
  const scene = raw as Partial<SavedScene>;
  const id = text(scene.id, 80);
  const castId = text(scene.castId, 120);
  if (!id || !castId) return null;
  const takes = (Array.isArray(scene.takes) ? scene.takes : [])
    .map(take => normalizeTake(take, now))
    .filter((take): take is SceneTake => take !== null);
  const kept = text(scene.keptTakeId, 160);
  const keptTakeId = takes.some(take => take.id === kept) ? kept : undefined;
  const createdAt = time(scene.createdAt, now);
  return {
    id,
    castId,
    name: text(scene.name, 60) || 'Scene',
    slot: sceneSlotOf([scene.slot as DaySlot]),
    ...moodFieldsOf(scene as Record<string, unknown>),
    ...(scene.outfit && typeof scene.outfit === 'object'
      ? { outfit: sceneOutfitOf(scene.outfit as Record<string, unknown>) }
      : {}),
    takes: boundedTakes(takes, keptTakeId),
    ...(keptTakeId ? { keptTakeId } : {}),
    ...(scene.fromDaySlot && isDaySlotId(scene.fromDaySlot)
      ? { fromDaySlot: scene.fromDaySlot }
      : {}),
    ...checkingIdsField(scene.checkingTakeIds),
    createdAt,
    updatedAt: time(scene.updatedAt, createdAt),
  };
}

/** A scene that holds renders: a take, or one still at the adult check. */
function sceneHoldsTakes(scene: SavedScene): boolean {
  return scene.takes.length > 0 || Boolean(scene.checkingTakeIds?.length);
}

/**
 * One Cast's scenes under {@link SCENE_LIMIT_PER_CAST}: empty ones go, least recently touched
 * first, but never the newest (a scene just made); scenes with takes always stay (M0 audit D1:
 * the 61st scene used to drop the oldest, kept take, Cut shot and all).
 */
function cappedCastScenes(list: SavedScene[]): SavedScene[] {
  if (list.length <= SCENE_LIMIT_PER_CAST) return list;
  const newest = list.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
  const droppable = list
    .filter(scene => scene !== newest && !sceneHoldsTakes(scene))
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const drop = new Set(droppable.slice(0, list.length - SCENE_LIMIT_PER_CAST));
  return drop.size ? list.filter(scene => !drop.has(scene)) : list;
}

/**
 * Every stored scene, cleaned: one per id, and per Cast at most {@link SCENE_LIMIT_PER_CAST}
 * unless the scenes over it hold takes.
 */
export function normalizeSavedScenes(input: unknown, now = Date.now()): SavedScene[] {
  const byId = new Map<string, SavedScene>();
  for (const raw of Array.isArray(input) ? input : []) {
    const scene = normalizeSavedScene(raw, now);
    if (scene) byId.set(scene.id, scene);
  }
  const perCast = new Map<string, SavedScene[]>();
  for (const scene of byId.values()) {
    perCast.set(scene.castId, [...(perCast.get(scene.castId) ?? []), scene]);
  }
  return [...perCast.values()].flatMap(list =>
    cappedCastScenes(list).sort((a, b) => a.createdAt - b.createdAt)
  );
}

/** One Cast's scenes, newest first. */
export function scenesForCast(
  scenes: ReadonlyArray<SavedScene> | undefined,
  castId: string
): SavedScene[] {
  const id = castId.trim();
  if (!id) return [];
  return (scenes ?? [])
    .filter(scene => scene.castId === id)
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
}

/** "Scene 3" — the next free number among the Cast's scenes. */
export function nextSceneName(
  scenes: ReadonlyArray<SavedScene> | undefined,
  castId: string
): string {
  const taken = new Set(scenesForCast(scenes, castId).map(scene => scene.name));
  for (let n = 1; n < 1000; n += 1) {
    if (!taken.has(`Scene ${n}`)) return `Scene ${n}`;
  }
  return 'Scene';
}

/** What a scene shows as in a list: its name, then where and what. */
export function sceneSummary(scene: SavedScene): string {
  const where = scene.slot.location?.trim();
  const what = scene.slot.sceneHints?.trim();
  return [where, what].filter(Boolean).join(' · ').slice(0, 140);
}

export function newSceneId(now = Date.now()): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `scene-${now.toString(36)}-${random}`;
}

/** A new scene for a Cast. */
export function createScene(input: {
  castId: string;
  name: string;
  id?: string;
  slot?: DaySlot;
  mood?: Partial<Record<(typeof SCENE_MOOD_FIELDS)[number], unknown>>;
  /** What she wears and the plate (a new scene starts dressed as the page is). */
  outfit?: Record<string, unknown>;
  takes?: SceneTake[];
  fromDaySlot?: DaySlotId;
  now?: number;
}): SavedScene {
  const now = input.now ?? Date.now();
  return {
    id: input.id ?? newSceneId(now),
    castId: input.castId.trim(),
    name: input.name.trim().slice(0, 60) || 'Scene',
    slot: sceneSlotOf(input.slot ? [input.slot] : []),
    ...moodFieldsOf(input.mood ?? {}),
    ...(input.outfit ? { outfit: sceneOutfitOf(input.outfit) } : {}),
    takes: boundedTakes(input.takes ?? [], undefined),
    ...(input.fromDaySlot ? { fromDaySlot: input.fromDaySlot } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function keptTakeOf(scene: SavedScene | null | undefined): SceneTake | undefined {
  return scene?.keptTakeId ? scene.takes.find(take => take.id === scene.keptTakeId) : undefined;
}

/** A take as the slot's still (completed, its clip with it). */
export function takeAsStill(slotId: DaySlotId, take: SceneTake): DaySlotStill {
  // Shown as cut to its camera shot: the card keeps the cut (Day's gallery sync keeps a still's
  // own finish, and the reframe does not run again on a still that has its frame).
  const framed = Boolean(take.framedUrl && take.promptId);
  const finished = (take.rawUrl && take.imageUrl !== take.rawUrl) || framed;
  return {
    slotId,
    ...(take.promptId ? { promptId: take.promptId, restoredFor: take.promptId } : {}),
    imageUrl: framed ? (take.framedUrl ?? take.imageUrl) : take.rawUrl || take.imageUrl,
    status: 'completed',
    ...(finished && take.promptId
      ? { finishedUrl: take.imageUrl, finishedFor: take.promptId }
      : {}),
    ...(framed ? { framedUrl: take.framedUrl } : {}),
    ...(take.clipUrl
      ? {
          clipUrl: take.clipUrl,
          clipStatus: 'completed' as const,
          ...(take.clipPromptId ? { clipPromptId: take.clipPromptId } : {}),
        }
      : {}),
  };
}

/**
 * The Day working fields for an open scene: its slot, its mood, and on the board the kept take
 * (else the newest). The partner's invented face belongs to the last scene, so it goes.
 */
export function sceneWorkingPatch(scene: SavedScene): Partial<SceneToolCache> {
  const shown = keptTakeOf(scene) ?? scene.takes.at(-1);
  // A take left at the adult check comes back on the card, held, and is checked there.
  const [checking, checkingPair] = scene.checkingTakeIds ?? [];
  const stills: DaySlotStill[] = checking
    ? [
        {
          slotId: scene.slot.id,
          promptId: checking,
          status: 'running',
          adultHold: 'checking',
          ...(checkingPair
            ? { twoTakes: { promptId: checkingPair, status: 'running', adultHold: 'checking' } }
            : {}),
        },
      ]
    : shown
      ? [takeAsStill(scene.slot.id, shown)]
      : [];
  const patch: Partial<SceneToolCache> = {
    activeSceneId: scene.id,
    slots: [scene.slot],
    stills,
    stillsCharacterId: scene.castId,
    partnerStandIn: undefined,
    partnerSentFace: undefined,
  };
  for (const field of SCENE_MOOD_FIELDS) {
    (patch as Record<string, unknown>)[field] = scene[field];
  }
  // Dressed as the scene was, on its plate (an older scene that never kept it: as the page is).
  if (scene.outfit) {
    for (const field of SCENE_OUTFIT_FIELDS) {
      (patch as Record<string, unknown>)[field] = scene.outfit[field];
    }
  }
  return patch;
}

/** The working fields with no scene open. */
export const NO_SCENE_PATCH: Partial<SceneToolCache> = {
  activeSceneId: undefined,
  slots: undefined,
  stills: [],
  stillsCharacterId: undefined,
  partnerStandIn: undefined,
  partnerSentFace: undefined,
};

/** The takes a slot's still holds now: the shown take, and the second of two takes. */
function takesOfStill(still: DaySlotStill | undefined, now: number): SceneTake[] {
  if (!still || still.status !== 'completed' || still.adultHold) return [];
  const out: SceneTake[] = [];
  const promptId = still.promptId?.trim();
  const raw = storableUrl(still.imageUrl);
  // The shown picture is the finish only while it is this take's (dayStillShownImage).
  const shown = storableUrl(dayStillShownImage(still));
  if (promptId && shown) {
    const clipUrl = still.clipStatus === 'completed' ? storableUrl(still.clipUrl) : '';
    // Its own cut only: a still keeps an older take's frame until the next cut.
    const framed = dayStillHasItsFrame(still) ? storableUrl(still.framedUrl) : '';
    out.push({
      id: promptId,
      promptId,
      imageUrl: shown,
      ...(raw && raw !== shown ? { rawUrl: raw } : {}),
      ...(framed ? { framedUrl: framed } : {}),
      ...(clipUrl ? { clipUrl } : {}),
      ...(clipUrl && still.clipPromptId ? { clipPromptId: still.clipPromptId } : {}),
      at: now,
    });
  }
  const second = still.twoTakes;
  const secondUrl = storableUrl(second?.imageUrl);
  if (second?.promptId && secondUrl && second.status === 'completed' && !second.adultHold) {
    out.push({ id: second.promptId, promptId: second.promptId, imageUrl: secondUrl, at: now });
  }
  return out;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The open scene with what the Day engine holds now: its slot as edited, its mood, and any take
 * that landed (a take already listed keeps its place and picks up its finish or clip). The same
 * object when nothing changed, so a caller can skip the write.
 */
export function recordSceneFromWorking(
  scene: SavedScene,
  working: Partial<SceneToolCache>,
  now = Date.now()
): SavedScene {
  const slot = sceneSlotOf(working.slots);
  const mood = moodFieldsOf(working as Record<string, unknown>);
  const stills = normalizeDaySlotStills(working.stills);
  const landed = takesOfStill(
    stills.find(still => still.slotId === slot.id),
    now
  );
  let takes = scene.takes;
  for (const take of landed) {
    const index = takes.findIndex(entry => entry.id === take.id);
    if (index < 0) {
      takes = [...takes, take];
    } else {
      const merged = { ...takes[index]!, ...take, at: takes[index]!.at };
      // A clip stays with its take when the still moves on to a new one.
      if (!take.clipUrl && takes[index]!.clipUrl) {
        merged.clipUrl = takes[index]!.clipUrl;
        if (takes[index]!.clipPromptId) merged.clipPromptId = takes[index]!.clipPromptId;
      }
      if (!sameJson(merged, takes[index])) {
        takes = takes.map((entry, at) => (at === index ? merged : entry));
      }
    }
  }
  takes = takes === scene.takes ? takes : boundedTakes(takes, scene.keptTakeId);
  const moodNow: SceneMoodFields = {};
  for (const field of SCENE_MOOD_FIELDS) {
    if (scene[field] !== undefined) (moodNow as Record<string, unknown>)[field] = scene[field];
  }
  // What she wears and the plate, as the page has them now.
  const outfit = sceneOutfitOf(working as Record<string, unknown>);
  if (
    sameJson(slot, scene.slot) &&
    sameJson(mood, moodNow) &&
    // (Nothing worn but the defaults is the same as an older scene's none recorded.)
    sameJson(outfit, scene.outfit ?? {}) &&
    takes === scene.takes
  ) {
    return scene;
  }
  const {
    dayMood: _a,
    intimatePlayful: _b,
    intimateMix: _c,
    allowCompanions: _d,
    dayWeather: _e,
    partnerCharacterId: _f,
    ...rest
  } = scene;
  return { ...rest, ...mood, outfit, slot, takes, updatedAt: now };
}

/** Keep `takeId` (Cut uses it, Make it move starts from it); keeping it again lets it go. */
export function keepSceneTake(scene: SavedScene, takeId: string, now = Date.now()): SavedScene {
  if (!scene.takes.some(take => take.id === takeId)) return scene;
  const { keptTakeId: _kept, ...rest } = scene;
  return scene.keptTakeId === takeId
    ? { ...rest, updatedAt: now }
    : { ...rest, keptTakeId: takeId, updatedAt: now };
}

/** Drop a take from the scene (it stays in the Gallery). */
export function removeSceneTake(scene: SavedScene, takeId: string, now = Date.now()): SavedScene {
  if (!scene.takes.some(take => take.id === takeId)) return scene;
  const { keptTakeId, ...rest } = scene;
  return {
    ...rest,
    takes: scene.takes.filter(take => take.id !== takeId),
    ...(keptTakeId && keptTakeId !== takeId ? { keptTakeId } : {}),
    updatedAt: now,
  };
}

export function upsertScene(
  scenes: ReadonlyArray<SavedScene> | undefined,
  scene: SavedScene
): SavedScene[] {
  const list = [...(scenes ?? [])];
  const index = list.findIndex(entry => entry.id === scene.id);
  if (index < 0) return [...list, scene];
  list[index] = scene;
  return list;
}

export function removeScene(
  scenes: ReadonlyArray<SavedScene> | undefined,
  id: string
): SavedScene[] {
  return (scenes ?? []).filter(scene => scene.id !== id);
}

/** The open scene, saved with the working fields (same list when nothing changed). */
export function scenesWithWorking(cache: SceneToolCache, now = Date.now()): SavedScene[] | null {
  const scenes = cache.scenes ?? [];
  const active = scenes.find(scene => scene.id === cache.activeSceneId);
  if (!active) return null;
  let recorded = recordSceneFromWorking(active, cache, now);
  // A take still at the adult check goes with its scene (resolveSceneChecks adds it on a pass).
  const checking = checkingTakeIdsOf(
    normalizeDaySlotStills(cache.stills).find(still => still.slotId === recorded.slot.id)
  );
  if (checking.length) {
    recorded = {
      ...recorded,
      ...checkingIdsField([...(recorded.checkingTakeIds ?? []), ...checking]),
    };
  }
  return recorded === active ? null : upsertScene(scenes, recorded);
}

/** The card's takes the adult check holds now (rendered, not yet passed or withheld). */
export function checkingTakeIdsOf(still: DaySlotStill | undefined): string[] {
  if (!still) return [];
  return [
    still.adultHold === 'checking' ? still.promptId?.trim() : '',
    still.twoTakes?.adultHold === 'checking' ? still.twoTakes.promptId.trim() : '',
  ].filter((id): id is string => Boolean(id));
}

/**
 * The card is busy: a take (or its pair) is rendering, or is held at the adult check. `rendering`
 * blocks opening another scene (the job's take would land on the wrong one); `checking` alone
 * does not — the take goes with its scene ({@link scenesWithWorking}).
 */
export function sceneCardBusy(still: DaySlotStill | undefined): {
  rendering: boolean;
  checking: boolean;
} {
  const live = (status: string | undefined) => status === 'queued' || status === 'running';
  const rendering =
    (live(still?.status) && still?.adultHold !== 'checking') ||
    (live(still?.twoTakes?.status) && still?.twoTakes?.adultHold !== 'checking');
  return { rendering: Boolean(rendering), checking: checkingTakeIdsOf(still).length > 0 };
}

/** What the gallery says of a take: enough to settle its adult check. */
export type SceneCheckGalleryEntry = {
  promptId?: string;
  status?: string;
  imageUrl?: string | null;
  adultCheck?: { state?: string } | null;
};

/**
 * A scene's takes that were left at the adult check, settled from the gallery: a passed (or
 * unchecked) take with its picture is added to the scene, a withheld, failed or missing one is
 * dropped, one still waiting stays. Each verdict goes to the scene whose take it is (by prompt
 * id) — never the open one. The same object when nothing settled.
 */
export function resolveSceneChecks(
  scene: SavedScene,
  gallery: ReadonlyArray<SceneCheckGalleryEntry>,
  now = Date.now()
): SavedScene {
  const ids = scene.checkingTakeIds ?? [];
  if (!ids.length) return scene;
  let takes = scene.takes;
  const waiting: string[] = [];
  for (const id of ids) {
    const entry = gallery.find(item => item.promptId?.trim() === id);
    const state = entry?.adultCheck?.state;
    // Not settled yet: still rendering, or its check not done (a pass or a withhold settles it).
    if (
      entry &&
      entry.status !== 'error' &&
      (entry.status !== 'completed' || state === 'pending')
    ) {
      waiting.push(id);
      continue;
    }
    const imageUrl = storableUrl(entry?.imageUrl);
    const passed = entry?.status === 'completed' && state !== 'withheld' && imageUrl;
    if (passed && !takes.some(take => take.id === id)) {
      takes = [...takes, { id, promptId: id, imageUrl, at: now }];
    }
  }
  if (waiting.length === ids.length) return scene;
  const { checkingTakeIds: _ids, ...rest } = scene;
  return {
    ...rest,
    ...checkingIdsField(waiting),
    takes: takes === scene.takes ? takes : boundedTakes(takes, scene.keptTakeId),
    updatedAt: now,
  };
}

/**
 * The Scene page after the active Cast changes: the open scene is saved, and the next Cast's
 * newest scene opens (none: the page waits for New scene). Like Day's swapDayForCast, fields it
 * does not own (the plate) are the caller's to clear.
 */
export function swapSceneForCast(
  cache: SceneToolCache,
  nextCast: string,
  now = Date.now()
): Partial<SceneToolCache> {
  const saved = scenesWithWorking(cache, now) ?? cache.scenes ?? [];
  const mine = scenesForCast(saved, nextCast);
  // The scene they had open last, else their newest.
  const last = cache.openByCast?.[nextCast];
  const next = mine.find(scene => scene.id === last) ?? mine[0];
  const scenes = next ? withOpenedScene(saved, next) : saved;
  return {
    ...(scenes !== cache.scenes ? { scenes } : {}),
    ...(next ? { ...sceneWorkingPatch(next), openByCast: openFor(cache, next) } : NO_SCENE_PATCH),
  };
}

/**
 * The scene list as `scene` opens: its takes left at the adult check go back on the card
 * (sceneWorkingPatch), so they come off its list (same list when it had none).
 */
function withOpenedScene(scenes: SavedScene[], scene: SavedScene): SavedScene[] {
  if (!scene.checkingTakeIds) return scenes;
  const { checkingTakeIds: _ids, ...opened } = scene;
  return upsertScene(scenes, opened);
}

/** Open another of the Cast's scenes: the open one saved first. */
export function openScenePatch(
  cache: SceneToolCache,
  sceneId: string,
  now = Date.now()
): Partial<SceneToolCache> | null {
  const saved = scenesWithWorking(cache, now) ?? cache.scenes ?? [];
  const scene = saved.find(entry => entry.id === sceneId);
  if (!scene) return null;
  const scenes = withOpenedScene(saved, scene);
  return {
    ...(scenes !== cache.scenes ? { scenes } : {}),
    ...sceneWorkingPatch(scene),
    openByCast: openFor(cache, scene),
  };
}

/** Add `scene` and open it (the open one saved first). */
export function addScenePatch(
  cache: SceneToolCache,
  scene: SavedScene,
  now = Date.now()
): Partial<SceneToolCache> {
  const saved = scenesWithWorking(cache, now) ?? cache.scenes ?? [];
  return {
    scenes: normalizeSavedScenes(upsertScene(saved, scene), now),
    ...sceneWorkingPatch(scene),
    openByCast: openFor(cache, scene),
  };
}

/** The open-scene map with `scene` as its Cast's open one. */
function openFor(
  cache: Pick<SceneToolCache, 'openByCast'>,
  scene: Pick<SavedScene, 'id' | 'castId'>
): Record<string, string> {
  return { ...(cache.openByCast ?? {}), [scene.castId]: scene.id };
}

/** Delete a scene; when it was open, the Cast's next newest opens (or none). */
export function deleteScenePatch(cache: SceneToolCache, sceneId: string): Partial<SceneToolCache> {
  const target = cache.scenes?.find(scene => scene.id === sceneId);
  const scenes = removeScene(cache.scenes, sceneId);
  if (cache.activeSceneId !== sceneId) return { scenes };
  const next = target ? scenesForCast(scenes, target.castId)[0] : undefined;
  return {
    scenes: next ? withOpenedScene(scenes, next) : scenes,
    ...(next ? { ...sceneWorkingPatch(next), openByCast: openFor(cache, next) } : NO_SCENE_PATCH),
  };
}

/** Day-shaped settings a Day slot is copied from (the live Day, or one parked under a Cast). */
type DaySource = Pick<
  DayToolCache,
  'slots' | 'stills' | 'dayLength' | 'stillsCharacterId' | (typeof SCENE_MOOD_FIELDS)[number]
>;

/**
 * "Open as Scene": a new scene from a Day slot — its plan and the Day's mood and partner, and the
 * slot's finished still as the first take (not kept: the scene's takes are picked on the page).
 */
export function sceneFromDaySlot(input: {
  day: DaySource;
  slotId: DaySlotId;
  castId: string;
  name: string;
  now?: number;
  id?: string;
}): SavedScene | null {
  const slots = normalizeDaySlots(input.day.slots, input.day.dayLength);
  const slot = slots.find(entry => entry.id === input.slotId);
  if (!slot || !input.castId.trim()) return null;
  const now = input.now ?? Date.now();
  const still = normalizeDaySlotStills(input.day.stills).find(entry => entry.slotId === slot.id);
  const owner = input.day.stillsCharacterId?.trim();
  const takes = !owner || owner === input.castId.trim() ? takesOfStill(still, now) : [];
  // Day's event / episode wiring belongs to the Day, not to one shot.
  const { eventMove: _eventMove, sceneHintsDay: _sceneHintsDay, ...shot } = slot;
  return createScene({
    castId: input.castId,
    name: input.name,
    id: input.id,
    slot: shot,
    mood: input.day as Record<string, unknown>,
    // Dressed as the Day is, on its plate.
    outfit: input.day as Record<string, unknown>,
    takes,
    fromDaySlot: slot.id,
    now,
  });
}

/** The scene's shot as a patch on a Day slot (its time-of-day id and label stay the slot's). */
export function daySlotPatchFromScene(scene: SavedScene): Partial<DaySlot> {
  const { id: _id, label: _label, ...shot } = scene.slot;
  // Every field of the shot, unset ones included, so the Day slot ends up exactly as the scene.
  const keys: Array<keyof DaySlot> = [
    'wardrobeId',
    'wardrobeAuto',
    'location',
    'sceneHints',
    'sceneHintsTyped',
    'poseLayout',
    'poseVariant',
    'posePhoto',
    'poseCamera',
    'poseLead',
    'poseLook',
    'lookId',
    'engine',
    'outfitByHand',
    'line',
    'lineFullFrame',
    'lineTone',
    'replyLine',
    'thirdCastId',
    'fourthCastId',
    'lineLanguage',
    'lineOriginal',
    'replyOriginal',
    'narration',
  ];
  const patch: Partial<DaySlot> = {};
  for (const key of keys)
    (patch as Record<string, unknown>)[key] = (shot as Record<string, unknown>)[key];
  return patch;
}

/**
 * "Send to Day slot": the scene's shot on one of the Cast's Day slots, and its kept take as that
 * slot's still (the still it replaces stays as the previous take — "Keep the old take" brings it
 * back). The Cast's Day is the live one when it is theirs, else the one parked under them.
 */
export function sendSceneToDayPatch(
  day: DayToolCache,
  scene: SavedScene,
  slotId: DaySlotId,
  activeCastId: string,
  now = Date.now()
): { patch: Partial<DayToolCache> } | { error: string } {
  const owner = day.stillsCharacterId?.trim() || activeCastId.trim();
  const live = owner === scene.castId;
  const parked = live ? undefined : day.parkedDays?.[scene.castId];
  if (!live && !parked) {
    return { error: 'This Cast has no Day yet — open Day with them first, then send the scene.' };
  }
  const source = live ? day : parked!;
  const slots = normalizeDaySlots(source.slots, source.dayLength);
  if (!slots.some(slot => slot.id === slotId)) {
    return { error: 'That Day has no such slot.' };
  }
  const shot = daySlotPatchFromScene(scene);
  const nextSlots = slots.map(slot => (slot.id === slotId ? { ...slot, ...shot } : slot));
  const kept = keptTakeOf(scene);
  let stills = normalizeDaySlotStills(source.stills, nextSlots);
  if (kept) {
    const before = stills.find(still => still.slotId === slotId);
    const beforeUrl = dayStillShownImage(before);
    const next: DaySlotStill = {
      ...takeAsStill(slotId, kept),
      ...(before?.status === 'completed' && beforeUrl && beforeUrl !== kept.imageUrl
        ? {
            previousTake: {
              imageUrl: beforeUrl,
              ...(before.promptId ? { promptId: before.promptId } : {}),
            },
          }
        : {}),
    };
    stills = [...stills.filter(still => still.slotId !== slotId), next];
  }
  const fields = {
    slots: nextSlots,
    ...(kept ? { stills } : {}),
  };
  if (live) {
    return {
      patch: { ...fields, ...(kept ? { stillsCharacterId: scene.castId } : {}) },
    };
  }
  return {
    patch: {
      parkedDays: {
        ...(day.parkedDays ?? {}),
        [scene.castId]: { ...parked!, ...fields, at: now },
      },
    },
  };
}

/** The Day slots a scene can be sent to (the Cast's Day: live or parked), for the picker. */
export function daySlotsForScene(
  day: DayToolCache,
  castId: string,
  activeCastId: string
): DaySlot[] {
  const owner = day.stillsCharacterId?.trim() || activeCastId.trim();
  if (owner === castId) return normalizeDaySlots(day.slots, day.dayLength);
  const parked = day.parkedDays?.[castId];
  return parked ? normalizeDaySlots(parked.slots, parked.dayLength) : [];
}

/**
 * Cut's Scenes source: each of the Cast's scenes with a kept take, oldest scene first — the kept
 * take's clip when it has one, else the still. Keys are the scene ids (Cut prefixes them).
 */
export function sceneCutShots(
  scenes: ReadonlyArray<SavedScene> | undefined,
  castId: string,
  stillHoldSec = 3
): KeyedShot[] {
  const id = castId.trim();
  if (!id) return [];
  return (scenes ?? [])
    .filter(scene => scene.castId === id)
    .sort((a, b) => a.createdAt - b.createdAt)
    .flatMap((scene): KeyedShot[] => {
      const take = keptTakeOf(scene);
      if (!take) return [];
      const caption = scene.slot.sceneHints?.trim() || scene.name;
      const spoken = scene.slot.line?.trim()
        ? scene.slot.replyLine?.trim()
          ? `${scene.slot.line.trim()} — ${scene.slot.replyLine.trim()}`
          : scene.slot.line.trim()
        : '';
      return take.clipUrl
        ? [
            {
              key: scene.id,
              title: scene.name,
              caption,
              url: take.clipUrl,
              kind: 'clip',
              thumbUrl: take.imageUrl,
              entryId: take.clipPromptId || `${scene.id}-clip`,
              ...(spoken ? { spoken } : {}),
            },
          ]
        : [
            {
              key: scene.id,
              title: scene.name,
              caption,
              url: take.imageUrl,
              kind: 'still',
              holdSec: stillHoldSec,
              entryId: take.promptId || scene.id,
            },
          ];
    });
}

/** The mood fields a Cast file carries with a scene (not the partner: another Cast). */
const FILE_MOOD_FIELDS = [
  'dayMood',
  'intimatePlayful',
  'intimateMix',
  'allowCompanions',
  'dayWeather',
] as const;

/**
 * A scene as a Cast file carries it: the shot and its mood, not the takes (they are renders on
 * this install, like Day's stills) nor the partner (another Cast, maybe not on the other install).
 */
export type CastFileScene = Pick<
  SavedScene,
  'name' | 'slot' | (typeof FILE_MOOD_FIELDS)[number]
> & {
  createdAt?: number;
  /** The clothing and shoes (not the plate: it names this install's Cast). */
  outfit?: SceneOutfit;
};

/** The outfit fields a Cast file carries: clothing and shoes, not the plate. */
function fileOutfitOf(outfit: SceneOutfit | undefined): SceneOutfit | undefined {
  if (!outfit) return undefined;
  const out: SceneOutfit = {};
  for (const field of SCENE_OUTFIT_FIELDS) {
    if (!field.startsWith('plate') && outfit[field]) out[field] = outfit[field];
  }
  return out;
}

function fileSceneOf(scene: SavedScene): CastFileScene {
  const out: CastFileScene = { name: scene.name, slot: scene.slot, createdAt: scene.createdAt };
  for (const field of FILE_MOOD_FIELDS) {
    if (scene[field] !== undefined) (out as Record<string, unknown>)[field] = scene[field];
  }
  const outfit = fileOutfitOf(scene.outfit);
  if (outfit) out.outfit = outfit;
  return out;
}

/** One Cast's scenes for its Cast file, oldest first. */
export function castFileScenes(
  scenes: ReadonlyArray<SavedScene> | undefined,
  castId: string
): CastFileScene[] {
  return scenesForCast(scenes, castId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(fileSceneOf);
}

/** A Cast file's scenes read back (cleaned; anything that isn't one dropped). */
export function parseCastFileScenes(input: unknown): CastFileScene[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw, index): CastFileScene[] => {
    if (!raw || typeof raw !== 'object' || !(raw as { slot?: unknown }).slot) return [];
    const { partnerCharacterId: _partner, ...rest } = raw as Record<string, unknown>;
    const scene = normalizeSavedScene({ ...rest, id: `file-${index}`, castId: 'file', takes: [] });
    return scene ? [fileSceneOf(scene)] : [];
  });
}

/** An imported Cast's scenes, as this install's: new ids, the Cast's id here, no takes yet. */
export function placeImportedScenes(
  fileScenes: ReadonlyArray<CastFileScene>,
  castId: string,
  now = Date.now()
): SavedScene[] {
  return fileScenes.map((entry, index) =>
    createScene({
      castId,
      name: entry.name,
      slot: entry.slot,
      mood: entry as Record<string, unknown>,
      ...(entry.outfit ? { outfit: fileOutfitOf(sceneOutfitOf(entry.outfit)) } : {}),
      // Their order kept: made one after another.
      now: now + index,
    })
  );
}
