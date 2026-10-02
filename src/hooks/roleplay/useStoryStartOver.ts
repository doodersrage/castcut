'use client';

import { useCallback, useState } from 'react';

export type StoryStartOverChoice = 'keep-bible' | 'new-bible' | 'cancel';

/**
 * "Start the story over" for desk and phone Story: ask in the page, then either clear the
 * scenes and keep the bible, or have the bible written again for the same Cast lead.
 */
export function useStoryStartOver({
  clearStory,
  clearScenes,
  writeBio,
  leadName,
}: {
  /** Empty the reel, keep the bible (what starting over always did). */
  clearStory: () => void;
  /** Drop the offered scene cards — they continue the story that is being replaced. */
  clearScenes: () => void;
  /** The page's own bible-writing flow: writes a bible, then opens the story from it. */
  writeBio: (options?: { characterName?: string }) => Promise<void>;
  /** The Cast lead's name — a new bible is for the same lead, so it keeps the name. */
  leadName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ask = useCallback(() => setOpen(true), []);
  const resolve = useCallback(
    (choice: StoryStartOverChoice) => {
      setOpen(false);
      if (choice === 'keep-bible') {
        clearStory();
        return;
      }
      if (choice === 'new-bible') {
        // The reel is replaced when the new bible arrives, not before: if the writer fails,
        // the story is still there.
        clearScenes();
        void writeBio({ characterName: leadName });
      }
    },
    [clearScenes, clearStory, leadName, writeBio]
  );
  return { open, ask, resolve };
}
