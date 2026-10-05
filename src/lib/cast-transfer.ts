/**
 * One Cast as a file: its record (looks, bible, Part, locks), its picture, its Story and its Day
 * plan — to back a character up, or move it to another install without a full sync.
 *
 * The picture travels as image data: on another install the record's ComfyUI file names and
 * media URLs point at nothing, so import uploads the picture again as the Cast's plate. Stills
 * (Day and Story) stay where they were rendered; the plan and the story text come along.
 */
import type { ParkedDay } from './day-cast-park';
import type { CharacterRecord } from './character-os';
import type { RoleplayLibrarySession } from './roleplay-library';
import { restampStoryCast } from './story-session-guard';
import type { DayToolCache } from './settings-cache';

export const CAST_FILE_KIND = 'castcut-cast';
export const CAST_FILE_VERSION = 1;

/** The Day fields a Cast file carries: the plan, not the stills. */
export type CastFileDay = Pick<
  DayToolCache,
  'slots' | 'dayLength' | 'dayMood' | 'dayWeather' | 'intimateMix' | 'allowCompanions'
>;

export type CastFile = {
  kind: typeof CAST_FILE_KIND;
  version: number;
  exportedAt: number;
  character: CharacterRecord;
  /** The Cast's picture as a data URL (its face lock / plate). */
  picture?: { name: string; dataUrl: string };
  stories: RoleplayLibrarySession[];
  day?: CastFileDay;
};

const DAY_FIELDS = [
  'slots',
  'dayLength',
  'dayMood',
  'dayWeather',
  'intimateMix',
  'allowCompanions',
] as const;

export function castFileDay(
  day: Partial<DayToolCache> | ParkedDay | null | undefined
): CastFileDay | undefined {
  if (!day?.slots?.length) return undefined;
  const picked: Record<string, unknown> = {};
  for (const field of DAY_FIELDS) {
    if (day[field] !== undefined) picked[field] = day[field];
  }
  return picked as CastFileDay;
}

/** Fields that name files on this install (ComfyUI inputs, media URLs) — meaningless elsewhere. */
function withoutLocalFiles(character: CharacterRecord): CharacterRecord {
  const strip = <T extends { ipAdapter?: unknown; reference?: unknown }>(entry: T): T => {
    const { ipAdapter: _ipAdapter, reference: _reference, ...rest } = entry;
    return rest as T;
  };
  return {
    ...strip(character),
    looks: character.looks?.map(look => ({ ...strip(look), keeperEntryIds: undefined })),
    filmCut: undefined,
    biblePicture: undefined,
  };
}

export function buildCastFile(input: {
  character: CharacterRecord;
  picture?: { name: string; dataUrl: string } | null;
  stories: RoleplayLibrarySession[];
  day?: CastFileDay;
  now?: number;
}): CastFile {
  return {
    kind: CAST_FILE_KIND,
    version: CAST_FILE_VERSION,
    exportedAt: input.now ?? Date.now(),
    character: withoutLocalFiles(input.character),
    ...(input.picture ? { picture: input.picture } : {}),
    stories: input.stories,
    ...(input.day ? { day: input.day } : {}),
  };
}

/** A Cast file read back, or null when it isn't one. */
export function parseCastFile(value: unknown): CastFile | null {
  if (!value || typeof value !== 'object') return null;
  const file = value as Partial<CastFile>;
  if (file.kind !== CAST_FILE_KIND || typeof file.version !== 'number') return null;
  if (file.version > CAST_FILE_VERSION) return null;
  const character = file.character;
  if (!character || typeof character !== 'object' || typeof character.name !== 'string') {
    return null;
  }
  if (!character.name.trim()) return null;
  const picture =
    file.picture &&
    typeof file.picture.dataUrl === 'string' &&
    /^data:image\/[a-z+.-]+;base64,/i.test(file.picture.dataUrl)
      ? { name: String(file.picture.name || 'cast.png'), dataUrl: file.picture.dataUrl }
      : undefined;
  return {
    kind: CAST_FILE_KIND,
    version: file.version,
    exportedAt: typeof file.exportedAt === 'number' ? file.exportedAt : 0,
    character,
    ...(picture ? { picture } : {}),
    stories: Array.isArray(file.stories)
      ? file.stories.filter(
          (story): story is RoleplayLibrarySession =>
            Boolean(story) && typeof story === 'object' && typeof story.id === 'string'
        )
      : [],
    ...(file.day?.slots?.length ? { day: castFileDay(file.day) } : {}),
  };
}

/**
 * The Cast as it lands on this install: its own id when that id is free, else a new one (an
 * import never overwrites a Cast that is here). Its Story sessions are re-keyed to match.
 */
export function placeImportedCast(
  file: CastFile,
  options: {
    idTaken: (id: string) => boolean;
    /** Another Cast already has this name (the Cast store keeps one Cast per name). */
    nameTaken: (name: string) => boolean;
    newId: () => string;
    sessionIdFor: (castId: string) => string;
    now?: number;
  }
): { character: CharacterRecord; stories: RoleplayLibrarySession[]; renamed: boolean } {
  // renamed: the Cast got a new id because its own was in use here.
  const wanted = file.character.id?.trim();
  const renamed = !wanted || options.idTaken(wanted);
  const id = renamed ? options.newId() : wanted;
  const now = options.now ?? Date.now();
  const sessionId = options.sessionIdFor(id);
  const oldSessionId = wanted ? options.sessionIdFor(wanted) : '';
  const name = options.nameTaken(file.character.name)
    ? `${file.character.name.trim()} (imported)`
    : file.character.name;
  const character: CharacterRecord = {
    ...file.character,
    id,
    name,
    ...(file.character.characterName ? { characterName: name } : {}),
    updatedAt: now,
  };
  const stories = file.stories.map(story => {
    if (story.id !== oldSessionId) return story;
    return {
      ...story,
      id: sessionId,
      updatedAt: now,
      snapshot: {
        ...story.snapshot,
        activeSessionId: sessionId,
        // Its scenes are stamped with the Cast id they were played under.
        ...(wanted && story.snapshot.story
          ? { story: restampStoryCast(story.snapshot.story, wanted, id) }
          : {}),
      },
    };
  });
  return { character, stories, renamed };
}

export function castFileName(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'cast';
  return `${slug}.castcut-cast.json`;
}
