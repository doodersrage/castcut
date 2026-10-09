/**
 * Day → Story: "Continue as a story" opens Story for the same Cast, primed to pick up tonight —
 * the Day's last setting as the story's setting, the Day's mood as its tone / rating, and the
 * outfit the Day was in as its wardrobe. Nothing is written; the player rolls the first beat.
 * Pure (types only from the Day / Story modules) so the Story bundle stays light.
 */

import { realKitId } from './outfit-handoff';
import type { DaySlot, DaySlotStill } from './day-planner';
import type { RoleplayContentId, RoleplayStoryBeat, RoleplayTone } from './roleplay';
import type { DayToolCache, RoleplayToolCache } from './play-settings';

/** One Cast's Day: the live Day when it owns it, else the Day parked under it. */
export type CastDayPlan = Pick<
  DayToolCache,
  'slots' | 'stills' | 'dayMood' | 'dayWeather' | 'intimateMix'
> & {
  /** The live Day (BYO clothing / footwear live only there; a parked Day has none). */
  live: boolean;
};

/**
 * The Cast's Day from the Day tool cache. Owner = `stillsCharacterId`, else the active Cast
 * (same rule as the Cast file export).
 */
export function castDayPlan(
  day: DayToolCache | null | undefined,
  characterId: string,
  activeCharacterId?: string | null
): CastDayPlan | null {
  const id = characterId.trim();
  if (!day || !id) return null;
  const owner = day.stillsCharacterId?.trim() || activeCharacterId?.trim() || '';
  if (owner === id) {
    return {
      live: true,
      slots: day.slots,
      stills: day.stills,
      dayMood: day.dayMood,
      dayWeather: day.dayWeather,
      intimateMix: day.intimateMix,
    };
  }
  const parked = day.parkedDays?.[id];
  if (!parked) return null;
  return {
    live: false,
    slots: parked.slots,
    stills: parked.stills,
    dayMood: parked.dayMood,
    dayWeather: parked.dayWeather,
    intimateMix: parked.intimateMix,
  };
}

/**
 * Where the Day ended: the last slot (in slot order) with a finished still, else the last slot
 * with a setting, else the last slot.
 */
export function lastDaySlot(
  slots: DaySlot[] | null | undefined,
  stills: DaySlotStill[] | null | undefined
): DaySlot | null {
  const list = slots ?? [];
  if (list.length === 0) return null;
  const done = new Set(
    (stills ?? [])
      .filter(still => still.status === 'completed' && Boolean(still.imageUrl?.trim()))
      .map(still => still.slotId)
  );
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (done.has(list[index]!.id)) return list[index]!;
  }
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index]!.location?.trim()) return list[index]!;
  }
  return list[list.length - 1]!;
}

const WEATHER_CLAUSE: Record<string, string> = {
  rain: 'rain against the windows',
  snow: 'snow falling outside',
  autumn: 'a cool autumn night',
  summer: 'a warm summer night',
};

/** Day mood (or Everyday theme) → Story tone and rating. Adult ratings stay gated by Story. */
const MOOD_TO_STORY: Record<string, { tone: RoleplayTone; content: RoleplayContentId }> = {
  everyday: { tone: 'cozy', content: 'pg13' },
  suggestive: { tone: 'romantic', content: 'suggestive' },
  sport: { tone: 'cinematic', content: 'pg13' },
  vacation: { tone: 'dreamy', content: 'pg13' },
  intimate: { tone: 'romantic', content: 'sultry' },
  raunchy: { tone: 'silly', content: 'raunchy' },
  'date-night': { tone: 'romantic', content: 'suggestive' },
  'night-out': { tone: 'cinematic', content: 'pg13' },
  'lazy-sunday': { tone: 'cozy', content: 'pg13' },
  photoshoot: { tone: 'cinematic', content: 'pg13' },
  cosplay: { tone: 'silly', content: 'pg13' },
};

export type DayStorySeed = Pick<
  RoleplayToolCache,
  | 'setting'
  | 'tone'
  | 'content'
  | 'wardrobeId'
  | 'customGarmentImageUrl'
  | 'customGarmentImageFilename'
  | 'customGarmentDescription'
  | 'footwear'
  | 'footwearImageUrl'
  | 'footwearImageFilename'
>;

/** Story's setting line: the Day's last place, later that night (plus the Day's weather). */
export function storySettingFromDaySlot(
  slot: Pick<DaySlot, 'location'> | null | undefined,
  weather?: string | null
): string {
  const place = slot?.location?.trim().replace(/[.,;\s]+$/, '') ?? '';
  if (!place) return '';
  const clause = weather ? WEATHER_CLAUSE[weather] : undefined;
  return [place, 'later that night', clause].filter(Boolean).join(', ').slice(0, 240);
}

