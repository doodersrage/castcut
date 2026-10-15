'use client';

import { resolveCastPlatePrepareModel } from '@/lib/cast-plate-prepare';
import { getCharacter, setCastPlateTraits } from '@/lib/character-os';
import {
  fetchComfyObjectInfoModelsCached,
  readCachedComfyObjectInfoModels,
} from '@/lib/comfyui-object-info-cache';
import {
  castOriginalPlate,
  ensureOutfitPlateAfterLook,
  type OutfitPlateEnsureResult,
} from '@/lib/look-outfit-plate';
import { resolvePreferredLookModel } from '@/lib/queue-tool-model';

type SendComfyUi = Parameters<typeof ensureOutfitPlateAfterLook>[0]['sendComfyUi'];

/**
 * Queue a look's plate the one way every caller makes it (Film's new Cast, Cast home's Generate
 * plate, Day's "Make a plate"): a Cast's first plate renders from the description on UltraReal
 * Fine-Tune v4 (Edit 2511 when this ComfyUI lacks it); every later plate is edited from that
 * original on Edit 2511 (look-outfit-plate.ts buildLookPlateEditPrompt). Lands through the
 * app-wide plate watcher (PlayCastPlateWatcher), replacing the current plate when ready.
 */
export async function queueCastLookPlate(input: {
  characterId: string;
  lookId?: string;
  /** What this look changes (hair, makeup). */
  lookNote?: string;
  sendComfyUi: SendComfyUi;
}): Promise<{ result: OutfitPlateEnsureResult; fromOriginal: boolean }> {
  const character = getCharacter(input.characterId);
  const original = castOriginalPlate(character);
  const inventory = original
    ? null
    : (readCachedComfyObjectInfoModels() ??
      (await fetchComfyObjectInfoModelsCached().catch(() => null)));
  const queueModel = original
    ? resolveCastPlatePrepareModel(undefined)
    : (resolvePreferredLookModel({ inventory }) ?? resolveCastPlatePrepareModel(undefined));
  const result = await ensureOutfitPlateAfterLook({
    characterId: input.characterId,
    lookId: input.lookId,
    lookNote: input.lookNote,
    ...(queueModel ? { queueModel } : {}),
    ...(original ? { fromOriginal: original } : {}),
    replaceWhenReady: true,
    tiles: [],
    sendComfyUi: input.sendComfyUi,
  });
  // A first plate from the description fixes who the Cast is: Cast home locks the identity traits
  // it was made from (castIdentityTraitsLocked) once it lands as the face lock.
  if (!original && result === 'queued' && character?.traits) {
    setCastPlateTraits(input.characterId, character.traits);
  }
  return { result, fromOriginal: Boolean(original) };
}
