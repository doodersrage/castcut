/**
 * Gallery entries that must survive Archive & purge / Clear all:
 * favorites, ≥4★, Cast look keeperEntryIds, stills matching Cast look plates, and renders the
 * production uses (reference-sources.ts).
 */

import { looksOf, type CharacterRecord } from '../character/os';
import { GALLERY_CAP_KEEPER_MIN_RATING, type GalleryCapEntry } from './cap';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { isIdentityMediaUrl } from './media-client';
import { collectGalleryReferenceValues } from './reference-sources';

export type GalleryProtectableEntry = GalleryCapEntry &
  Pick<ComfyGalleryEntry, 'images' | 'durableOriginalPath' | 'durableOriginalPaths'> &
  Partial<Pick<ComfyGalleryEntry, 'promptId'>>;

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
      // A posed Keep's standing picture is Day and Story's plate (fitting/keeper-stand-in.ts).
      for (const standIn of Object.values(look.keeperStandIns ?? {})) {
        const id = standIn?.entryId?.trim();
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

/** Match tokens for the values the production holds (prompt ids, entry ids, media URLs). */
export function galleryReferenceTokens(values: Iterable<string>): Set<string> {
  const tokens = new Set<string>();
  for (const value of values) addTokens(tokens, value);
  return tokens;
}

/** The entry is one the production uses: by prompt id, entry id, or its media. */
export function galleryEntryIsReferenced(
  entry: GalleryProtectableEntry,
  referenceTokens: Set<string>
): boolean {
  if (referenceTokens.size === 0) return false;
  const promptId = entry.promptId?.trim().toLowerCase();
  if (promptId && referenceTokens.has(promptId)) return true;
  if (referenceTokens.has(entry.id.toLowerCase())) return true;
  return entryMatchTokens(entry).some(token => referenceTokens.has(token));
}

/** Ids of the entries the production uses now (the registered sources, read once). */
export function collectGalleryReferencedEntryIds(
  entries: readonly GalleryProtectableEntry[]
): Set<string> {
  const tokens = galleryReferenceTokens(collectGalleryReferenceValues());
  return new Set(
    entries.filter(entry => galleryEntryIsReferenced(entry, tokens)).map(entry => entry.id)
  );
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

export type GalleryProtectionReason =
  'favorite' | 'rating' | 'look-keeper' | 'cast-plate' | 'in-production';

export function galleryEntryProtectionReason(
  entry: GalleryProtectableEntry,
  options: {
    keeperEntryIds: Set<string>;
    plateTokens: Set<string>;
    referenceTokens?: Set<string>;
  }
): GalleryProtectionReason | null {
  if (options.keeperEntryIds.has(entry.id)) {
    return 'look-keeper';
  }
  if (galleryEntryMatchesCastPlate(entry, options.plateTokens)) {
    return 'cast-plate';
  }
  if (options.referenceTokens && galleryEntryIsReferenced(entry, options.referenceTokens)) {
    return 'in-production';
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
    referenceTokens?: Set<string>;
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
  const referenceTokens = galleryReferenceTokens(collectGalleryReferenceValues());
  const protectedEntries: T[] = [];
  const purgeable: T[] = [];
  for (const entry of entries) {
    if (
      isGalleryArchiveProtected(entry, {
        keeperEntryIds,
        plateTokens,
        referenceTokens,
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