/**
 * Story fields that carry the Cast's Day into tonight's story. Null when the Cast has no Day.
 * Wardrobe: the active (locked) outfit, else the last slot's kit; the live Day's own clothing
 * and footwear photos ride along when it has them.
 */
export function storySeedFromDay(input: {
  day: DayToolCache | null | undefined;
  characterId: string;
  activeCharacterId?: string | null;
  lockedWardrobeId?: string | null;
}): DayStorySeed | null {
  const plan = castDayPlan(input.day, input.characterId, input.activeCharacterId);
  if (!plan) return null;
  const slot = lastDaySlot(plan.slots, plan.stills);
  const seed: DayStorySeed = {};
  const setting = storySettingFromDaySlot(slot, plan.dayWeather);
  if (setting) seed.setting = setting;
  const mood = typeof plan.dayMood === 'string' ? plan.dayMood.trim().toLowerCase() : '';
  const story = MOOD_TO_STORY[mood || 'everyday'];
  if (story) {
    seed.tone = story.tone;
    seed.content = story.content;
  }
  const wardrobeId = realKitId(input.lockedWardrobeId) || realKitId(slot?.wardrobeId);
  if (wardrobeId) seed.wardrobeId = wardrobeId;
  const day = input.day;
  if (plan.live && day) {
    if (day.customGarmentImageUrl?.trim()) {
      seed.customGarmentImageUrl = day.customGarmentImageUrl;
      seed.customGarmentImageFilename = day.customGarmentImageFilename;
      seed.customGarmentDescription = day.customGarmentDescription;
    }
    if (day.footwear?.trim()) seed.footwear = day.footwear;
    if (day.footwearImageUrl?.trim()) {
      seed.footwearImageUrl = day.footwearImageUrl;
      seed.footwearImageFilename = day.footwearImageFilename;
    }
  }
  return seed;
}

/** The picture a Day slot shows: its finish when that belongs to the shown take, else the take. */
function dayShownImage(still: DaySlotStill): string {
  const finished = still.finishedUrl?.trim();
  if (finished && still.finishedFor && still.finishedFor === still.promptId) return finished;
  return still.imageUrl?.trim() || '';
}

const PART_TITLES: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

/** "morning-2" → "Late morning"; "evening" → "Evening". */
function dayPartTitle(slotId: string): string {
  const [part, extra] = slotId.split('-');
  const title = PART_TITLES[part ?? ''] ?? 'Earlier';
  return extra ? `Late ${title.toLowerCase()}` : title;
}

/** Day's own beat words that are instructions to the renderer, not story ("— Cast alone"). */
function storyBlurbFromBeat(beat: string): string {
  return beat
    .replace(
      /\s*[—–-]\s*(?:Cast alone|never invent a partner|one adult only|empty sheets|alone|both adults fully visible|two adults mid-contact|two heads in frame)[^—–]*$/i,
      ''
    )
    .replace(/\bCast\b/g, 'she')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The Day as the story's opening scenes: each slot with a finished still (in Day order) becomes
 * a scene with that still, so the story picks up from what happened and its scene writer (which
 * reads the story so far) continues from there. Stills the adult check held are left out.
 */
export function storyScenesFromDay(input: {
  day: DayToolCache | null | undefined;
  characterId: string;
  activeCharacterId?: string | null;
  now?: number;
}): RoleplayStoryBeat[] {
  const plan = castDayPlan(input.day, input.characterId, input.activeCharacterId);
  if (!plan) return [];
  const now = input.now ?? Date.now();
  const stills = new Map((plan.stills ?? []).map(still => [still.slotId, still]));
  const scenes: RoleplayStoryBeat[] = [];
  for (const slot of plan.slots ?? []) {
    const still = stills.get(slot.id);
    if (!still || still.status !== 'completed' || still.adultHold) continue;
    const imageUrl = dayShownImage(still);
    const blurb = storyBlurbFromBeat(slot.sceneHints ?? '');
    if (!imageUrl || !blurb) continue;
    scenes.push({
      id: `day-${slot.id}-${now}`,
      title: dayPartTitle(slot.id),
      blurb: blurb.slice(0, 400),
      at: now + scenes.length,
      castId: input.characterId,
      ...(still.promptId ? { promptId: still.promptId } : {}),
      imageUrl,
      stillStatus: 'completed',
    });
  }
  return scenes;
}

/** Day → Story link: the Cast, plus `from=day` so Story seeds itself from that Cast's Day. */
export function continueDayAsStoryHref(characterId: string): string {
  return `/story?character=${encodeURIComponent(characterId.trim())}&from=day`;
}
