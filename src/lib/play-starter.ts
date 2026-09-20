/**
 * One-tap starter film: create (or reuse) a Cast lead, stage a minimal look,
 * seed Day slots, skip Look/Outfit by default, and land on Day ready to auto-queue.
 */

import {
  applyCharacterRecordFresh,
  createBlankCharacter,
  getCharacter,
  upsertCharacter,
} from './character-os';
import { pickCharacterSubject } from './variation-seed';
import {
  DEFAULT_DAY_SLOTS,
  diversifyDaySlotScenes,
  normalizeDaySlots,
  type DaySlot,
} from './day-planner';
import { clearLookPack, saveLookPack, type LookPack } from './look-pack';
import { bumpPlayCampaignStep, savePlayCampaignState } from './play-campaign';
import {
  applyDayTheme,
  clearDaySlotOutfits,
  dayThemeById,
  normalizeDayRemixKind,
  type DayRemixKind,
} from './play-remix';
import { resolvePlayStepHref } from './play-step-machine';
import { markOnboardingFirstPlayCampaign } from './onboarding-hooks';
import { noteStarterFilmMetric } from './local-observability';
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_MOODBOARD_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
  saveToolSettings,
  type DayToolCache,
} from './settings-cache';

const STARTER_LOOK_BASE: Omit<LookPack, 'characterId' | 'savedAt'> = {
  version: 1,
  source: 'moodboard',
  moodNotes: 'warm natural light, soft everyday documentary feel',
  lightingNotes: 'soft morning window light · golden-hour rim at dusk',
  locationNotes: 'lived-in city day — café, commute, home, night street',
  styleNotes: 'candid stills, shallow depth, filmic color',
  paletteNotes: 'warm neutrals, denim, soft contrast',
  vibePrompt: 'a quiet day-in-the-life film for one Cast lead',
  instruction: 'natural candid framing, subject clear, environment readable',
};

export type PlayStarterResult = {
  characterId: string;
  characterName: string;
  href: string;
};

/** Fresh distinct Setting + Beat per daypart from the Day preset pools. */
function starterSlots(): DaySlot[] {
  return diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
    forceLocations: true,
    forceBeats: true,
    fillBeats: true,
  }).slots;
}

/** Seed a starter film campaign and return the Day deep link (auto-queue). */
export function startStarterPlayFilm(input?: {
  name?: string;
  existingCharacterId?: string;
  /** When false, skip autoqueue query (default true). */
  autoQueue?: boolean;
}): PlayStarterResult {
  const existingId = input?.existingCharacterId?.trim();
  let record = existingId ? getCharacter(existingId) : undefined;
  if (!record) {
    const name = input?.name?.trim() || 'Nova';
    const blank = createBlankCharacter(name);
    upsertCharacter(blank);
    record = getCharacter(blank.id) ?? blank;
  } else if (!record.descriptor?.trim()) {
    // Older Cast leads created before identity seeding still need a face.
    const withLook = {
      ...record,
      descriptor: pickCharacterSubject('any'),
      updatedAt: Date.now(),
    };
    upsertCharacter(withLook);
    record = getCharacter(withLook.id) ?? withLook;
  }

  clearLookPack();
  saveToolSettings('moodboard', { ...DEFAULT_MOODBOARD_TOOL_CACHE });

  const pack: LookPack = {
    ...STARTER_LOOK_BASE,
    characterId: record.id,
    savedAt: Date.now(),
  };
  saveLookPack(pack);

  const dayCache: DayToolCache = {
    ...DEFAULT_DAY_TOOL_CACHE,
    slots: starterSlots(),
    // Clear prior Day stills/clips so auto-cut cannot reuse the last run's film.
    stills: [],
    stillsCharacterId: undefined,
    notes: 'Starter day — Look & Outfit skipped. Queue stills (or use demo stills), then Cut film.',
  };
  saveToolSettings('day', dayCache);

  const patch = applyCharacterRecordFresh(record);
  saveSharedSettings({
    ...loadSettingsCache().shared,
    ...patch,
  });

  // Jump straight to Day — Look/Outfit are optional polish after the first film.
  savePlayCampaignState({
    version: 1,
    characterId: record.id,
    stepIndex: 3,
    updatedAt: Date.now(),
  });
  bumpPlayCampaignStep({
    characterId: record.id,
    stepId: 'day',
    absolute: true,
  });
  markOnboardingFirstPlayCampaign();
  noteStarterFilmMetric();

  const autoQueue = input?.autoQueue !== false;
  const params = new URLSearchParams();
  params.set('character', record.id);
  params.set('from', 'look');
  params.set('starter', '1');
  if (autoQueue) {
    params.set('autoqueue', '1');
  }

  return {
    characterId: record.id,
    characterName: record.name,
    href: `/day?${params.toString()}`,
  };
}

