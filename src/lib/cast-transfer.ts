/**
 * One Cast as a file: its record (looks, bible, Part, locks), its picture, its Story and its Day
 * plan — to back a character up, or move it to another install without a full sync.
 *
 * The pictures travel as image data (one per look): on another install the record's ComfyUI file
 * names and media URLs point at nothing, so import uploads each again as its look's plate. Stills
 * (Day and Story) stay where they were rendered; the plan and the story text come along.
 */
import type { ParkedDay } from './day-cast-park';
import type { CharacterLookOutfit, CharacterRecord } from './character-os';
import type { RoleplayLibrarySession } from './roleplay-library';
import { restampStoryCast } from './story-session-guard';
import type { DayToolCache } from './play-settings';

export const CAST_FILE_KIND = 'castcut-cast';
export const CAST_FILE_VERSION = 1;

/** The Day fields a Cast file carries: the plan, not the stills. */
export type CastFileDay = Pick<
  DayToolCache,
  'slots' | 'dayLength' | 'dayMood' | 'dayWeather' | 'intimateMix' | 'allowCompanions'
>;

export type CastFileLookPicture = { lookId: string; name: string; dataUrl: string };

/** `key`: the photo's ComfyUI file name on the exporting install, else its URL. */
export type CastFileOutfitPicture = { key: string; name: string; dataUrl: string };

export type CastFile = {
  kind: typeof CAST_FILE_KIND;
  version: number;
  exportedAt: number;
  character: CharacterRecord;
  /** The Cast's picture as a data URL (its face lock / plate): the active look's. */
  picture?: { name: string; dataUrl: string };
  /** The other looks' pictures, each set up as that look's plate on import. */
  lookPictures?: CastFileLookPicture[];
  /** Clothing and shoe photos of the looks' kept outfits and the Wardrobe, by their old key. */
  outfitPictures?: CastFileOutfitPicture[];
  /** A still per Wardrobe entry (`key`: the entry's key), shown on its card. */
  wardrobePictures?: CastFileOutfitPicture[];
  /** The looks' reference sheet renders (`key`: `<lookId>|<view id>`). */
  sheetPictures?: CastFileOutfitPicture[];
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
  lookPictures?: CastFileLookPicture[];
  outfitPictures?: CastFileOutfitPicture[];
  wardrobePictures?: CastFileOutfitPicture[];
  sheetPictures?: CastFileOutfitPicture[];
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
    ...(input.lookPictures?.length ? { lookPictures: input.lookPictures } : {}),
    ...(input.outfitPictures?.length ? { outfitPictures: input.outfitPictures } : {}),
    ...(input.wardrobePictures?.length ? { wardrobePictures: input.wardrobePictures } : {}),
    ...(input.sheetPictures?.length ? { sheetPictures: input.sheetPictures } : {}),
    stories: input.stories,
    ...(input.day ? { day: input.day } : {}),
  };
}

const OUTFIT_PHOTOS = [
  ['customGarmentImageFilename', 'customGarmentImageUrl'],
  ['footwearImageFilename', 'footwearImageUrl'],
] as const;

function outfitsOf(character: CharacterRecord): CharacterLookOutfit[] {
  return [
    ...(character.looks ?? []).flatMap(look => (look?.keptOutfit ? [look.keptOutfit] : [])),
    ...(Array.isArray(character.wardrobe) ? character.wardrobe : []).flatMap(item =>
      item?.outfit ? [item.outfit] : []
    ),
  ];
}

/**
 * The clothing and shoe photos the Cast's outfits use (each look's kept outfit, the Wardrobe):
 * ComfyUI files on this install, so a Cast file carries them as pictures.
 */
export function castOutfitPhotoRefs(
  character: CharacterRecord
): { key: string; filename?: string; url?: string }[] {
  const refs = new Map<string, { key: string; filename?: string; url?: string }>();
  for (const outfit of outfitsOf(character)) {
    for (const [nameField, urlField] of OUTFIT_PHOTOS) {
      const filename = outfit[nameField]?.trim() || undefined;
      const url = outfit[urlField]?.trim() || undefined;
      const key = filename || url;
      if (key && !refs.has(key)) refs.set(key, { key, filename, url });
    }
  }
  return [...refs.values()];
}

/**
 * The Cast with its outfit photos pointing at their copies on this install (`moved`: old key →
 * new file). A Wardrobe entry known by its clothing photo's old name takes the new one.
 */
