/**
 * A script's names to the production's records (M3 S3, ROADMAP §6.2): each speaking part to a
 * Cast member, each scene's place to the Cast's home or workplace. A name that matches is only
 * suggested until confirmed; a name that doesn't stays unknown — nothing is created or guessed
 * silently. What is decided is kept on the script (`castMap`, `placeMap`). Pure.
 */
import { placeRoomOfSetting } from '../cast/places';

export type ScriptCastMember = { id: string; name: string };

/** A speaking part's Cast member: an id, or null for "not in the Cast" (a stranger, an extra). */
export type ScriptCastMap = Record<string, string | null>;

export type ScriptPlaceChoice = 'home' | 'work' | 'elsewhere';
export type ScriptPlaceMap = Record<string, ScriptPlaceChoice>;

export type SpeakerResolution = {
  speaker: string;
  /** The Cast member it is, or null: not in the Cast. Undefined: not known yet. */
  castId?: string | null;
  status: 'confirmed' | 'suggested' | 'unknown';
  /** How a suggestion was made. */
  how?: 'name' | 'first name';
};

/** The key a speaking part is kept under: its cue, upper-cased and trimmed. */
export function speakerKey(speaker: string): string {
  return speaker.trim().replace(/\s+/g, ' ').toUpperCase();
}

const norm = (value: string) => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** A Cast member a cue names: their whole name, else their first name when only one has it. */
export function suggestCastFor(
  speaker: string,
  cast: readonly ScriptCastMember[]
): { castId: string; how: 'name' | 'first name' } | null {
  const cue = norm(speaker);
  if (!cue) return null;
  const whole = cast.filter(member => norm(member.name) === cue);
  if (whole.length === 1) return { castId: whole[0]!.id, how: 'name' };
  const first = cast.filter(member => norm(member.name).split(/\s+/)[0] === cue);
  return first.length === 1 ? { castId: first[0]!.id, how: 'first name' } : null;
}

/** Each speaking part: what you decided, else a suggestion, else unknown. */
export function resolveSpeakers(
  speakers: readonly string[],
  cast: readonly ScriptCastMember[],
  saved: ScriptCastMap | undefined
): SpeakerResolution[] {
  const known = new Set(cast.map(member => member.id));
  const seen = new Set<string>();
  const out: SpeakerResolution[] = [];
  for (const raw of speakers) {
    const speaker = speakerKey(raw);
    if (!speaker || seen.has(speaker)) continue;
    seen.add(speaker);
    if (saved && speaker in saved) {
      const castId = saved[speaker];
      // A confirmed member who has since left the Cast is unknown again.
      if (castId === null || (castId && known.has(castId))) {
        out.push({ speaker, castId, status: 'confirmed' });
        continue;
      }
    }
    const suggestion = suggestCastFor(speaker, cast);
    out.push(
      suggestion
        ? { speaker, castId: suggestion.castId, status: 'suggested', how: suggestion.how }
        : { speaker, status: 'unknown' }
    );
  }
  return out;
}

/** The key a place is kept under. */
export function placeKey(place: string): string {
  return place.trim().replace(/\s+/g, ' ').toUpperCase();
}

export type PlaceResolution = {
  place: string;
  choice: ScriptPlaceChoice;
  /** The room of home / work it reads as (kitchen, desk…), when it is one. */
  room?: string;
  status: 'confirmed' | 'suggested';
};

/** Each scene place: what you decided, else how Castcut reads it (cast/places.ts). */
export function resolvePlaces(
  places: readonly string[],
  saved: ScriptPlaceMap | undefined
): PlaceResolution[] {
  const seen = new Set<string>();
  const out: PlaceResolution[] = [];
  for (const raw of places) {
    const place = placeKey(raw);
    if (!place || seen.has(place)) continue;
    seen.add(place);
    const read = placeRoomOfSetting(place.toLowerCase());
    const choice = saved?.[place];
    if (choice === 'home' || choice === 'work' || choice === 'elsewhere') {
      out.push({
        place,
        choice,
        ...(read && read.kind === choice ? { room: read.room } : {}),
        status: 'confirmed',
      });
      continue;
    }
    out.push(
      read
        ? { place, choice: read.kind, room: read.room, status: 'suggested' }
        : { place, choice: 'elsewhere', status: 'suggested' }
    );
  }
  return out;
}

/** Keep only well-formed entries of a stored cast map. */
export function normalizeScriptCastMap(value: unknown): ScriptCastMap | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: ScriptCastMap = {};
  for (const [key, id] of Object.entries(value as Record<string, unknown>)) {
    const speaker = speakerKey(key).slice(0, 80);
    if (!speaker) continue;
    if (id === null) out[speaker] = null;
    else if (typeof id === 'string' && id.trim()) out[speaker] = id.trim().slice(0, 120);
  }
  return Object.keys(out).length ? out : undefined;
}

export function normalizeScriptPlaceMap(value: unknown): ScriptPlaceMap | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: ScriptPlaceMap = {};
  for (const [key, choice] of Object.entries(value as Record<string, unknown>)) {
    const place = placeKey(key).slice(0, 120);
    if (place && (choice === 'home' || choice === 'work' || choice === 'elsewhere')) {
      out[place] = choice;
    }
  }
  return Object.keys(out).length ? out : undefined;
}
