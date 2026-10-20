'use client';

/**
 * Whose film a Story cut is: the Cast the Story's session belongs to, else a Cast with the
 * Story's name, else one made from the session (and the session kept in the library).
 */

import { getCharacter, loadCharacters, type CharacterRecord } from '../character-os';
import { characterFromRoleplaySession, upsertCharacterFromRoleplaySession } from '../play/cast';
import type { RoleplayToolCache } from '../play/settings';
import { snapshotRoleplaySession, upsertRoleplayLibrarySession } from './roleplay-library';

export function storyFilmName(toolSettings: RoleplayToolCache): string {
  return toolSettings.characterName?.trim() || toolSettings.bio?.name?.trim() || 'roleplay';
}

export function resolveStoryFilmCast(
  toolSettings: RoleplayToolCache,
  name = storyFilmName(toolSettings),
  /** false: only find one (nothing is saved) — for showing, not cutting. */
  create = true
): CharacterRecord | undefined {
  const session = snapshotRoleplaySession(toolSettings);
  const fromSession = session ? characterFromRoleplaySession(session) : null;
  let character =
    (fromSession ? getCharacter(fromSession.id) : undefined) ||
    loadCharacters().find(entry => {
      const labels = [entry.name, entry.characterName].map(value => value?.trim().toLowerCase());
      return labels.includes(name.toLowerCase());
    });
  if (!character && session && create) {
    character = upsertCharacterFromRoleplaySession(session) ?? undefined;
    upsertRoleplayLibrarySession(session);
  }
  return character;
}
