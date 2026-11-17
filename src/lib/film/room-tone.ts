/**
 * Room tone by scene: one bed of a script scene's own sound — the kitchen's hush, the street's
 * traffic — looped under the whole scene, so its shots sit in one place. Each MiniMax-H3 clip
 * brought its own room sound, and cut together the flagship sounded like "a collection of glued
 * together short videos" (2026-11-16). The words are LTX-2.5's "Make a sound" (sound-effect.ts).
 * Pure.
 */

export type RoomToneShot = {
  title: string;
  /** The script scene the shot belongs to (FilmPlaylistShot.sceneGroup). */
  sceneGroup?: string;
  startSec: number;
  durSec: number;
};

export type RoomToneBed = {
  group: string;
  place: string;
  words: string;
  atSec: number;
  seconds: number;
};

/** A bed's level under the scene (it stays under the lines). */
export const ROOM_TONE_LEVEL = 0.35;
/** The sound made for a bed, looped to the scene's length (sound-effect.ts makes at most 8 s). */
export const ROOM_TONE_SOURCE_SEC = 8;
/** Effect ids of the beds (made again, they replace these). */
export const ROOM_TONE_PREFIX = 'fx-room-';

const PLACES: ReadonlyArray<[RegExp, string]> = [
  [
    /\b(street|sidewalk|crosswalk|avenue|road)\b/i,
    'a city street: steady distant traffic, a car passing, footsteps on the pavement',
  ],
  [
    /\b(cafe|café|coffee shop|diner|restaurant|bar)\b/i,
    'a small café: a soft indistinct murmur, cups and saucers clinking, an espresso machine far off',
  ],
  [
    /\b(park|garden|woods|forest)\b/i,
    'a city park in the afternoon: birdsong, leaves rustling in a light breeze, a distant city hum',
  ],
  [
    /\b(roof|rooftop|terrace|balcony)\b/i,
    'a rooftop terrace at dusk: a gentle wind, the city humming far below',
  ],
  [
    /\b(bus stop|station|platform)\b/i,
    'a bus stop in the evening: light traffic, a bus pulling away in the distance',
  ],
  [
    /\b(store|shop|market|aisle)\b/i,
    'a quiet hardware store: fluorescent hum, a distant cart, a soft background murmur',
  ],
  [
    /\b(stair|stairwell|hallway|corridor)\b/i,
    'an apartment stairwell: an echoing hush, a distant door, faint footsteps above',
  ],
];

/** The place a shot title names ("1C SLYNE'S KITCHEN · Dialogue" → "kitchen"). */
export function roomTonePlace(title: string): string {
  const place = title
    .replace(/^\S+\s+/, '')
    .split('·')[0]!
    .replace(/\b[\p{L}'’-]+['’]s\s+/giu, '')
    .trim()
    .toLowerCase();
  return place || 'room';
}

/** What a place's bed is made from: its own sound, never voices or music. */
export function roomToneWords(place: string): string {
  const known = PLACES.find(([re]) => re.test(place))?.[1];
  const sound =
    known ?? `the quiet room tone of a ${place}: a soft indoor hush, the faint city outside`;
  return `${sound}. Ambience only — no voices, no speech, no music.`;
}

/** One bed per run of shots in the same script scene (a scene of under 4 s has none). */
export function roomToneBeds(shots: readonly RoomToneShot[]): RoomToneBed[] {
  const beds: RoomToneBed[] = [];
  for (const shot of shots) {
    if (!shot.sceneGroup) continue;
    const last = beds[beds.length - 1];
    const end = shot.startSec + shot.durSec;
    if (last && last.group === shot.sceneGroup) {
      last.seconds = Math.round((end - last.atSec) * 10) / 10;
      continue;
    }
    const place = roomTonePlace(shot.title);
    beds.push({
      group: shot.sceneGroup,
      place,
      words: roomToneWords(place),
      atSec: Math.round(shot.startSec * 100) / 100,
      seconds: Math.round(shot.durSec * 10) / 10,
    });
  }
  return beds.filter(bed => bed.seconds >= 4);
}
