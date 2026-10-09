'use client';

import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { RoleplayStoryBeat } from '@/lib/roleplay';
import type { RoleplayToolCache } from '@/lib/play-settings';
import { guardStoryForSession } from '@/lib/story-session-guard';

/**
 * Story's `updateToolSettings`, guarded per session (story-session-guard.ts):
 * - A patch that moves Story to another session (a Cast switch) points the reel ref at the new
 *   session's scenes at once. Before, the ref kept the old lead's reel until the next render,
 *   and a Gallery sync in between patched her finished still into "the" story — the new lead's.
 * - Every story written is stamped with the session's Cast; a scene stamped for another Cast is
 *   dropped, never saved into this Cast's session.
 */
export function useStorySessionGuard(input: {
  activeSessionId: string | undefined;
  storyRef: MutableRefObject<RoleplayStoryBeat[]>;
  updateToolSettings: (patch: Partial<RoleplayToolCache>) => void;
  /** Called when the session changes (scene cards rolled for the old lead go). */
  onSessionChange?: () => void;
}): {
  updateToolSettings: (patch: Partial<RoleplayToolCache>) => void;
  /** The session Story is on now (ahead of state): async writers compare it before writing. */
  sessionRef: MutableRefObject<string | undefined>;
} {
  const { storyRef, updateToolSettings, onSessionChange } = input;
  const sessionRef = useRef(input.activeSessionId);
  const onSessionChangeRef = useRef(onSessionChange);
  useEffect(() => {
    onSessionChangeRef.current = onSessionChange;
  }, [onSessionChange]);
  useEffect(() => {
    // Hydration and other pages' writes reach the page as state.
    const previous = sessionRef.current;
    if (previous !== input.activeSessionId) {
      sessionRef.current = input.activeSessionId;
      // A story getting its first id (the library save) is the same story.
      if (previous && input.activeSessionId) onSessionChangeRef.current?.();
    }
  }, [input.activeSessionId]);

  const guarded = useCallback(
    (patch: Partial<RoleplayToolCache>) => {
      const previous = sessionRef.current;
      const switching =
        'activeSessionId' in patch && (patch.activeSessionId || undefined) !== previous;
      if (switching) {
        sessionRef.current = patch.activeSessionId || undefined;
      }
      let next = patch;
      if (patch.story) {
        const guarded = guardStoryForSession(patch.story, sessionRef.current);
        if (guarded.dropped.length > 0) {
          console.warn(
            'Story: kept another Cast’s scenes out of this session:',
            sessionRef.current,
            guarded.dropped.map(beat => beat.title)
          );
        }
        if (guarded.story !== patch.story) {
          next = { ...patch, story: guarded.story };
        }
      }
      if (switching) {
        if (next.story) {
          storyRef.current = next.story;
        }
        // A story getting its first id (the library save) is the same story.
        if (previous && sessionRef.current) onSessionChangeRef.current?.();
      }
      updateToolSettings(next);
    },
    [storyRef, updateToolSettings]
  );
  return { updateToolSettings: guarded, sessionRef };
}
