'use client';

import { useSyncExternalStore } from 'react';
import type { CharacterRecord } from '@/lib/character/os';
import { castDressedThumbUrl } from '@/lib/character/plate-thumb';
import { loadDressPlates, subscribeDressPlates } from '@/lib/day/dress-plate-store';

/** The Cast's newest dressed plate URL, kept current as plates are made ('' when none). */
export function useCastDressedThumb(character: CharacterRecord | null | undefined): string {
  return useSyncExternalStore(
    subscribeDressPlates,
    () => castDressedThumbUrl(character, loadDressPlates()),
    () => ''
  );
}

/** The same for every Cast of a list, by id. */
export function useCastDressedThumbs(
  characters: readonly CharacterRecord[]
): ReadonlyMap<string, string> {
  const json = useSyncExternalStore(
    subscribeDressPlates,
    () => {
      const entries = loadDressPlates();
      return JSON.stringify(
        characters.map(character => [character.id, castDressedThumbUrl(character, entries)])
      );
    },
    () => '[]'
  );
  return new Map(JSON.parse(json) as Array<[string, string]>);
}
