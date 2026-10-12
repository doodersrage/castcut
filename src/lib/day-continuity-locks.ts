/**
 * What Day holds the same across every still, and what each still is free to change — said
 * before Queue (roadmap review 2026-10-11, "Continuity Lock"). Pure: it reads what Day already
 * does — the Cast plate (and Face finish), the Day's clothing, the Cast's recurring places,
 * the weather — and does not add a new mechanism. After the stills land, the face match on
 * each card (identity-mark.ts) checks the face lock; clothes and places are not measured.
 */

import { placeRoomOfSetting, resolveCastPlace, type CastPlaces } from './cast-places';

export type ContinuityLock = {
  id: 'face' | 'clothes' | 'place' | 'style';
  /** Held across the Day (true) or left to each still. */
  held: boolean;
  label: string;
  detail: string;
};

export function dayContinuityLocks(input: {
  cast?: { id?: string; name?: string; places?: CastPlaces } | null;
  hasPlate: boolean;
  faceFinish: boolean;
  /** The Day's clothing line (dayClothingView().day.summary) and whether a kit / photo is set. */
  clothing: { summary: string; set: boolean };
  /** Slots whose clothing differs from the Day's. */
  differingSlots: number;
  slots: ReadonlyArray<{ location?: string }>;
  /** One event (day-event.ts): every moment is an edit of the one before, in this place. */
  eventPlace?: string;
  /** Weather on every setting ('' = whatever each setting says). */
  weather: string;
}): ContinuityLock[] {
  const name = input.cast?.name?.trim() || 'the Cast';
  const locks: ContinuityLock[] = [];

  locks.push(
    input.hasPlate
      ? {
          id: 'face',
          held: true,
          label: input.faceFinish ? 'Face · plate + face finish' : 'Face · plate',
          detail: `Every still starts from ${name}'s plate${
            input.faceFinish ? ', and Face finish puts the plate face back on' : ''
          }. Each card's face match checks it.`,
        }
      : {
          id: 'face',
          held: false,
          label: 'Face · no plate',
          detail: `No plate yet — each still describes ${name} in words, so the face can change.`,
        }
  );

  locks.push(
    input.clothing.set
      ? {
          id: 'clothes',
          held: true,
          label: `Clothes · ${input.clothing.summary}${
            input.differingSlots > 0
              ? ` (${input.differingSlots} slot${input.differingSlots === 1 ? '' : 's'} differ)`
              : ''
          }`,
          detail: 'The Day’s clothing is worn in every slot that does not pick its own.',
        }
      : {
          id: 'clothes',
          held: false,
          label: 'Clothes · per slot',
          detail: 'No Day outfit — each slot picks clothes that fit its beat.',
        }
  );

  const eventPlace = input.eventPlace?.trim();
  if (eventPlace) {
    locks.push({
      id: 'place',
      held: true,
      label: `Place · ${eventPlace}`,
      detail:
        'One event: each moment after the first is made from the one before — same room, light and camera.',
    });
  }
  const counts = { home: 0, work: 0 };
  for (const slot of input.slots) {
    const room = placeRoomOfSetting(slot.location);
    if (room) counts[room.kind] += 1;
  }
  const placed = (['home', 'work'] as const)
    .map(kind => ({ kind, place: resolveCastPlace(input.cast, kind), count: counts[kind] }))
    .filter(entry => entry.count > 0);
  const kept = placed.filter(entry => entry.place);
  if (eventPlace) {
    // Held above.
  } else if (kept.length > 0) {
    locks.push({
      id: 'place',
      held: true,
      label: `Place · ${kept
        .map(
          entry =>
            `${entry.place!.label} ${entry.kind === 'home' ? 'home' : 'office'} (${entry.count})`
        )
        .join(', ')}`,
      detail: 'Rooms of the Cast’s home / workplace look the same in every still (Cast → Places).',
    });
  } else {
    locks.push({
      id: 'place',
      held: false,
      label: placed.length > 0 ? 'Place · places off' : 'Place · each setting its own',
      detail:
        placed.length > 0
          ? 'Cast → Places is off for these rooms, so each still invents the room.'
          : 'None of today’s settings is the Cast’s home or workplace.',
    });
  }

  locks.push(
    input.weather.trim()
      ? {
          id: 'style',
          held: true,
          label: `Weather · ${input.weather.trim()}`,
          detail: 'The same weather / season is added to every setting.',
        }
      : {
          id: 'style',
          held: false,
          label: 'Light · each slot its own',
          detail: 'Light follows each time of day; set Weather to hold one look across the Day.',
        }
  );
  return locks;
}
