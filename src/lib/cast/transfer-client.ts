'use client';

/**
 * Export a Cast to a file and import one (cast-transfer.ts holds the file format).
 */
import {
  activeLook,
  getCharacter,
  loadCharacters,
  looksOf,
  slugCharacterName,
  upsertCharacter,
  type CharacterLook,
  type CharacterRecord,
} from '../character/os';
import {
  buildCastFile,
  castFileDay,
  castOutfitPhotoRefs,
  castFileName,
  parseCastFile,
  placeImportedCast,
  type CastFile,
  type CastFileLookPicture,
  type CastFileOutfitPicture,
  sheetPictureKey,
  withOutfitPhotosMoved,
  withReferenceSheetsMoved,
} from './transfer';
import { loadComfyUiSettings } from '../comfyui/settings';
import { collectIsolateSourceUrls, loadImageBlobFromUrls } from '../edit/isolate-subject';
import {
  getRoleplayLibrarySession,
  roleplayLibraryIdForCharacter,
  upsertRoleplayLibrarySession,
} from '../story/roleplay-library';
import { loadSettingsCache, loadToolSettings, saveToolSettings } from '../settings/cache';
import { DEFAULT_DAY_TOOL_CACHE } from '../play/settings';

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

/** One look's picture: its plate, else its face lock. */
function lookPictureUrl(look: CharacterLook): string {
  return (
    look.reference?.isolatedUrl?.trim() ||
    look.reference?.originalUrl?.trim() ||
    look.ipAdapter?.imageUrl?.trim() ||
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

async function pictureAt(
  url: string,
  name: string
): Promise<{ name: string; dataUrl: string } | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    return { name, dataUrl: await blobToDataUrl(blob) };
  } catch {
    return null;
  }
}

function fileSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The clothing and shoe photos of the Cast's outfits (kept per look, the Wardrobe). */
async function outfitPictures(
  character: CharacterRecord
): Promise<{ pictures: CastFileOutfitPicture[]; missing: number }> {
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const pictures: CastFileOutfitPicture[] = [];
  let missing = 0;
  for (const ref of castOutfitPhotoRefs(character)) {
    try {
      const blob = await loadImageBlobFromUrls(
        collectIsolateSourceUrls({ imageUrl: ref.url, filename: ref.filename, comfyUrl })
      );
      if (!blob.type.startsWith('image/')) throw new Error('not an image');
      const name = ref.filename?.split('/').pop() || `outfit-${pictures.length + 1}.png`;
      pictures.push({ key: ref.key, name, dataUrl: await blobToDataUrl(blob) });
    } catch {
      missing += 1;
    }
  }
  return { pictures, missing };
}

/** A still for each Wardrobe entry: its latest Gallery still, else the one it was imported with. */
async function wardrobeStills(
  character: CharacterRecord
): Promise<{ pictures: CastFileOutfitPicture[]; missing: number }> {
  const items = Array.isArray(character.wardrobe) ? character.wardrobe : [];
  if (!items.length) return { pictures: [], missing: 0 };
  const { loadComfyGallery, galleryEntryPrimaryViewUrl, galleryEntryPrimaryThumbUrl } =
    await import('../gallery/comfyui-gallery');
  const gallery = loadComfyGallery();
  const pictures: CastFileOutfitPicture[] = [];
  let missing = 0;
  for (const item of items) {
    const urls = [
      ...(item.promptIds ?? []).flatMap(id => {
        const entry = gallery.find(candidate => candidate.promptId === id);
        return entry
          ? [galleryEntryPrimaryViewUrl(entry), galleryEntryPrimaryThumbUrl(entry)].filter(
              (url): url is string => Boolean(url)
            )
          : [];
      }),
      ...(item.pictureUrl ? [item.pictureUrl] : []),
    ];
    if (!urls.length) continue;
    let picture: { name: string; dataUrl: string } | null = null;
    for (const url of urls) {
      picture = await pictureAt(url, `wardrobe-${pictures.length + 1}.png`);
      if (picture) break;
    }
    if (picture) pictures.push({ key: item.key, ...picture });
    else missing += 1;
  }
  return { pictures, missing };
}

/** Each look's reference sheet renders. */
async function sheetPictures(
  character: CharacterRecord
): Promise<{ pictures: CastFileOutfitPicture[]; missing: number }> {
  const slug = fileSlug(character.name) || 'cast';
  const pictures: CastFileOutfitPicture[] = [];
  let missing = 0;
  for (const look of character.looks ?? []) {
    for (const view of look?.referenceSheet ?? []) {
      const picture = await pictureAt(
        view.url,
        `${slug}-${fileSlug(look.name) || 'look'}-${fileSlug(view.id)}.png`
      );
      if (picture) pictures.push({ key: sheetPictureKey(look.id, view.id), ...picture });
      else missing += 1;
    }
  }
  return { pictures, missing };
}

