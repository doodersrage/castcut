/**
 * Switching a Cast's plate. A Cast can hold several look plates (one per look); the active one is
 * what Outfit, Day and Story start from. Kept apart from look-outfit-plate (isolate, upload)
 * because the Cast picker in the app shell uses it.
 */

import { activateLook, getCharacter, removeLook, type CharacterRecord } from '@/lib/character-os';
import {
  resolveFittingPlateFromCharacter,
  withRoleplayLookPlateFromCast,
  type FittingPlate,
} from '@/lib/fitting-room';
import {
  DEFAULT_FITTING_TOOL_CACHE,
  DEFAULT_ROLEPLAY_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveToolSettings,
} from '@/lib/settings-cache';

function samePlatePicture(
  session: { referenceImageUrl?: string; referenceImageFilename?: string },
  plate: FittingPlate | null
): boolean {
  if (!plate) {
    return false;
  }
  const filename = session.referenceImageFilename?.trim();
  const url = session.referenceImageUrl?.trim();
  return Boolean(
    (filename && (filename === plate.filename || filename === plate.originalFilename)) ||
    (url && (url === plate.imageUrl || url === plate.originalUrl))
  );
}

/**
 * After the Cast's plate changed (another plate picked, added or removed): Outfit's session plate
 * follows, as on an upload, and Story's From-photo follows when it was the previous plate (a
 * photo picked in Story stays). Day and the dressed plates read the Cast plate itself; dressed
 * plates are keyed by the plate's filename, so each plate keeps its own.
 */
export function followCastPlateInSessions(
  characterId: string,
  previous: FittingPlate | null,
  next: CharacterRecord,
  options?: { fitting?: boolean }
): void {
  const activeId = loadSettingsCache().shared.activeCharacterId?.trim();
  if (activeId && activeId !== characterId) {
    return;
  }
  const plate = resolveFittingPlateFromCharacter(next);
  if (options?.fitting !== false) {
    const fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
    saveToolSettings('fitting', {
      ...fitting,
      isolateSubject: true,
      referenceIsolated: plate?.isolated === true,
      referenceImageUrl: plate?.imageUrl,
      referenceImageFilename: plate?.filename,
      referenceOriginalUrl: plate ? plate.originalUrl || plate.imageUrl : undefined,
      referenceOriginalFilename: plate ? plate.originalFilename || plate.filename : undefined,
      pendingOutfitPlatePromptId: undefined,
      pendingOutfitPlateCharacterId: undefined,
      suppressAutoPlateSeed: false,
    });
  }
  const story = loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);
  if (!samePlatePicture(story, previous)) {
    return;
  }
  saveToolSettings(
    'roleplay',
    plate
      ? withRoleplayLookPlateFromCast(story, next, { force: true })
      : {
          ...story,
          referenceImageUrl: undefined,
          referenceImageFilename: undefined,
          referenceOriginalUrl: undefined,
          referenceOriginalFilename: undefined,
          referenceIsolated: false,
        }
  );
}

/** Make one of the Cast's plates (looks) the one Outfit, Day and Story start from. */
export function switchCastPlate(characterId: string, lookId: string): CharacterRecord | undefined {
  const before = getCharacter(characterId);
  if (!before) {
    return undefined;
  }
  const previous = resolveFittingPlateFromCharacter(before);
  const next = activateLook(before.id, lookId);
  if (next && next.activeLookId !== before.activeLookId) {
    followCastPlateInSessions(before.id, previous, next);
  }
  return next;
}

/** Drop one plate (its look) of a Cast with several; the next one becomes active. */
export function removeCastPlate(characterId: string, lookId: string): CharacterRecord | undefined {
  const before = getCharacter(characterId);
  if (!before) {
    return undefined;
  }
  const previous = resolveFittingPlateFromCharacter(before);
  const next = removeLook(before.id, lookId);
  if (next && next.activeLookId !== before.activeLookId) {
    followCastPlateInSessions(before.id, previous, next);
  }
  return next;
}
