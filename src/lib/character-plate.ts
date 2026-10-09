/**
 * A Cast look's plate — the picture every render starts from: its reference photo (isolated or
 * original) first, else its face lock. Shared: Gallery's Cast filters, Outfit, Day and Story read
 * it (fitting-room re-exports these); docs/architecture-boundaries.md.
 */

import { activeLook, type CharacterLook, type CharacterRecord } from './character-os';

export type FittingPlate = {
  filename?: string;
  imageUrl?: string;
  originalFilename?: string;
  originalUrl?: string;
  isolated?: boolean;
  isolateSubject?: boolean;
};

/** The plate a reference photo or face lock gives: the reference first, else the face lock. */
function plateFromPictures(
  reference: CharacterRecord['reference'] | undefined,
  ip: CharacterRecord['ipAdapter'] | undefined
): FittingPlate | null {
  if (reference) {
    const isolated = reference.isolated === true;
    const filename =
      (isolated ? reference.isolatedFilename : reference.originalFilename)?.trim() ||
      reference.isolatedFilename?.trim() ||
      reference.originalFilename?.trim() ||
      '';
    const imageUrl =
      (isolated ? reference.isolatedUrl : reference.originalUrl)?.trim() ||
      reference.isolatedUrl?.trim() ||
      reference.originalUrl?.trim() ||
      '';
    if (filename || imageUrl) {
      return {
        filename: filename || undefined,
        imageUrl: imageUrl || undefined,
        originalFilename: reference.originalFilename?.trim() || undefined,
        originalUrl: reference.originalUrl?.trim() || undefined,
        isolated,
        isolateSubject: reference.isolateSubject !== false,
      };
    }
  }

  const filename = ip?.imageFilename?.trim() || '';
  const imageUrl = ip?.imageUrl?.trim() || ip?.comfyUrl?.trim() || '';
  if (!filename && !imageUrl) {
    return null;
  }
  return {
    filename: filename || undefined,
    imageUrl: imageUrl || undefined,
    isolated: false,
    isolateSubject: true,
  };
}

/** Resolve a try-on plate from Cast character / active look. */
export function resolveFittingPlateFromCharacter(
  character: CharacterRecord | null | undefined
): FittingPlate | null {
  if (!character) {
    return null;
  }
  let look;
  try {
    look = activeLook(character);
  } catch {
    look = undefined;
  }
  return plateFromPictures(
    look?.reference ?? character.reference,
    look?.ipAdapter ?? character.ipAdapter
  );
}

/** One look's own plate (a Cast can hold several) — no fallback to the active look's. */
export function resolveLookPlate(
  look: Pick<CharacterLook, 'reference' | 'ipAdapter'> | null | undefined
): FittingPlate | null {
  return look ? plateFromPictures(look.reference, look.ipAdapter) : null;
}