/** Upload a file's outfit photos to this install's ComfyUI: old key → the copy here. */
async function placeOutfitPictures(
  pictures: CastFileOutfitPicture[]
): Promise<{ moved: Map<string, { filename: string; url: string }>; error?: string }> {
  const moved = new Map<string, { filename: string; url: string }>();
  if (!pictures.length) return { moved };
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const [{ resolveQueueInputImage }, { stampedUploadName }] = await Promise.all([
    import('../queue/input-image'),
    import('../storage/upload-name'),
  ]);
  let error: string | undefined;
  for (const picture of pictures) {
    try {
      const name = stampedUploadName(picture.name);
      const uploaded = await resolveQueueInputImage({
        file: dataUrlToFile(picture.dataUrl, name),
        filename: name,
      });
      const filename = uploaded?.filename?.trim();
      if (!filename) throw new Error('ComfyUI did not take the outfit photo.');
      moved.set(picture.key, {
        filename,
        url: collectIsolateSourceUrls({ filename, comfyUrl })[0] ?? '',
      });
    } catch (err) {
      error ??= err instanceof Error ? err.message : 'Could not upload an outfit photo.';
    }
  }
  return { moved, error };
}

/** Every look besides the active one with a picture of its own. */
async function otherLookPictures(
  character: CharacterRecord
): Promise<{ pictures: CastFileLookPicture[]; missing: number }> {
  const active = activeLook(character).id;
  const slug = fileSlug(character.name) || 'cast';
  const pictures: CastFileLookPicture[] = [];
  let missing = 0;
  for (const look of character.looks?.length ? looksOf(character) : []) {
    if (look.id === active) continue;
    const url = lookPictureUrl(look);
    if (!url) continue;
    const picture = await pictureAt(url, `${slug}-${fileSlug(look.name) || 'look'}.png`);
    if (picture) pictures.push({ lookId: look.id, ...picture });
    else missing += 1;
  }
  return { pictures, missing };
}

/** Build the file for a Cast. `pictureMissing` when one of its pictures could not be read. */
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
  const activeUrl = lookPictureUrl(activeLook(character)) || castPictureUrl(character);
  const picture = await pictureAt(activeUrl, `${slugCharacterName(character.name) || 'cast'}.png`);
  const looks = await otherLookPictures(character);
  const outfits = await outfitPictures(character);
  const stills = await wardrobeStills(character);
  const sheets = await sheetPictures(character);
  return {
    file: buildCastFile({
      character,
      picture,
      lookPictures: looks.pictures,
      outfitPictures: outfits.pictures,
      wardrobePictures: stills.pictures,
      sheetPictures: sheets.pictures,
      stories: story ? [story] : [],
      day: plan,
    }),
    filename: castFileName(character.name),
    pictureMissing:
      (Boolean(activeUrl) && !picture) ||
      looks.missing + outfits.missing + stills.missing + sheets.missing > 0,
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
  // Its outfits' clothing and shoe photos, uploaded here before the Cast is saved with them.
  const outfits = await placeOutfitPictures(parsed.outfitPictures ?? []);
  const stills = await placeOutfitPictures(parsed.wardrobePictures ?? []);
  const sheets = await placeOutfitPictures(parsed.sheetPictures ?? []);
  const dressed = withOutfitPhotosMoved(
    placed.character,
    outfits.moved,
    new Map([...stills.moved].map(([key, copy]) => [key, copy.url]))
  );
  // A file from before sheets travelled keeps its sheet links (they work on the same install).
  upsertCharacter(
    parsed.sheetPictures
      ? withReferenceSheetsMoved(
          dressed,
          new Map([...sheets.moved].map(([key, copy]) => [key, copy.url]))
        )
      : dressed
  );
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
  let pictureError: string | undefined = outfits.error ?? stills.error ?? sheets.error;
  let finalCharacter = character;
  if (parsed.picture || parsed.lookPictures?.length) {
    const { applyCastLookPlateFromSource } = await import('../look/outfit-plate');
    // The other looks first, each as its own plate; the active look's last (it is Outfit's).
    const queue = [
      ...(parsed.lookPictures ?? []),
      ...(parsed.picture ? [{ ...parsed.picture, lookId: undefined }] : []),
    ];
    for (const entry of queue) {
      try {
        const applied = await applyCastLookPlateFromSource({
          characterId: character.id,
          file: dataUrlToFile(entry.dataUrl, entry.name),
          isolate: false,
          alreadyIsolated: true,
          ...(entry.lookId ? { lookId: entry.lookId } : {}),
        });
        finalCharacter = applied.character;
      } catch (err) {
        pictureError ??= err instanceof Error ? err.message : 'Could not set up the picture.';
      }
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
