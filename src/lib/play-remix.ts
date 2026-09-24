/**
 * Day remix variants after a Cut: themed days and "same Day, new Outfit".
 * Pure helpers only — storage writes live in `play-starter.ts` (`applyRemixDayFilmState`).
 */

import { dayPartOf, type DayPart, type DaySlot } from './day-planner';

export type DayRemixKind = 'new-day' | 'new-outfit' | 'theme';

export function normalizeDayRemixKind(value: unknown): DayRemixKind {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (id === 'new-outfit' || id === 'theme') {
    return id;
  }
  return 'new-day';
}

export type DayThemeId = 'rainy-day' | 'weekend-out' | 'workday' | 'cozy-home' | 'city-trip';

type DayThemeSlot = { location: string; beat: string };

export type DayTheme = {
  id: DayThemeId;
  label: string;
  hint: string;
  /** Everyday, solo beats — one Setting + Beat per time of day. */
  slots: Record<DayPart, DayThemeSlot>;
};

export const DAY_THEMES: DayTheme[] = [
  {
    id: 'rainy-day',
    label: 'Rainy day',
    hint: 'Umbrellas, wet streets, warm interiors',
    slots: {
      morning: {
        location: 'apartment window with rain streaking the glass and grey soft light',
        beat: 'pouring tea by the window, mug in hand, watching the rain',
      },
      afternoon: {
        location: 'wet city sidewalk with puddles and passing umbrellas',
        beat: 'mid-stride under a compact umbrella, glancing sideways at traffic',
      },
      evening: {
        location: 'corner café with fogged windows and warm pendant lamps',
        beat: 'reading a paperback at a small table, one hand around a steaming cup',
      },
      night: {
        location: 'neon-lit street after rain with reflections on the asphalt',
        beat: 'standing under a shop awning with hands in coat pockets',
      },
    },
  },
  {
    id: 'weekend-out',
    label: 'Weekend out',
    hint: 'Markets, parks, and easy afternoons',
    slots: {
      morning: {
        location: 'sunlit kitchen counter with a slow weekend breakfast spread',
        beat: 'stretching arms overhead mid-yawn before heading out',
      },
      afternoon: {
        location: 'open-air farmers market with produce stalls and striped awnings',
        beat: 'carrying a tote of fresh produce, laughing at something off-frame',
      },
      evening: {
        location: 'leafy city park path at golden hour with benches and long shadows',
        beat: 'sitting on a bench with a takeaway drink, legs crossed, watching people pass',
      },
      night: {
        location: 'rooftop terrace with string lights and a city skyline behind',
        beat: 'leaning on the rail with a drink, looking out over the lights',
      },
    },
  },
  {
    id: 'workday',
    label: 'Workday',
    hint: 'Commute, desk, and the walk home',
    slots: {
      morning: {
        location: 'empty train platform in early light with a takeaway coffee cup',
        beat: 'checking the phone while waiting, coffee in the other hand',
      },
      afternoon: {
        location: 'open-plan office corner desk with monitors and afternoon window light',
        beat: 'typing at a laptop, glancing up toward the window mid-thought',
      },
      evening: {
        location: 'busy sidewalk at rush hour with headlights and shop signs',
        beat: 'walking briskly with a bag over one shoulder, phone at the ear',
      },
      night: {
        location: 'small apartment kitchen with a single warm lamp',
        beat: 'leaning on the counter with a mug, shoes kicked off by the door',
      },
    },
  },
  {
    id: 'cozy-home',
    label: 'Cozy home',
    hint: 'A slow day indoors',
    slots: {
      morning: {
        location: 'bedroom with sheets pulled back and low morning sun through curtains',
        beat: 'stretching arms overhead by the bed, hair still messy',
      },
      afternoon: {
        location: 'sunlit living room with a couch, plants, and a stack of books',
        beat: 'curled on the couch reading, one foot tucked under',
      },
      evening: {
        location: 'home kitchen with a pot on the stove and steam in the window light',
        beat: 'stirring a pot at the stove, glancing back over one shoulder',
      },
      night: {
        location: 'living room lit by a floor lamp and a laptop glow',
        beat: 'sitting cross-legged on the rug with a blanket around the shoulders',
      },
    },
  },
  {
    id: 'city-trip',
    label: 'City trip',
    hint: 'A traveler exploring a new town',
    slots: {
      morning: {
        location: 'small hotel breakfast room with pastries and a window onto old streets',
        beat: 'lifting a coffee cup, map spread on the table',
      },
      afternoon: {
        location: 'cobblestone old-town square with cafés and pigeons',
        beat: 'pointing up at a landmark with one hand, camera strap on the other shoulder',
      },
      evening: {
        location: 'riverside promenade at sunset with bikes and lantern posts',
        beat: 'leaning on the rail, looking out at the water',
      },
      night: {
        location: 'narrow lit alley outside a busy local restaurant',
        beat: 'waving toward the door with a paper bag of takeaway in the other hand',
      },
    },
  },
];

export function normalizeDayThemeId(value: unknown): DayThemeId | null {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return DAY_THEMES.find(theme => theme.id === id)?.id ?? null;
}

export function dayThemeById(id: unknown): DayTheme | null {
  const themeId = normalizeDayThemeId(id);
  return themeId ? (DAY_THEMES.find(theme => theme.id === themeId) ?? null) : null;
}

/**
 * Replace each slot's Setting + Beat with the theme's, keeping wardrobe kits and labels.
 * Themes script one beat per daypart; on longer Days the late slots (`morning-2`…) keep their
 * own plan rather than repeat the same beat twice.
 */
export function applyDayTheme(slots: DaySlot[], themeId: unknown): DaySlot[] {
  const theme = dayThemeById(themeId);
  if (!theme) {
    return slots;
  }
  return slots.map(slot => {
    if (slot.id !== dayPartOf(slot.id)) {
      return slot;
    }
    const scripted = theme.slots[dayPartOf(slot.id)];
    return { ...slot, location: scripted.location, sceneHints: scripted.beat };
  });
}

/**
 * "Same Day, new Outfit": keep every Setting + Beat, drop the per-slot kits so a fresh Outfit
 * Keep can seed new ones.
 */
export function clearDaySlotOutfits(slots: DaySlot[]): DaySlot[] {
  return slots.map(slot => ({ ...slot, wardrobeId: undefined }));
}