/**
 * Clear Day stills and prepare the next Day while keeping Cast + wardrobe.
 * - `new-day` (default): reseed Setting + Beat per slot.
 * - `theme`: swap in a themed Setting + Beat set (everyday mood).
 * - `new-outfit`: keep every Setting + Beat, drop per-slot kits so a fresh Outfit Keep seeds new ones.
 * Call before navigating to {@link remixDayFilmHref}, or from Day when `?remix=1`.
 */
export function applyRemixDayFilmState(options?: {
  kind?: DayRemixKind;
  themeId?: string | null;
}): void {
  const existing = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
  const previousSlots = Array.isArray(existing.slots) ? existing.slots : DEFAULT_DAY_SLOTS;
  const theme = dayThemeById(options?.themeId);
  const kind = normalizeDayRemixKind(options?.kind ?? (theme ? 'theme' : 'new-day'));
  const base = {
    ...existing,
    stills: [],
    stillsCharacterId: undefined,
  };

  if (kind === 'new-outfit') {
    saveToolSettings('day', {
      ...base,
      slots: clearDaySlotOutfits(normalizeDaySlots(previousSlots)),
      customGarmentImageUrl: undefined,
      customGarmentImageFilename: undefined,
      customGarmentDescription: undefined,
      notes: 'Same Day · new outfit — pick a new Outfit, then Continue to Day.',
    });
    // The shared kit lock would otherwise put the old outfit back on every slot.
    saveSharedSettings({ ...loadSettingsCache().shared, lockedWardrobeId: undefined });
    return;
  }

  if (kind === 'theme' && theme) {
    saveToolSettings('day', {
      ...base,
      slots: applyDayTheme(normalizeDaySlots(previousSlots), theme.id),
      dayMood: 'everyday',
      notes: `${theme.label} day — queue fresh stills, then Cut film.`,
    });
    return;
  }

  const reseeds = starterSlots().map(slot => {
    const prior = previousSlots.find(entry => entry.id === slot.id);
    return {
      ...slot,
      wardrobeId: prior?.wardrobeId?.trim() || slot.wardrobeId,
    };
  });
  saveToolSettings('day', {
    ...base,
    slots: reseeds,
    notes: 'Same look · new Day — queue fresh stills, then Cut film.',
  });
}

/** Where "Same Day, new Outfit" sends the user: the Outfit step, keeping this Day's beats. */
export function remixNewOutfitHref(characterId: string, pack?: LookPack | null): string {
  return resolvePlayStepHref('fitting', characterId, pack);
}

export { remixDayFilmHref } from './play-step-machine';
export { countCachedCompletedDayClips, countCachedCompletedDayStills } from './play-day-cache';

/** Build a portable starter look without persisting (for previews / tests). */
export function buildStarterLookPack(characterId: string): LookPack {
  return {
    ...STARTER_LOOK_BASE,
    characterId: characterId.trim(),
    savedAt: Date.now(),
  };
}
