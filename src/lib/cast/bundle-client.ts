'use client';

/**
 * A Cast bundle (.tar): the Cast file's record, Story and Day plan, plus the pictures the plain
 * Cast file leaves behind — every look's plate and face, earlier plates, dress plates, packshots
 * (ComfyUI files, under their own names) — and its films (optionally its stills too) with their
 * Gallery entries and kept copies. The archive and the chunked restore are the Pictures backup's
 * (media-backup-server.ts); this adds which files, and adding the Cast from its data file.
 */
import {
  getCharacter,
  loadCharacters,
  looksOf,
  lookPlateKey,
  slugCharacterName,
  upsertCharacter,
  type CharacterRecord,
} from '../character/os';
import { castFileDay, castFileName, placeImportedCast, type CastFileDay } from './transfer';
import { loadComfyGallery, saveComfyGallery } from '../gallery/comfyui-gallery';
import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery-entry';
import { loadComfyUiSettings } from '../comfyui/settings';
import type { DayDressPlateEntry } from '../day/dress-plate-cache';
import { loadDressPlates, replaceDressPlates } from '../day/dress-plate-store';
import { collectComfyFileRefs } from '../storage/media-backup-refs';
import {
  restorePicturesBackup,
  type MediaRestoreProgress,
  type MediaRestoreStatus,
} from '../storage/media-backup-client';
import { isAssembledFilmEntry } from '../media/kind';
import { DEFAULT_DAY_TOOL_CACHE } from '../play/settings';
import {
  getRoleplayLibrarySession,
  roleplayLibraryIdForCharacter,
  upsertRoleplayLibrarySession,
  type RoleplayLibrarySession,
} from '../story/roleplay-library';
import { loadSettingsCache, loadToolSettings, saveToolSettings } from '../settings/cache';

export const CAST_BUNDLE_KIND = 'castcut-cast-bundle';
export const CAST_BUNDLE_VERSION = 1;

export type CastBundleData = {
  kind: typeof CAST_BUNDLE_KIND;
  version: number;
  exportedAt: number;
  /** The whole record, file names and all: the bundle carries those files. */
  character: CharacterRecord;
  stories: RoleplayLibrarySession[];
  day?: CastFileDay;
  galleryEntries: ComfyGalleryEntry[];
  dressPlates: DayDressPlateEntry[];
};

/** The Cast's Gallery entries a bundle carries: its films, and its stills when asked. */
export function castBundleEntries(
  gallery: ComfyGalleryEntry[],
  characterId: string,
  includeStills: boolean
): ComfyGalleryEntry[] {
  return gallery.filter(
    entry =>
      entry.characterId === characterId &&
      entry.status === 'completed' &&
      (includeStills || isAssembledFilmEntry(entry))
  );
}

/** Dress plates made from any of the Cast's plates, current or earlier (keyed by the plate). */
export function castBundleDressPlates(
  plates: DayDressPlateEntry[],
  character: CharacterRecord
): DayDressPlateEntry[] {
  const names = new Set<string>();
  for (const look of looksOf(character)) {
    for (const entry of [look, ...(look.plateHistory ?? [])]) {
      const reference = entry.reference;
      for (const value of [
        reference?.isolatedFilename,
        reference?.originalFilename,
        reference?.isolatedUrl,
        reference?.originalUrl,
        entry.ipAdapter?.imageFilename,
        lookPlateKey(entry),
      ]) {
        if (value?.trim()) names.add(value.trim());
      }
    }
  }
  return plates.filter(plate => {
    const source = plate.key.split('|')[1]?.trim() ?? '';
    return Boolean(source) && [...names].some(name => source === name || source.endsWith(name));
  });
}

/**
 * Kept copies the Cast's data shows through `/api/gallery/media/<id>` — its look plates
 * (`cast-plate-…`), earlier plates, dress plates — besides its Gallery entries.
 */
export function galleryMediaIdsIn(value: unknown): string[] {
  const ids = new Set<string>();
  for (const match of JSON.stringify(value ?? null).matchAll(
    /\/api\/gallery\/media\/([A-Za-z0-9._-]{1,128})/g
  )) {
    ids.add(match[1]!);
  }
  return [...ids];
}

/** Counts for the export panel. */
export function castBundleCounts(characterId: string): { films: number; stills: number } {
  const entries = castBundleEntries(loadComfyGallery(), characterId, true);
  const films = entries.filter(entry => isAssembledFilmEntry(entry)).length;
  return { films, stills: entries.length - films };
}

function castDayPlan(character: CharacterRecord): CastFileDay | undefined {
  const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
  const activeId = loadSettingsCache().shared.activeCharacterId?.trim();
  const dayOwner = day.stillsCharacterId?.trim() || activeId;
  return dayOwner === character.id ? castFileDay(day) : castFileDay(day.parkedDays?.[character.id]);
}

