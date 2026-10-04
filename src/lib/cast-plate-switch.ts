/**
 * Switching a Cast's plate. A Cast can hold several look plates (one per look); the active one is
 * what Outfit, Day and Story start from. Kept apart from look-outfit-plate (isolate, upload)
 * because the Cast picker in the app shell uses it.
 */

import { dayAfterOutfitHandoff } from '@/lib/day-outfit-scope';
import {
  activateLook,
  activeLook,
  getCharacter,
  looksOf,
  removeLook,
  upsertCharacter,
  withNewPlateLook,
  type CharacterRecord,
} from '@/lib/character-os';
import {
  resolveFittingPlateFromCharacter,
  withRoleplayLookPlateFromCast,
  type FittingPlate,
} from '@/lib/fitting-room';
import {
  keptOutfitHasPhoto,
  lookOutfitSwitchPatch,
  slotsForOutfitPhoto,
  type KeptLookOutfit,
} from '@/lib/outfit-handoff';
import {
  DEFAULT_DAY_TOOL_CACHE,
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

/**
 * After the Cast's active look changed: the new look's kept outfit (Outfit → Keep: a clothing
 * photo and shoes) goes into Outfit, Day and Story, as Outfit's own picks do. A kit look's kit
 * reaches them as the Cast's outfit lock (shared.lockedWardrobeId, written by the caller with
 * the Cast); its kept shoes come here, and a photo the previous look put in goes. A look with no
 * kept outfit leaves the tools alone, except what the previous look put in.
 */
export function followLookOutfitInSessions(
  characterId: string,
  previous: KeptLookOutfit | null | undefined,
  next: KeptLookOutfit | null | undefined,
  /**
   * The Cast after the switch. Given, Day's slots follow the new look as a hand-off
   * (day-outfit-scope.ts): what an earlier Day-wide choice left on them goes, hand-picked ones
   * stay — listed for Day's notice unless `dayNotice` is false (the switch was made on Day).
   */
  after?: { record: CharacterRecord; dayNotice?: boolean }
): void {
  const activeId = loadSettingsCache().shared.activeCharacterId?.trim();
  if ((activeId && activeId !== characterId) || (!previous && !next && !after)) {
    return;
  }
  const fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
  const fittingPatch = lookOutfitSwitchPatch(fitting, previous, next);
  if (fittingPatch) {
    saveToolSettings('fitting', { ...fitting, ...fittingPatch });
  }
  const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
  const dayPatch = lookOutfitSwitchPatch(day, previous, next);
  if (after) {
    const look = activeLook(after.record);
    saveToolSettings('day', {
      ...day,
      ...dayAfterOutfitHandoff(day, {
        ...(dayPatch ? { picks: dayPatch } : {}),
        kitId: look.lockedWardrobeId,
        activeLookId: look.id,
        lookIds: looksOf(after.record).map(entry => entry.id),
        at: Date.now(),
        notice: after.dayNotice !== false,
      }),
    });
  } else if (dayPatch) {
    saveToolSettings('day', {
      ...day,
      ...dayPatch,
      slots: slotsForOutfitPhoto(day.slots ?? [], keptOutfitHasPhoto(dayPatch)),
    });
  }
  const story = loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);
  const storyPatch = lookOutfitSwitchPatch(story, previous, next);
  const storyKit = next?.wardrobeId?.trim();
  if (storyPatch || (storyKit && story.wardrobeId !== storyKit)) {
    saveToolSettings('roleplay', {
      ...story,
      ...(storyPatch ?? {}),
      // A photo is the outfit (Story's kit would outrank it); a kit look's kit is Story's.
      ...(storyPatch && keptOutfitHasPhoto(storyPatch)
        ? { wardrobeId: undefined }
        : storyKit
          ? { wardrobeId: storyKit }
          : {}),
    });
  }
}

/**
 * Make one of the Cast's plates (looks) the one Outfit, Day and Story start from. `dayNotice`
 * false: the switch was made on Day (its Look & clothing row), so Day shows no hand-off notice.
 */
export function switchCastPlate(
  characterId: string,
  lookId: string,
  options?: { dayNotice?: boolean }
): CharacterRecord | undefined {
  const before = getCharacter(characterId);
  if (!before) {
    return undefined;
  }
  const previous = resolveFittingPlateFromCharacter(before);
  const next = activateLook(before.id, lookId);
  if (next && next.activeLookId !== before.activeLookId) {
    followCastPlateInSessions(before.id, previous, next);
    followLookOutfitInSessions(
      before.id,
      activeLook(before).keptOutfit,
      activeLook(next).keptOutfit,
      { record: next, dayNotice: options?.dayNotice }
    );
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
    followLookOutfitInSessions(
      before.id,
      activeLook(before).keptOutfit,
      activeLook(next).keptOutfit,
      { record: next }
    );
  }
  return next;
}

/**
 * A new look made from the active one when that look has no plate to copy: same description and
 * outfit lock, no picture (its tile offers Add plate). It becomes the active look. A look with a
 * plate is copied through applyCastLookPlateFromSource instead, so the copy owns its own file.
 */
export function addBlankCastLook(characterId: string, name: string): CharacterRecord | undefined {
  const before = getCharacter(characterId);
  if (!before) {
    return undefined;
  }
  const previous = resolveFittingPlateFromCharacter(before);
  upsertCharacter(withNewPlateLook(before, { name, reference: undefined, ipAdapter: undefined }));
  const next = getCharacter(before.id);
  if (next) {
    followCastPlateInSessions(before.id, previous, next);
  }
  return next;
}
