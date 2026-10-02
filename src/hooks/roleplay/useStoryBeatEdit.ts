'use client';

import { useCallback, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  storyBeatKey,
  storyBeatRewriteRevertPatch,
  storyBeatRewriteStartPatch,
  storyBeatScene,
  storyBeatTextLocked,
  storyBeforeBeat,
} from '@/hooks/roleplay/story-beat-edit';
import {
  requestRoleplayStillPrompt,
  type buildRoleplayRequestBody,
  type RoleplayApiPayload,
} from '@/lib/roleplay-play-core';
import {
  editRoleplayStoryBeatPatch,
  patchRoleplayStoryBeat,
  type RoleplayBio,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import type { RoleplayToolCache } from '@/lib/settings-cache';

type UseStoryBeatEditOptions = {
  storyRef: MutableRefObject<RoleplayStoryBeat[]>;
  updateToolSettings: (patch: Partial<RoleplayToolCache>) => void;
  bio: RoleplayBio | undefined;
  requestBody: (
    action: 'bio' | 'scenes' | 'prompt',
    situation?: RoleplayScene
  ) => ReturnType<typeof buildRoleplayRequestBody>;
  commitStill: (
    data: RoleplayApiPayload,
    beat: RoleplayStoryBeat,
    bio: RoleplayBio,
    writingStory: RoleplayStoryBeat[],
    options: { queueStill: boolean; liveStory: boolean }
  ) => Promise<RoleplayStoryBeat[]>;
  /** Why a still cannot be written right now (no photo / plate), as picking a card says it. */
  referenceMissingMessage: string | null;
  setError: (value: string | null) => void;
};

export type StoryBeatEditActions = {
  /** Save a scene's edited text. False when it was refused (the editor stays open). */
  saveBeatText: (beat: RoleplayStoryBeat, text: { title: string; blurb: string }) => boolean;
  /** Write the scene's still again from its text and queue it. */
  rewriteBeat: (beat: RoleplayStoryBeat) => Promise<void>;
  /** The scene being written again, if any (see `storyBeatKey`). */
  rewritingKey: string | null;
};

/**
 * Edit a scene's text in the reel, then write and queue its still again. Shared by desk and
 * phone Story: both write a still through the same request and the same `commitStill`.
 */
export function useStoryBeatEdit({
  storyRef,
  updateToolSettings,
  bio,
  requestBody,
  commitStill,
  referenceMissingMessage,
  setError,
}: UseStoryBeatEditOptions): StoryBeatEditActions {
  const [rewritingKey, setRewritingKey] = useState<string | null>(null);
  // State lags a render behind: two quick taps must not start two writes.
  const rewritingRef = useRef<string | null>(null);

  const saveBeatText = useCallback(
    (beat: RoleplayStoryBeat, text: { title: string; blurb: string }) => {
      const latest = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
      if (!latest) {
        return false;
      }
      // The card disables the editor too; this is the state as of this tap.
      if (storyBeatTextLocked(latest) || rewritingRef.current === storyBeatKey(latest)) {
        setError('That scene is being written — change its text once its still is queued.');
        return false;
      }
      const patch = editRoleplayStoryBeatPatch(latest, text);
      if (patch) {
        setError(null);
        updateToolSettings({ story: patchRoleplayStoryBeat(storyRef.current, latest, patch) });
      }
      return true;
    },
    [setError, storyRef, updateToolSettings]
  );

  const rewriteBeat = useCallback(
    async (beat: RoleplayStoryBeat) => {
      const latest = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
      if (!latest || rewritingRef.current || storyBeatTextLocked(latest)) {
        return;
      }
      if (!bio) {
        setError('Set the bible on Cast first — the still needs someone to be in it.');
        return;
      }
      if (referenceMissingMessage) {
        setError(referenceMissingMessage);
        return;
      }
      const key = storyBeatKey(latest);
      rewritingRef.current = key;
      setRewritingKey(key);
      setError(null);
      const startPatch = storyBeatRewriteStartPatch(latest);
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, startPatch),
      });
      try {
        const data = await requestRoleplayStillPrompt({
          ...requestBody('prompt', storyBeatScene(latest)),
          story: storyBeforeBeat(storyRef.current, latest),
        });
        // Always queued: "Write and queue again" is asked for by name, whatever the
        // queue-on-pick setting says.
        await commitStill(data, { ...latest, ...startPatch }, bio, storyRef.current, {
          queueStill: true,
          liveStory: true,
        });
      } catch (err) {
        // Nothing was sent: show the earlier still again rather than an empty failed take.
        updateToolSettings({
          story: patchRoleplayStoryBeat(
            storyRef.current,
            latest,
            storyBeatRewriteRevertPatch(latest)
          ),
        });
        setError(err instanceof Error ? err.message : 'Could not write that scene again.');
      } finally {
        rewritingRef.current = null;
        setRewritingKey(null);
      }
    },
    [bio, commitStill, referenceMissingMessage, requestBody, setError, storyRef, updateToolSettings]
  );

  // One object per change: it is a context value, and every card in the reel reads it.
  return useMemo(
    () => ({ saveBeatText, rewriteBeat, rewritingKey }),
    [rewriteBeat, rewritingKey, saveBeatText]
  );
}