export function withOutfitPhotosMoved(
  character: CharacterRecord,
  moved: ReadonlyMap<string, { filename: string; url: string }>,
  /** Wardrobe entry key (as exported) → its still's copy here. */
  stills: ReadonlyMap<string, string> = new Map()
): CharacterRecord {
  if (!moved.size && !stills.size) return character;
  const move = (outfit: CharacterLookOutfit): CharacterLookOutfit => {
    let next = outfit;
    for (const [nameField, urlField] of OUTFIT_PHOTOS) {
      const key = outfit[nameField]?.trim() || outfit[urlField]?.trim();
      const to = key ? moved.get(key) : undefined;
      if (to) next = { ...next, [nameField]: to.filename, [urlField]: to.url };
    }
    return next;
  };
  return {
    ...character,
    looks: character.looks?.map(look =>
      look?.keptOutfit ? { ...look, keptOutfit: move(look.keptOutfit) } : look
    ),
    ...(Array.isArray(character.wardrobe)
      ? {
          wardrobe: character.wardrobe.map(item => {
            if (!item?.outfit) return item;
            const to = moved.get(item.key);
            const still = stills.get(item.key);
            return {
              ...item,
              ...(to ? { key: to.filename } : {}),
              ...(still ? { pictureUrl: still } : {}),
              outfit: move(item.outfit),
            };
          }),
        }
      : {}),
  };
}

/** A reference sheet render's key in a Cast file. */
export function sheetPictureKey(lookId: string, viewId: string): string {
  return `${lookId}|${viewId}`;
}

/**
 * The Cast with its looks' reference sheets on this install's copies (`moved`: sheet key → URL).
 * A render whose picture did not come along is dropped: it would show as a broken picture.
 */
export function withReferenceSheetsMoved(
  character: CharacterRecord,
  moved: ReadonlyMap<string, string>
): CharacterRecord {
  if (!character.looks?.some(look => look?.referenceSheet?.length)) return character;
  return {
    ...character,
    looks: character.looks.map(look => {
      if (!look?.referenceSheet?.length) return look;
      const sheet = look.referenceSheet.flatMap(view => {
        const url = moved.get(sheetPictureKey(look.id, view.id));
        return url ? [{ ...view, url }] : [];
      });
      return { ...look, referenceSheet: sheet.length ? sheet : undefined };
    }),
  };
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/[a-z+.-]+;base64,/i.test(value);
}

function keyedPictures(value: unknown, fallbackName: string): CastFileOutfitPicture[] {
  return (Array.isArray(value) ? (value as Partial<CastFileOutfitPicture>[]) : [])
    .filter(
      (entry): entry is CastFileOutfitPicture =>
        Boolean(entry) &&
        typeof entry.key === 'string' &&
        entry.key.trim() !== '' &&
        isImageDataUrl(entry.dataUrl)
    )
    .map(entry => ({
      key: entry.key,
      name: String(entry.name || fallbackName),
      dataUrl: entry.dataUrl,
    }));
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
    file.picture && isImageDataUrl(file.picture.dataUrl)
      ? { name: String(file.picture.name || 'cast.png'), dataUrl: file.picture.dataUrl }
      : undefined;
  const lookIds = new Set((character.looks ?? []).map(look => look?.id));
  const lookPictures = (Array.isArray(file.lookPictures) ? file.lookPictures : [])
    .filter(
      (entry): entry is CastFileLookPicture =>
        Boolean(entry) &&
        typeof entry.lookId === 'string' &&
        lookIds.has(entry.lookId) &&
        isImageDataUrl(entry.dataUrl)
    )
    .map(entry => ({
      lookId: entry.lookId,
      name: String(entry.name || 'look.png'),
      dataUrl: entry.dataUrl,
    }));
  const outfitPictures = keyedPictures(file.outfitPictures, 'outfit.png');
  const wardrobePictures = keyedPictures(file.wardrobePictures, 'wardrobe.png');
  const sheetPictures = keyedPictures(file.sheetPictures, 'sheet.png');
  return {
    kind: CAST_FILE_KIND,
    version: file.version,
    exportedAt: typeof file.exportedAt === 'number' ? file.exportedAt : 0,
    character,
    ...(picture ? { picture } : {}),
    ...(lookPictures.length ? { lookPictures } : {}),
    ...(outfitPictures.length ? { outfitPictures } : {}),
    ...(wardrobePictures.length ? { wardrobePictures } : {}),
    ...(sheetPictures.length ? { sheetPictures } : {}),
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
