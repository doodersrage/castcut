/**
 * Day mood “Sport” — random sport + mid-action pose, filtered by time of day
 * (when that sport typically happens).
 */

import type { AthleticSport } from '@/lib/athletic-sport-profiles';
import { getAthleticSportGuardrail, inferAthleticSport } from '@/lib/athletic-sport-profiles';
import {
  CYCLING_DISCIPLINES,
  dayCyclingDisciplineLabel,
  listCyclingDisciplinePoses,
  listCyclingDisciplineSettings,
  listSportActionPoses,
  listSportActionSettings,
  type CyclingDiscipline,
} from '@/lib/athletic-sport-actions';
import type { DaySlotId } from '@/lib/day-planner';
import { dayPartOf, type DayPart } from '@/lib/day-parts';

/** Sports that commonly run in each Day slot (training / match windows). */
export const DAY_SLOT_SPORTS: Record<DayPart, readonly AthleticSport[]> = {
  morning: [
    'running',
    'yoga',
    'cycling',
    'triathlon',
    'golf',
    'track_field',
    'ski',
    'swimming',
    'surfing',
  ],
  afternoon: [
    'tennis',
    'basketball',
    'soccer',
    'baseball',
    'rugby',
    'track_field',
    'climbing',
    'fencing',
    'martial_arts',
    'golf',
    'gymnastics',
    'cycling',
    'volleyball',
    'swimming',
    'boxing',
    'surfing',
  ],
  evening: [
    'basketball',
    'soccer',
    'tennis',
    'martial_arts',
    'climbing',
    'hockey',
    'gymnastics',
    'cycling',
    'fencing',
    'running',
    'ski',
    'volleyball',
    'boxing',
    'swimming',
  ],
  night: [
    'hockey',
    'basketball',
    'fencing',
    'martial_arts',
    'climbing',
    'soccer',
    'boxing',
    'volleyball',
  ],
};

const SPORT_LABEL: Record<AthleticSport, string> = {
  triathlon: 'triathlon',
  track_field: 'track and field',
  cycling: 'cycling',
  martial_arts: 'martial arts',
  fencing: 'fencing',
  gymnastics: 'gymnastics',
  climbing: 'climbing',
  yoga: 'yoga',
  tennis: 'tennis',
  basketball: 'basketball',
  hockey: 'hockey',
  baseball: 'baseball',
  rugby: 'rugby',
  soccer: 'soccer',
  ski: 'ski',
  golf: 'golf',
  running: 'running',
  swimming: 'swimming',
  volleyball: 'volleyball',
  boxing: 'boxing',
  surfing: 'surfing',
};

export function daySportLabel(sport: AthleticSport): string {
  return SPORT_LABEL[sport] ?? sport;
}

function buildSportBeatLine(pose: string, label: string): string {
  return `${pose} — ${label} athletic action in proper ${label} kit and sport footwear, mid-play on a ${label} venue, Cast alone, never a sundress or soft fashion pin-up, never invent a second sport`;
}

/** Beat lines for Suggest / diversify — pose first, sport named for wardrobe lock. */
export function buildDaySportBeatPresets(slotId: DaySlotId): string[] {
  const sports = DAY_SLOT_SPORTS[dayPartOf(slotId)] ?? [];
  const beats: string[] = [];
  for (const sport of sports) {
    if (sport === 'cycling') {
      for (const discipline of CYCLING_DISCIPLINES) {
        const label = dayCyclingDisciplineLabel(discipline);
        for (const pose of listCyclingDisciplinePoses(discipline)) {
          beats.push(buildSportBeatLine(pose, label));
        }
      }
      continue;
    }
    const label = daySportLabel(sport);
    for (const pose of listSportActionPoses(sport)) {
      beats.push(buildSportBeatLine(pose, label));
    }
  }
  return beats;
}

/** Venue / lighting lines matched to sports that fit this daypart. */
export function buildDaySportSettingPresets(slotId: DaySlotId): string[] {
  const sports = DAY_SLOT_SPORTS[dayPartOf(slotId)] ?? [];
  const settings: string[] = [];
  const seen = new Set<string>();
  for (const sport of sports) {
    const pool =
      sport === 'cycling' ? listSportActionSettings('cycling') : listSportActionSettings(sport);
    for (const setting of pool) {
      const key = setting.trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      settings.push(setting);
    }
  }
  return settings;
}

export const DAY_SLOT_SPORT_BEAT_PRESETS: Record<DayPart, string[]> = {
  morning: buildDaySportBeatPresets('morning'),
  afternoon: buildDaySportBeatPresets('afternoon'),
  evening: buildDaySportBeatPresets('evening'),
  night: buildDaySportBeatPresets('night'),
};

export const DAY_SLOT_SPORT_SETTING_PRESETS: Record<DayPart, string[]> = {
  morning: buildDaySportSettingPresets('morning'),
  afternoon: buildDaySportSettingPresets('afternoon'),
  evening: buildDaySportSettingPresets('evening'),
  night: buildDaySportSettingPresets('night'),
};

/**
 * Fashion / domestic settings that must not survive under Sport.
 * Do not ban asphalt/road alone — running/cycling venues legitimately use those words.
 * Surfing uses ocean/reef/point break (not the softcore “beach pin-up” word).
 */
export const DAY_SPORT_STALE_SETTING_RE =
  /\b(parking\s+garage|underpass|beach|shoreline|bedroom|hotel\s+room|café|cafe|bookstore|kitchen|living[- ]?room|floral|sundress|barefoot|headlights?|cobblestone\s+shoulder)\b/i;

/**
 * Pick one sport for the daypart, then a matching mid-action beat + venue pair
 * so Setting cannot drift to a road pin-up while Beat says tennis.
 */
