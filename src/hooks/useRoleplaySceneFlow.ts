'use client';

import { useCallback, useState, type MutableRefObject } from 'react';
import {
  buildRoleplayRequestBody,
  requestRoleplayStillPrompt,
  type RoleplayApiPayload,
} from '@/lib/roleplay-play-core';
import {
  appendRoleplayStoryBeat,
  mergeRoleplayRejectedScenes,
  roleplayStoryPhase,
  type RoleplayBio,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import type { RoleplayPlayAs } from '@/lib/roleplay';
import type { RoleplayToolCache } from '@/lib/settings-cache';

type UseRoleplaySceneFlowOptions = {
  storyRef: MutableRefObject<RoleplayStoryBeat[]>;
  toolSettings: RoleplayToolCache;
  updateToolSettings: (patch: Partial<RoleplayToolCache>) => void;
  bio: RoleplayBio | undefined;
  rejectedScenesMemory: RoleplayScene[];
  requestBody: (
    action: 'bio' | 'scenes' | 'prompt',
    situation?: RoleplayScene
  ) => ReturnType<typeof buildRoleplayRequestBody>;
  commitStill: (
    data: RoleplayApiPayload,
    beat: RoleplayStoryBeat,
    bio: RoleplayBio,
    writingStory: RoleplayStoryBeat[],
    options: { queueStill: boolean }
  ) => Promise<RoleplayStoryBeat[]>;
  skipStillForClip: boolean;
  autoQueue: boolean;
  playAsResolved: RoleplayPlayAs;
  hasReferenceImage: boolean;
  setError: (value: string | null) => void;
};

export function useRoleplaySceneFlow({
  storyRef,
  updateToolSettings,
  bio,
  rejectedScenesMemory,
  requestBody,
  commitStill,
  skipStillForClip,
  autoQueue,
  playAsResolved,
  hasReferenceImage,
  setError,
}: UseRoleplaySceneFlowOptions) {
  const [scenes, setScenes] = useState<RoleplayScene[]>([]);
  const [scenesLoading, setScenesLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const rememberRejectedScenes = useCallback(
    (offered: RoleplayScene[], chosen?: RoleplayScene | null) => {
      const next = mergeRoleplayRejectedScenes(rejectedScenesMemory, offered, chosen);
      updateToolSettings({ rejectedScenes: next });
      return next;
    },
    [rejectedScenesMemory, updateToolSettings]
  );

  const rollScenes = useCallback(async () => {
    if (!bio) {
      setError('Write a bio first — the scenes need someone to happen to.');
      return;
    }
    if (roleplayStoryPhase(storyRef.current) === 'complete') {
      setScenes([]);
      return;
    }
    setScenesLoading(true);
    setError(null);
    try {
      const rejectedScenes = rememberRejectedScenes(scenes);
      const response = await fetch('/api/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...requestBody('scenes'),
          rejectedScenes,
        }),
      });
      const data = (await response.json()) as RoleplayApiPayload;
      if (!response.ok) {
        throw new Error(data.error ?? 'Could not roll scenes.');
      }
      setScenes(Array.isArray(data.scenes) ? data.scenes : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not roll scenes.');
    } finally {
      setScenesLoading(false);
    }
  }, [bio, rememberRejectedScenes, requestBody, scenes, setError, storyRef]);

  const playScene = useCallback(
    async (scene: RoleplayScene) => {
      if (!bio) {
        setError('Write a bio first.');
        return;
      }
      if (playAsResolved === 'photo' && !hasReferenceImage) {
        setError('Upload a photo or pick a gallery still first.');
        return;
      }
      if (roleplayStoryPhase(storyRef.current) === 'complete') {
        setError('This story already ended. Restart to play another.');
        return;
      }
      setPlayingId(scene.id);
      setError(null);
      const playing: RoleplayScene =
        roleplayStoryPhase(storyRef.current) === 'finale' ? { ...scene, kind: 'ending' } : scene;
      const rejectedScenes = rememberRejectedScenes(scenes, playing);
      const writingStory = appendRoleplayStoryBeat(storyRef.current, playing, {
        stillStatus: skipStillForClip ? undefined : 'writing',
      });
      const beat = writingStory[writingStory.length - 1];
      if (!beat) {
        setPlayingId(null);
        return;
      }
      updateToolSettings({ story: writingStory, rejectedScenes });
      try {
        const data = await requestRoleplayStillPrompt(requestBody('prompt', playing));
        const nextStory = await commitStill(data, beat, bio, writingStory, {
          queueStill: autoQueue && !skipStillForClip,
        });
        if (roleplayStoryPhase(nextStory) === 'complete') {
          setScenes([]);
          return;
        }
        const nextScenes = await fetch('/api/roleplay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...requestBody('scenes'),
            story: nextStory,
            rejectedScenes,
          }),
        });
        const nextPayload = (await nextScenes.json()) as RoleplayApiPayload;
        if (nextScenes.ok && Array.isArray(nextPayload.scenes)) {
          setScenes(nextPayload.scenes);
        }
      } catch (err) {
        updateToolSettings({
          story: writingStory.filter(entry => entry.at !== beat.at || entry.prompt),
        });
        setError(err instanceof Error ? err.message : 'Could not play that scene.');
      } finally {
        setPlayingId(null);
      }
    },
    [
      autoQueue,
      bio,
      commitStill,
      hasReferenceImage,
      playAsResolved,
      rememberRejectedScenes,
      requestBody,
      scenes,
      skipStillForClip,
      setError,
      storyRef,
      updateToolSettings,
    ]
  );

  return {
    scenes,
    setScenes,
    scenesLoading,
    playingId,
    rollScenes,
    playScene,
  };
}
