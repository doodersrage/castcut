'use client';

/**
 * Export a Cast to a file and import one (cast-transfer.ts holds the file format).
 */
import {
  activeLook,
  getCharacter,
  loadCharacters,
  slugCharacterName,
  upsertCharacter,
  type CharacterRecord,
} from './character-os';
import {
  buildCastFile,
  castFileDay,
  castFileName,
  parseCastFile,
  placeImportedCast,
  type CastFile,
} from './cast-transfer';
import {
  getRoleplayLibrarySession,
  roleplayLibraryIdForCharacter,
  upsertRoleplayLibrarySession,
} from './roleplay-library';
import { loadSettingsCache, loadToolSettings, saveToolSettings } from './settings-cache';
import { DEFAULT_DAY_TOOL_CACHE } from './play-settings';

/** The Cast's own picture: its face lock, else its reference photo. */
export function castPictureUrl(character: CharacterRecord): string {
  const look = activeLook(character);
  return (
    look.ipAdapter?.imageUrl?.trim() ||
    character.ipAdapter?.imageUrl?.trim() ||
    look.reference?.isolatedUrl?.trim() ||
    look.reference?.originalUrl?.trim() ||
    character.reference?.isolatedUrl?.trim() ||
    character.reference?.originalUrl?.trim() ||
    ''
  );
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the picture.'));
    reader.readAsDataURL(blob);
  });
}

async function pictureOf(
  character: CharacterRecord
): Promise<{ name: string; dataUrl: string } | null> {
  const url = castPictureUrl(character);
  if (!url) return null;
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    return {
      name: `${slugCharacterName(character.name) || 'cast'}.png`,
      dataUrl: await blobToDataUrl(blob),
    };
  } catch {
    return null;
  }
}

/** Build the file for a Cast. `pictureMissing` when its picture could not be read. */
export async function exportCast(
  characterId: string
): Promise<{ file: CastFile; filename: string; pictureMissing: boolean }> {
  const character = getCharacter(characterId);
  if (!character) throw new Error('That Cast character is not on this device.');
  const sessionId = roleplayLibraryIdForCharacter(character.id);
  const story = sessionId ? getRoleplayLibrarySession(sessionId) : null;
  const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
  const activeId = loadSettingsCache().shared.activeCharacterId?.trim();
  const dayOwner = day.stillsCharacterId?.trim() || activeId;
  const plan =
    dayOwner === character.id ? castFileDay(day) : castFileDay(day.parkedDays?.[character.id]);
  const picture = await pictureOf(character);
  return {
    file: buildCastFile({ character, picture, stories: story ? [story] : [], day: plan }),
    filename: castFileName(character.name),
    pictureMissing: Boolean(castPictureUrl(character)) && !picture,
  };
}

export async function downloadCastFile(characterId: string): Promise<{ pictureMissing: boolean }> {
  const { file, filename, pictureMissing } = await exportCast(characterId);
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { pictureMissing };
}

function newCastId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `char-${crypto.randomUUID()}`
    : `char-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, body = ''] = dataUrl.split(',', 2);
  const type = /^data:([^;]+)/.exec(head ?? '')?.[1] || 'image/png';
  const bytes = Uint8Array.from(atob(body), char => char.charCodeAt(0));
  return new File([bytes], name, { type });
}

export type CastImportResult = {
  character: CharacterRecord;
  /** It got a new id or name because one here was taken. */
  renamed: boolean;
  stories: number;
  dayPlan: boolean;
  /** The picture could not be set up as the plate (ComfyUI unreachable, …). */
  pictureError?: string;
};

/** Read a Cast file and add the Cast here. Never replaces a Cast that is already here. */
export async function importCastFile(file: File): Promise<CastImportResult> {
  let parsed: CastFile | null = null;
  try {
    parsed = parseCastFile(JSON.parse(await file.text()) as unknown);
  } catch {
    parsed = null;
  }
  if (!parsed) throw new Error('That file is not a Castcut Cast file.');
  const existing = loadCharacters();
  const placed = placeImportedCast(parsed, {
    idTaken: id => existing.some(entry => entry.id === id),
    nameTaken: name =>
      existing.some(entry => slugCharacterName(entry.name) === slugCharacterName(name)),
    newId: newCastId,
    sessionIdFor: id => roleplayLibraryIdForCharacter(id) ?? `cast-${id}`,
  });
  upsertCharacter(placed.character);
  const character = getCharacter(placed.character.id) ?? placed.character;
  for (const story of placed.stories) upsertRoleplayLibrarySession(story);
  if (parsed.day) {
    // Parked under the Cast: it comes back when the Cast is picked on Day.
    const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
    saveToolSettings('day', {
      ...day,
      parkedDays: {
        ...(day.parkedDays ?? {}),
        [character.id]: { ...parsed.day, stills: [], at: Date.now() },
      },
    });
  }
  let pictureError: string | undefined;
  let finalCharacter = character;
  if (parsed.picture) {
    try {
      const { applyCastLookPlateFromSource } = await import('./look-outfit-plate');
      const applied = await applyCastLookPlateFromSource({
        characterId: character.id,
        file: dataUrlToFile(parsed.picture.dataUrl, parsed.picture.name),
        isolate: false,
        alreadyIsolated: true,
      });
      finalCharacter = applied.character;
    } catch (err) {
      pictureError = err instanceof Error ? err.message : 'Could not set up the picture.';
    }
  }
  return {
    character: finalCharacter,
    renamed: placed.renamed || placed.character.name !== parsed.character.name,
    stories: placed.stories.length,
    dayPlan: Boolean(parsed.day),
    ...(pictureError ? { pictureError } : {}),
  };
}