export function pickDaySportScenePair(
  slotId: DaySlotId,
  options?: {
    usedBeats?: Set<string>;
    usedLocations?: Set<string>;
    random?: () => number;
  }
): { beat: string; setting: string; sport: AthleticSport } | null {
  const random = options?.random ?? Math.random;
  const sports = [...(DAY_SLOT_SPORTS[dayPartOf(slotId)] ?? [])];
  if (sports.length === 0) {
    return null;
  }
  // Shuffle sports lightly so morning isn't always running.
  for (let i = sports.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = sports[i]!;
    sports[i] = sports[j]!;
    sports[j] = tmp;
  }
  const usedBeats = options?.usedBeats ?? new Set<string>();
  const usedLocations = options?.usedLocations ?? new Set<string>();
  for (const sport of sports) {
    if (sport === 'cycling') {
      const pair = pickCyclingDisciplineScenePair({
        usedBeats,
        usedLocations,
        random,
      });
      if (pair) {
        return pair;
      }
      continue;
    }
    const label = daySportLabel(sport);
    const poses = listSportActionPoses(sport);
    const settings = listSportActionSettings(sport);
    if (poses.length === 0 || settings.length === 0) {
      continue;
    }
    const beatCandidates = poses.map(pose => buildSportBeatLine(pose, label));
    const unusedBeats = beatCandidates.filter(b => !usedBeats.has(b.toLowerCase()));
    const unusedSettings = settings.filter(s => !usedLocations.has(s.trim().toLowerCase()));
    const beatPool = unusedBeats.length > 0 ? unusedBeats : beatCandidates;
    const settingPool = unusedSettings.length > 0 ? unusedSettings : [...settings];
    const beat = beatPool[Math.floor(random() * beatPool.length)]!;
    const setting = settingPool[Math.floor(random() * settingPool.length)]!;
    return { beat, setting, sport };
  }
  return null;
}

function pickCyclingDisciplineScenePair(options: {
  usedBeats: Set<string>;
  usedLocations: Set<string>;
  random: () => number;
}): { beat: string; setting: string; sport: AthleticSport } | null {
  const disciplines = [...CYCLING_DISCIPLINES] as CyclingDiscipline[];
  for (let i = disciplines.length - 1; i > 0; i -= 1) {
    const j = Math.floor(options.random() * (i + 1));
    const tmp = disciplines[i]!;
    disciplines[i] = disciplines[j]!;
    disciplines[j] = tmp;
  }
  for (const discipline of disciplines) {
    const label = dayCyclingDisciplineLabel(discipline);
    const poses = listCyclingDisciplinePoses(discipline);
    const settings = listCyclingDisciplineSettings(discipline);
    if (poses.length === 0 || settings.length === 0) {
      continue;
    }
    const beatCandidates = poses.map(pose => buildSportBeatLine(pose, label));
    const unusedBeats = beatCandidates.filter(b => !options.usedBeats.has(b.toLowerCase()));
    const unusedSettings = settings.filter(s => !options.usedLocations.has(s.trim().toLowerCase()));
    const beatPool = unusedBeats.length > 0 ? unusedBeats : beatCandidates;
    const settingPool = unusedSettings.length > 0 ? unusedSettings : [...settings];
    return {
      beat: beatPool[Math.floor(options.random() * beatPool.length)]!,
      setting: settingPool[Math.floor(options.random() * settingPool.length)]!,
      sport: 'cycling',
    };
  }
  return null;
}

/** Infer sport from a Day beat/setting line for prompt guardrails. */
export function inferDaySportFromScene(
  beat?: string | null,
  setting?: string | null
): AthleticSport | null {
  const haystack = [beat, setting].filter(Boolean).join(' · ');
  const fromHints = inferAthleticSport(haystack);
  if (fromHints) {
    return fromHints;
  }
  // Day Sport presets name the sport as "<label> athletic action" / "proper <label> kit".
  for (const sport of Object.keys(SPORT_LABEL) as AthleticSport[]) {
    const label = SPORT_LABEL[sport];
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const named = new RegExp(
      `\\b(?:proper\\s+${escaped}\\s+kit|${escaped}\\s+athletic action)\\b`,
      'i'
    );
    if (named.test(haystack)) {
      return sport;
    }
  }
  // Cycling disciplines still lock as cycling kit.
  if (
    /\b(?:road cycling|gravel cycling|mountain biking|cyclocross|track cycling)\s+athletic action\b/i.test(
      haystack
    )
  ) {
    return 'cycling';
  }
  return null;
}

/** Compact MOOD + wardrobe lock for Day Sport stills. */
export function buildDaySportPromptLocks(input: {
  beat?: string | null;
  setting?: string | null;
}): { moodLine: string; wardrobeLock: string | null } {
  const sport = inferDaySportFromScene(input.beat, input.setting);
  const label = sport ? daySportLabel(sport) : 'the named sport';
  const moodLine = `MOOD: sport still — mid-${label} athletic action only; follow the beat pose with committed limbs and sport footwear; Cast alone in proper ${label} kit on a real ${label} venue; never a soft fashion pin-up, sundress, floral dress, barefoot beach portrait, parking-garage standing plate, or café walk; SETTING is the sport venue/lighting only.`;
  const wardrobeLock = sport
    ? `SPORT KIT (mandatory — discard Image 1 Keep clothes): ${getAthleticSportGuardrail(sport)} Never a sundress, floral dress, street clothes, sandals, or barefoot fashion look.`
    : 'SPORT KIT (mandatory — discard Image 1 Keep clothes): wear the correct sport-specific athletic kit and footwear for the beat action — never a sundress, floral dress, street clothes, sandals, or soft fashion look.';
  return { moodLine, wardrobeLock };
}