export async function downloadCastBundle(
  characterId: string,
  options: { includeStills: boolean }
): Promise<{ entries: number; pictures: number }> {
  const character = getCharacter(characterId);
  if (!character) throw new Error('That Cast character is not on this device.');
  const sessionId = roleplayLibraryIdForCharacter(character.id);
  const story = sessionId ? getRoleplayLibrarySession(sessionId) : null;
  const galleryEntries = castBundleEntries(loadComfyGallery(), character.id, options.includeStills);
  const dressPlates = castBundleDressPlates(loadDressPlates(), character);
  const data: CastBundleData = {
    kind: CAST_BUNDLE_KIND,
    version: CAST_BUNDLE_VERSION,
    exportedAt: Date.now(),
    character,
    stories: story ? [story] : [],
    ...(castDayPlan(character) ? { day: castDayPlan(character) } : {}),
    galleryEntries,
    dressPlates,
  };
  // The record's pictures, the dress plates, and the ComfyUI files of entries the Gallery kept no
  // copy of (a film or a kept still travels as its copy; its `images` only name it).
  // `galleryEntries` is not a key the collector skips.
  const comfyFiles = collectComfyFileRefs({
    character,
    dressPlates,
    galleryEntries: galleryEntries
      .filter(entry => !entry.durableOriginalPath?.trim())
      .map(entry => ({ images: entry.images })),
  });
  const response = await fetch('/api/storage/media-backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      comfyFiles,
      galleryEntryIds: [
        ...new Set([
          ...galleryEntries.map(entry => entry.id),
          ...galleryMediaIdsIn({ character, dressPlates, stories: data.stories }),
        ]),
      ],
      castData: JSON.stringify(data),
      filename: castFileName(character.name).replace(/\.json$/i, '') + '-bundle',
      comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok || !body.url) throw new Error(body.error ?? `HTTP ${response.status}`);
  const link = document.createElement('a');
  link.href = body.url;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return { entries: galleryEntries.length, pictures: comfyFiles.length };
}

/**
 * Media links name the install they came from (`comfyUrl=` on view links, an entry's
 * `comfyUrl`); on this install they must point at its own ComfyUI.
 */
export function withoutOldComfyHost<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value).replace(/([?&])comfyUrl=[^&"\\]*(&?)/g, (_match, lead, tail) =>
      tail ? lead : ''
    )
  ) as T;
}

function newCastId(): string {
  return `char-${crypto.randomUUID()}`;
}

export function parseCastBundleData(text: string | undefined): CastBundleData | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text) as Partial<CastBundleData>;
    if (data.kind !== CAST_BUNDLE_KIND || typeof data.version !== 'number') return null;
    if (data.version > CAST_BUNDLE_VERSION) return null;
    if (!data.character || typeof data.character.name !== 'string') return null;
    return {
      kind: CAST_BUNDLE_KIND,
      version: data.version,
      exportedAt: typeof data.exportedAt === 'number' ? data.exportedAt : 0,
      character: data.character,
      stories: Array.isArray(data.stories) ? data.stories : [],
      ...(data.day?.slots?.length ? { day: data.day } : {}),
      galleryEntries: Array.isArray(data.galleryEntries) ? data.galleryEntries : [],
      dressPlates: Array.isArray(data.dressPlates) ? data.dressPlates : [],
    };
  } catch {
    return null;
  }
}

export type CastBundleImportResult = {
  character: CharacterRecord;
  renamed: boolean;
  entries: number;
  dressPlates: number;
  status: MediaRestoreStatus;
  /** Pictures that did not arrive: already missing when exported, or failed here. */
  missing: string[];
};

/** Add a Cast from a bundle's data, after its files were restored here. Never replaces a Cast. */
export function addCastFromBundle(raw: CastBundleData): {
  character: CharacterRecord;
  renamed: boolean;
  entries: number;
  dressPlates: number;
} {
  const data = withoutOldComfyHost(raw);
  const existing = loadCharacters();
  const placed = placeImportedCast(
    {
      kind: 'castcut-cast',
      version: 1,
      exportedAt: data.exportedAt,
      character: data.character,
      stories: data.stories,
      ...(data.day ? { day: data.day } : {}),
    },
    {
      idTaken: id => existing.some(entry => entry.id === id),
      nameTaken: name =>
        existing.some(entry => slugCharacterName(entry.name) === slugCharacterName(name)),
      newId: newCastId,
      sessionIdFor: id => roleplayLibraryIdForCharacter(id) ?? `cast-${id}`,
    }
  );
  upsertCharacter(placed.character);
  const character = getCharacter(placed.character.id) ?? placed.character;
  for (const story of placed.stories) upsertRoleplayLibrarySession(story);
  if (data.day) {
    const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
    saveToolSettings('day', {
      ...day,
      parkedDays: {
        ...(day.parkedDays ?? {}),
        [character.id]: { ...data.day, stills: [], at: Date.now() },
      },
    });
  }
  // Empty: view links carry no comfyUrl= and use this server's own ComfyUI.
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const gallery = loadComfyGallery();
  const have = new Set(gallery.map(entry => entry.id));
  const added = data.galleryEntries
    .filter(entry => entry?.id && !have.has(entry.id))
    .map(entry => ({ ...entry, characterId: character.id, comfyUrl: comfyUrl ?? '' }));
  if (added.length) saveComfyGallery([...added, ...gallery]);
  const plates = loadDressPlates();
  const plateKeys = new Set(plates.map(plate => plate.key));
  const newPlates = data.dressPlates.filter(plate => plate?.key && !plateKeys.has(plate.key));
  if (newPlates.length) replaceDressPlates([...plates, ...newPlates]);
  return {
    character,
    renamed: placed.renamed || character.name !== data.character.name,
    entries: added.length,
    dressPlates: newPlates.length,
  };
}

/** Upload a Cast bundle, unpack its files here, then add the Cast. */
export async function importCastBundle(
  file: File,
  onProgress: (progress: MediaRestoreProgress) => void
): Promise<CastBundleImportResult> {
  const status = await restorePicturesBackup(file, onProgress);
  if (status.state === 'failed') throw new Error(status.message ?? 'Could not unpack the bundle.');
  const data = parseCastBundleData(status.castData);
  if (!data) throw new Error('That file is not a Castcut Cast bundle.');
  const added = addCastFromBundle(data);
  return {
    ...added,
    status,
    missing: [
      ...(status.missingAtExport ?? []),
      ...status.errors.map(error => error.split(':')[0] ?? error),
    ],
  };
}
