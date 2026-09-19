/**
 * Gallery entries that must survive Archive & purge / Clear all:
 * favorites, ≥4★, Cast look keeperEntryIds, and stills matching Cast look plates.
 */

import { looksOf, type CharacterRecord } from './character-os';
import { GALLERY_CAP_KEEPER_MIN_RATING, type GalleryCapEntry } from './gallery-cap';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { isIdentityMediaUrl } from './gallery-media-client';

export type GalleryProtectableEntry = GalleryCapEntry &
  Pick<ComfyGalleryEntry, 'images' | 'durableOriginalPath' | 'durableOriginalPaths'>;

/** Normalize a URL or filename into match tokens (full string, basename, id:…). */
export function galleryMediaMatchTokens(value: string | null | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }
  const tokens = new Set<string>();
  const lower = trimmed.toLowerCase();
  tokens.add(lower);

  const mediaMatch = trimmed.match(/\/api\/gallery\/media\/([^/?#]+)/i);
  if (mediaMatch?.[1]) {
    let entryId = mediaMatch[1];
    try {
      entryId = decodeURIComponent(entryId);
    } catch {
      // keep raw
    }
    const idLower = entryId.toLowerCase();
    if (idLower !== 'identity' && idLower !== 'persist' && !isIdentityMediaUrl(trimmed)) {
      tokens.add(`id:${idLower}`);
    }
  }

  const filenameMatch = trimmed.match(/[?&]filename=([^&]+)/i);
  if (filenameMatch?.[1]) {
    let filename = filenameMatch[1];
    try {
      filename = decodeURIComponent(filename.replace(/\+/g, ' '));
    } catch {
      // keep raw
    }
    const fn = filename.trim().toLowerCase();
    if (fn) {
      tokens.add(fn);
    }
  }

  const pathOnly = trimmed.split('?')[0] ?? '';
  const base = pathOnly.split('/').pop()?.trim();
  if (base && base.includes('.')) {
    let decoded = base;
    try {
      decoded = decodeURIComponent(base);
    } catch {
      // keep raw
    }
    tokens.add(decoded.toLowerCase());
  } else if (base && !base.includes('/') && trimmed === base) {
    // bare filename without extension still useful (Comfy input names)
    tokens.add(base.toLowerCase());
  }

  return [...tokens];
}

function addTokens(target: Set<string>, value: string | null | undefined): void {
  for (const token of galleryMediaMatchTokens(value)) {
    target.add(token);
  }
}

function collectPlateTokensFromReference(
  target: Set<string>,
  reference: CharacterRecord['reference'] | undefined
): void {
  if (!reference) {
    return;
  }
  addTokens(target, reference.originalUrl);
  addTokens(target, reference.isolatedUrl);
  addTokens(target, reference.originalFilename);
  addTokens(target, reference.isolatedFilename);
}

function collectPlateTokensFromIpAdapter(
  target: Set<string>,
  ip: CharacterRecord['ipAdapter'] | undefined
): void {
  if (!ip) {
    return;
  }
  addTokens(target, ip.imageUrl);
  addTokens(target, ip.comfyUrl);
  addTokens(target, ip.imageFilename);
  for (const filename of ip.imageFilenames ?? []) {
    addTokens(target, filename);
  }
}

/** Tokens from Cast character + look plates (URLs, filenames, durable media ids). */
export function collectCastPlateMediaTokens(characters: CharacterRecord[]): Set<string> {
  const tokens = new Set<string>();
  for (const character of characters) {
    collectPlateTokensFromReference(tokens, character.reference);
    collectPlateTokensFromIpAdapter(tokens, character.ipAdapter);
    for (const look of looksOf(character)) {
      collectPlateTokensFromReference(tokens, look.reference);
      collectPlateTokensFromIpAdapter(tokens, look.ipAdapter);
      for (const keeperId of look.keeperEntryIds ?? []) {
        const id = keeperId.trim();
        if (id) {
          tokens.add(`id:${id.toLowerCase()}`);
        }
      }
    }
  }
  return tokens;
}

/** Explicit look keeper entry ids across the Cast roster. */
export function collectCastKeeperEntryIds(characters: CharacterRecord[]): Set<string> {
  const ids = new Set<string>();
  for (const character of characters) {
    for (const look of looksOf(character)) {
      for (const keeperId of look.keeperEntryIds ?? []) {
        const id = keeperId.trim();
        if (id) {
          ids.add(id);
        }
      }
    }
  }
  return ids;
}

function entryMatchTokens(entry: GalleryProtectableEntry): string[] {
  const tokens = new Set<string>([`id:${entry.id.toLowerCase()}`]);
  for (const image of entry.images ?? []) {
    addTokens(tokens, image.filename);
  }
  addTokens(tokens, entry.durableOriginalPath);
  for (const path of entry.durableOriginalPaths ?? []) {
    addTokens(tokens, path ?? undefined);
  }
  return [...tokens];
}

export function galleryEntryMatchesCastPlate(
  entry: GalleryProtectableEntry,
  plateTokens: Set<string>
): boolean {
  if (plateTokens.size === 0) {
    return false;
  }
  for (const token of entryMatchTokens(entry)) {
    if (plateTokens.has(token)) {
      return true;
    }
  }
  return false;
}

export type GalleryProtectionReason = 'favorite' | 'rating' | 'look-keeper' | 'cast-plate';

export function galleryEntryProtectionReason(
  entry: GalleryProtectableEntry,
  options: {
    keeperEntryIds: Set<string>;
    plateTokens: Set<string>;
  }
): GalleryProtectionReason | null {
  if (options.keeperEntryIds.has(entry.id)) {
    return 'look-keeper';
  }
  if (galleryEntryMatchesCastPlate(entry, options.plateTokens)) {
    return 'cast-plate';
  }
  if (entry.favorite) {
    return 'favorite';
  }
  if ((entry.reviewRating ?? 0) >= GALLERY_CAP_KEEPER_MIN_RATING) {
    return 'rating';
  }
  return null;
}

export function isGalleryArchiveProtected(
  entry: GalleryProtectableEntry,
  options: {
    keeperEntryIds: Set<string>;
    plateTokens: Set<string>;
  }
): boolean {
  return galleryEntryProtectionReason(entry, options) !== null;
}

/** Partition gallery into protected keepers vs purgeable rest. */
export function partitionGalleryForArchivePurge<T extends GalleryProtectableEntry>(
  entries: T[],
  characters: CharacterRecord[]
): { protected: T[]; purgeable: T[] } {
  const keeperEntryIds = collectCastKeeperEntryIds(characters);
  const plateTokens = collectCastPlateMediaTokens(characters);
  const protectedEntries: T[] = [];
  const purgeable: T[] = [];
  for (const entry of entries) {
    if (
      isGalleryArchiveProtected(entry, {
        keeperEntryIds,
        plateTokens,
      })
    ) {
      protectedEntries.push(entry);
    } else {
      purgeable.push(entry);
    }
  }
  return { protected: protectedEntries, purgeable };
}

/** Ids that Archive & purge / local cap trim must keep. */
export function collectGalleryProtectedEntryIds(
  entries: GalleryProtectableEntry[],
  characters: CharacterRecord[]
): Set<string> {
  return new Set(
    partitionGalleryForArchivePurge(entries, characters).protected.map(entry => entry.id)
  );
}
