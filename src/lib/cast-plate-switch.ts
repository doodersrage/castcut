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
  restoreLookPlate,
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
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
  saveToolSettings,
} from '@/lib/settings-cache';
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_FITTING_TOOL_CACHE,
  DEFAULT_ROLEPLAY_TOOL_CACHE,
} from '@/lib/play-settings';
import { identityLockForLook, identityLockPatchChanges } from '@/lib/identity-lock-look';

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
 * A plate job still rendering when the active look changes: kept and pinned to the look it is for
 * (its own look, else the look active until now), so it lands on that look — not cleared, and
 * never on the newly picked look. A job with no look to pin to is cleared, as before.
 */
export function pendingPlateAfterSwitch(
  fitting: {
    pendingOutfitPlatePromptId?: string;
    pendingOutfitPlateCharacterId?: string;
    pendingOutfitPlateLookId?: string;
  },
  characterId: string,
  previousLookId?: string,
  /** The Cast's looks after the change: a job for a look that is gone is dropped. */
  lookIds?: readonly string[]
): {
  pendingOutfitPlatePromptId?: string;
  pendingOutfitPlateCharacterId?: string;
  pendingOutfitPlateLookId?: string;
} {
  const promptId = fitting.pendingOutfitPlatePromptId?.trim();
  const owner = fitting.pendingOutfitPlateCharacterId?.trim() || characterId;
  // Kept only on a switch (previousLookId given): a removed look's job, or one finishing after
  // an earlier plate was put back, is cleared as before.
  const lookId = previousLookId?.trim()
    ? fitting.pendingOutfitPlateLookId?.trim() || previousLookId.trim()
    : '';
  if (!promptId || owner !== characterId || !lookId || (lookIds && !lookIds.includes(lookId))) {
    return {
      pendingOutfitPlatePromptId: undefined,
      pendingOutfitPlateCharacterId: undefined,
      pendingOutfitPlateLookId: undefined,
    };
  }
  return {
    pendingOutfitPlatePromptId: promptId,
    pendingOutfitPlateCharacterId: owner,
    pendingOutfitPlateLookId: lookId,
  };
}

/**
 * After the Cast's plate changed (another plate picked, added or removed): Outfit's session plate
 * follows, as on an upload, and Story's From-photo follows when it was the previous plate (a
 * photo picked in Story stays). Day and the dressed plates read the Cast plate itself; dressed
 * plates are keyed by the plate's filename, so each plate keeps its own. The Engine's face lock
 * moves to the new plate's face when it was the look's (identity-lock-look.ts).
 */
export function followCastPlateInSessions(
  characterId: string,
  previous: FittingPlate | null,
  next: CharacterRecord,
  options?: {
    fitting?: boolean;
    /**
     * The look that was active before the switch. A plate still rendering for it stays pinned to
     * it and lands there (switching looks mid-render used to drop the new plate when it landed).
     */
    previousLookId?: string;
  }
): void {
  const shared = loadSettingsCache().shared;
  const activeId = shared.activeCharacterId?.trim();
  if (activeId && activeId !== characterId) {
    return;
  }
  if (activeId) {
    // The face lock follows the look's plate when it came from the look (the previous plate
    // counts: a replaced plate is no longer on the Cast); the player's own face stays.
    const lockPatch = identityLockForLook({
      lock: shared,
      looks: looksOf(next),
      look: activeLook(next),
      alsoLook: [previous],
    });
    if (identityLockPatchChanges(shared, lockPatch)) {
      saveSharedSettings({ ...shared, ...lockPatch }, { notify: true });
    }
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
      ...pendingPlateAfterSwitch(
        fitting,
        characterId,
        options?.previousLookId,
        looksOf(next).map(look => look.id)
      ),
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
    followCastPlateInSessions(before.id, previous, next, { previousLookId: before.activeLookId });
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
    followCastPlateInSessions(before.id, previous, next, { previousLookId: before.activeLookId });
  }
  return next;
}

/**
 * Put an earlier plate back on one of the Cast's looks (Cast home → Earlier plates). Outfit and
 * Story follow when it is the active look, as on an upload.
 */
export function restoreCastPlate(
  characterId: string,
  lookId: string,
  replacedAt: number
): CharacterRecord | undefined {
  const before = getCharacter(characterId);
  if (!before) return undefined;
  const wasActive = activeLook(before).id === lookId;
  const previous = wasActive ? resolveFittingPlateFromCharacter(before) : null;
  const next = restoreLookPlate(characterId, lookId, replacedAt);
  if (next && wasActive) followCastPlateInSessions(characterId, previous, next);
  return next;
}
