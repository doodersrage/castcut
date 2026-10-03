/**
 * When a gallery job belongs on a Character OS record.
 * Active-character leftover must not stamp Compose (or other foreign tools).
 */

import { looksOf, loadCharacters } from './character-os';
import { clearGalleryCharacterStamp, loadComfyGallery } from './comfyui-gallery';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

const CHARACTER_QUEUE_TOOLS = new Set([
  'character',
  'roleplay',
  'video',
  'generate',
  'lora-validation',
  // Film loop — Look / Outfit / Day stamp Cast media; must not be stripped on Cast home.
  'moodboard',
  'fitting',
  'day',
  'image-prompt',
  'play',
]);

const CHARACTER_DERIVED_KINDS = new Set<NonNullable<ComfyGalleryEntry['derivedKind']>>([
  'upscale',
  'refine',
  'soft-pass',
  'variation',
  'moire-clean',
  'face-detail',
  'controlnet',
  'i2v',
  't2v',
  'extend',
  'film',
]);

export function inheritsActiveCharacterStamp(tool: string | undefined): boolean {
  return CHARACTER_QUEUE_TOOLS.has((tool ?? '').trim());
}

export function inheritsParentCharacterStamp(
  tool: string | undefined,
  derivedKind: ComfyGalleryEntry['derivedKind'] | undefined
): boolean {
  if (derivedKind && CHARACTER_DERIVED_KINDS.has(derivedKind)) {
    return true;
  }
  return inheritsActiveCharacterStamp(tool);
}

export function isForeignCharacterStamp(
  entry: Pick<ComfyGalleryEntry, 'tool' | 'derivedKind'>
): boolean {
  return (
    !inheritsActiveCharacterStamp(entry.tool) &&
    !inheritsParentCharacterStamp(entry.tool, entry.derivedKind)
  );
}

export function resolveGalleryCharacterStamp(input: {
  characterId?: string;
  parentCharacterId?: string;
  activeCharacterId?: string;
  tool?: string;
  derivedKind?: ComfyGalleryEntry['derivedKind'];
}): string | undefined {
  const explicit = input.characterId?.trim();
  if (explicit) {
    return explicit;
  }
  const parent = input.parentCharacterId?.trim();
  if (parent && inheritsParentCharacterStamp(input.tool, input.derivedKind)) {
    return parent;
  }
  const active = input.activeCharacterId?.trim();
  if (active && inheritsActiveCharacterStamp(input.tool)) {
    return active;
  }
  return undefined;
}

/**
 * The look a Cast job is stamped with, so the still remembers which look it was made in.
 * - A derived job (face pass, upscale, clip of a still…) is its parent's look, when the parent
 *   is the same Cast's — animating last week's beach still is the beach look, whichever look
 *   is active now.
 * - Otherwise the look the caller named, then the parent's.
 * - Otherwise the shared active look, but only when the shared active Cast is this Cast (the
 *   shared look of another Cast is not one of this Cast's looks), then the Cast's own active look.
 */
export function resolveGalleryLookStamp(input: {
  /** The resolved Cast stamp (resolveGalleryCharacterStamp). */
  characterId?: string;
  lookId?: string;
  parent?: { characterId?: string; lookId?: string } | null;
  derivedKind?: ComfyGalleryEntry['derivedKind'];
  sharedActiveCharacterId?: string;
  sharedActiveLookId?: string;
  /** The Cast record's own active look. */
  castActiveLookId?: string;
}): string | undefined {
  const characterId = input.characterId?.trim();
  if (!characterId) {
    return undefined;
  }
  const parentLook =
    input.parent?.characterId?.trim() === characterId
      ? input.parent.lookId?.trim() || undefined
      : undefined;
  if (input.derivedKind && parentLook) {
    return parentLook;
  }
  const explicit = input.lookId?.trim();
  if (explicit) {
    return explicit;
  }
  if (parentLook) {
    return parentLook;
  }
  const sharedLook = input.sharedActiveLookId?.trim();
  if (sharedLook && input.sharedActiveCharacterId?.trim() === characterId) {
    return sharedLook;
  }
  return input.castActiveLookId?.trim() || undefined;
}

/** Strip leftover Compose (and other foreign-tool) stamps. Keepers stay. */
export function unstampForeignCharacterGalleryEntries(): number {
  const keep = new Set(
    loadCharacters().flatMap(character =>
      looksOf(character).flatMap(look => look.keeperEntryIds ?? [])
    )
  );
  const ids = loadComfyGallery()
    .filter(
      entry =>
        Boolean(entry.characterId?.trim()) && isForeignCharacterStamp(entry) && !keep.has(entry.id)
    )
    .map(entry => entry.id);
  return clearGalleryCharacterStamp(ids);
}
