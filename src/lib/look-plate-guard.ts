'use client';

/**
 * Likeness guard for look plates (2026-10-14): a new look plate — from Look, Cast home's Generate
 * plate, Day's "Make a plate" or an upload — was never compared with the Cast, and on one Cast
 * all four looks matched the Default look's face at 4–20% (different people, and every still made
 * from them with them). When a look's plate changes, its face is measured against the reference
 * look's (the Default, else the oldest), or, for that look, against its previous plate; a plate
 * below PLATE_DRIFT_BELOW is said, with the earlier plate one click away (Cast home → Looks).
 */

import {
  getCharacter,
  looksOf,
  upsertCharacter,
  type CharacterLook,
  type CharacterRecord,
} from './character-os';
import { measureStillFaceMatch } from './face-match-client';
import { lookPlateFaceUrl, PLATE_DRIFT_BELOW } from './likeness-measure-client';

/** The look a Cast's other looks are judged against: Default, else the oldest. */
export function referenceLook(character: CharacterRecord): CharacterLook | undefined {
  const looks = looksOf(character);
  return (
    looks.find(look => /^default$/i.test(look.name.trim())) ??
    [...looks].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0]
  );
}

/** A plate the guard has read and found to be someone else, still on the look. */
export function lookPlateDrifted(look: CharacterLook): boolean {
  const check = look.plateCheck;
  return Boolean(
    check &&
    check.plate === lookPlateFaceUrl(look) &&
    typeof check.face === 'number' &&
    check.face < PLATE_DRIFT_BELOW
  );
}

/**
 * Measure a look's (new) plate and keep the reading on the look. `previousPlate`: the plate it
 * replaced, used when this is the reference look itself. Null when there was nothing to compare.
 */
export async function checkLookPlate(input: {
  characterId: string;
  lookId: string;
  previousPlate?: string | null;
}): Promise<{ face: number; against: string; look: CharacterLook } | null> {
  const character = getCharacter(input.characterId);
  const look = character ? looksOf(character).find(entry => entry.id === input.lookId) : undefined;
  const plate = look ? lookPlateFaceUrl(look) : null;
  if (!character || !look || !plate) return null;
  const reference = referenceLook(character);
  const isReference = reference?.id === look.id;
  const referenceUrl = isReference
    ? input.previousPlate?.trim() || null
    : reference
      ? lookPlateFaceUrl(reference)
      : null;
  if (!referenceUrl || referenceUrl === plate) return null;
  const measured = await measureStillFaceMatch({ referenceUrl, imageUrl: plate }).catch(() => null);
  if (!measured?.available) return null;
  const against = isReference ? 'its previous plate' : `the ${reference!.name} look`;
  // Kept on the look as it is now (other edits since the read stay).
  const fresh = getCharacter(input.characterId);
  if (!fresh) return null;
  upsertCharacter({
    ...fresh,
    looks: (fresh.looks ?? []).map(entry =>
      entry.id === look.id
        ? { ...entry, plateCheck: { plate, face: measured.similarity, against, at: Date.now() } }
        : entry
    ),
  });
  return { face: measured.similarity, against, look };
}
