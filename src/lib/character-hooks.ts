import { activateLook, type CharacterRecord } from './character-os';

/**
 * What features add to shared Cast pickers (docs/architecture-boundaries.md). Play registers:
 * bringing old Story sessions and identity bundles into the Cast when a picker opens, and a look
 * switch that moves Outfit / Story / Day onto the new look's plate. Without them a picker lists
 * the Cast as stored and a look switch just activates the look.
 */
export type CharacterStorePreparer = () => void;
export type CharacterLookSwitcher = (
  characterId: string,
  lookId: string
) => CharacterRecord | undefined;

const preparers: CharacterStorePreparer[] = [];
let lookSwitcher: CharacterLookSwitcher | null = null;

export function registerCharacterStorePreparer(prepare: CharacterStorePreparer): void {
  if (!preparers.includes(prepare)) preparers.push(prepare);
}

export function registerCharacterLookSwitcher(switcher: CharacterLookSwitcher): void {
  lookSwitcher = switcher;
}

/** Run once storage is ready, before a picker lists the Cast. */
export function prepareCharacterStore(): void {
  for (const prepare of preparers) {
    try {
      prepare();
    } catch (error) {
      console.error('prepareCharacterStore', error);
    }
  }
}

export function switchCharacterLook(
  characterId: string,
  lookId: string
): CharacterRecord | undefined {
  return lookSwitcher ? lookSwitcher(characterId, lookId) : activateLook(characterId, lookId);
}
