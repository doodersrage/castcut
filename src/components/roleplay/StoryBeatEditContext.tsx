'use client';

import { createContext, useContext } from 'react';
import type { StoryBeatEditActions } from '@/hooks/roleplay/useStoryBeatEdit';

/**
 * "Edit scene" on the reel's cards, for desk and phone Story. A context rather than props: both
 * pages render their cards through the one RoleplayStoryReel, and the two actions only concern
 * the card. Without a provider the cards have no Edit scene.
 */
const StoryBeatEditContext = createContext<StoryBeatEditActions | null>(null);

export const StoryBeatEditProvider = StoryBeatEditContext.Provider;

export function useStoryBeatEditActions(): StoryBeatEditActions | null {
  return useContext(StoryBeatEditContext);
}
