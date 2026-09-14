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
import { DEFAULT_DAY_SLOTS, type DaySlot } from './day-planner';
import { clearLookPack, saveLookPack, type LookPack } from './look-pack';
import { bumpPlayCampaignStep, savePlayCampaignState } from './play-campaign';
import { markOnboardingFirstPlayCampaign } from './onboarding-hooks';
import { noteStarterFilmMetric } from './local-observability';
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_MOODBOARD_TOOL_CACHE,
  loadSettingsCache,
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

const STARTER_SLOT_BEATS: Array<{ id: DaySlot['id']; location: string; sceneHints: string }> = [
  {
    id: 'morning',
    location: 'sunlit kitchen window',
    sceneHints: 'waking up, soft light, quiet start',
  },
  {
    id: 'afternoon',
    location: 'busy café terrace',
    sceneHints: 'coffee, people-watching, midday energy',
  },
  {
    id: 'evening',
    location: 'golden-hour rooftop',
    sceneHints: 'pause at the end of the work day',
  },
  {
    id: 'night',
    location: 'city street at night',
    sceneHints: 'walking home, neon reflections',
  },
];

export type PlayStarterResult = {
  characterId: string;
  characterName: string;
  href: string;
};

function starterSlots(): DaySlot[] {
  return DEFAULT_DAY_SLOTS.map(slot => {
    const beat = STARTER_SLOT_BEATS.find(entry => entry.id === slot.id);
    return {
      ...slot,
      location: beat?.location ?? slot.location,
      sceneHints: beat?.sceneHints ?? slot.sceneHints,
    };
  });
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

/** Build a portable starter look without persisting (for previews / tests). */
export function buildStarterLookPack(characterId: string): LookPack {
  return {
    ...STARTER_LOOK_BASE,
    characterId: characterId.trim(),
    savedAt: Date.now(),
  };
}
