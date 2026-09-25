'use client';

import { useCallback, useState } from 'react';
import { type RoleplayApiPayload } from '@/lib/roleplay-play-core';
import {
  appendRoleplayStoryBeat,
  patchRoleplayStoryBeat,
  selectRoleplayClipTakePatch,
  selectRoleplayStillTakePatch,
  lastRoleplayPlotBeat,
  roleplayStoryPhase,
  type RoleplayBio,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { lastRoleplayMotionSource } from '@/lib/roleplay-film';
import type { MobilePlayToolOrchestrationCore } from '@/hooks/mobile-play/useMobilePlayToolOrchestrationCore';

export function useMobilePlayToolOrchestrationPart2(ctx: MobilePlayToolOrchestrationCore) {
  const {
    updateToolSettings,
    setScenes,
    setError,
    setBioLoading,
    setPlayingId,
    setOwnBibleOpen,
    bio,
    storyRef,
    story,
    beatQueue,
    requestBody,
    commitStill,
    beginStoryFromBio,
    hasReferenceImage,
    referenceImageUrl,
    activePlate,
  } = ctx;

  const applyOwnBible = useCallback(
    async (nextBio: RoleplayBio) => {
      if (!hasReferenceImage) {
        setError('Capture a plate first.');
        return;
      }
      setError(null);
      const hasPlot = Boolean(lastRoleplayPlotBeat(storyRef.current));
      if (hasPlot || storyRef.current.length > 0) {
        updateToolSettings({ bio: nextBio });
        setOwnBibleOpen(false);
        return;
      }
      setBioLoading(true);
      try {
        await beginStoryFromBio(nextBio);
        setOwnBibleOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start from this bible.');
      } finally {
        setBioLoading(false);
      }
    },
    [
      beginStoryFromBio,
      hasReferenceImage,
      setBioLoading,
      setError,
      setOwnBibleOpen,
      storyRef,
      updateToolSettings,
    ]
  );

  const [scenesLoading, setScenesLoading] = useState(false);

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
      const response = await fetch('/api/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody('scenes')),
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
  }, [bio, requestBody, setError, setScenes, storyRef]);

  const animateAllReady = useCallback(async () => {
    for (const beat of story) {
      if (
        beat.stillStatus === 'completed' &&
        beat.imageUrl?.trim() &&
        beat.clipStatus !== 'completed'
      ) {
        await beatQueue.queueBeatMotion(beat);
      }
    }
  }, [beatQueue, story]);

  const playScene = useCallback(
    async (scene: RoleplayScene) => {
      if (!bio) {
        setError('Write a bio first.');
        return;
      }
      if (!hasReferenceImage) {
        setError('Capture a plate first.');
        return;
      }
      if (roleplayStoryPhase(storyRef.current) === 'complete') {
        setError('This story already ended. Start a new session to play another.');
        return;
      }
      setPlayingId(scene.id);
      setError(null);
      const playing: RoleplayScene =
        roleplayStoryPhase(storyRef.current) === 'finale' ? { ...scene, kind: 'ending' } : scene;
      const writingStory = appendRoleplayStoryBeat(storyRef.current, playing, {
        stillStatus: 'writing',
      });
      const beat = writingStory[writingStory.length - 1];
      if (!beat) {
        setPlayingId(null);
        return;
      }
      updateToolSettings({ story: writingStory });
      try {
        const response = await fetch('/api/roleplay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody('prompt', playing)),
        });
        const data = (await response.json()) as RoleplayApiPayload;
        if (!response.ok || !data.prompt?.trim()) {
          throw new Error(data.error ?? 'Could not write a still.');
        }
        const nextStory = await commitStill(data, beat, bio, writingStory);
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
      bio,
      commitStill,
      hasReferenceImage,
      requestBody,
      setError,
      setPlayingId,
      setScenes,
      storyRef,
      updateToolSettings,
    ]
  );

  const queueBeat = beatQueue.queueBeat;

  const selectStillTake = useCallback(
    (beat: RoleplayStoryBeat, index: number) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      updateToolSettings({
        story: patchRoleplayStoryBeat(
          storyRef.current,
          latest,
          selectRoleplayStillTakePatch(latest, index)
        ),
      });
    },
    [storyRef, updateToolSettings]
  );

  const setBeatPose = useCallback(
    (beat: RoleplayStoryBeat, patch: Pick<RoleplayStoryBeat, 'poseLayout' | 'poseVariant'>) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, patch),
      });
    },
    [storyRef, updateToolSettings]
  );

  const selectClipTake = useCallback(
    (beat: RoleplayStoryBeat, index: number) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      updateToolSettings({
        story: patchRoleplayStoryBeat(
          storyRef.current,
          latest,
          selectRoleplayClipTakePatch(latest, index)
        ),
      });
    },
    [storyRef, updateToolSettings]
  );

  const animateBeat = useCallback(
    (beat: RoleplayStoryBeat) => {
      void beatQueue.queueBeatMotion(beat);
    },
    [beatQueue]
  );

  const retryClip = useCallback(
    (beat: RoleplayStoryBeat) => {
      void beatQueue.queueBeatMotion(beat, { retry: true });
    },
    [beatQueue]
  );

  const extendBeat = useCallback(
    (beat: RoleplayStoryBeat) => {
      const source =
        beat.clipStatus === 'completed' && beat.clipUrl?.trim()
          ? {
              imageUrl: beat.clipUrl.trim(),
              parentPromptId: beat.clipPromptId?.trim() || beat.promptId?.trim(),
              fromClip: true,
            }
          : (lastRoleplayMotionSource(storyRef.current) ?? undefined);
      void beatQueue.queueBeatMotion(beat, source ? { source } : undefined);
    },
    [beatQueue, storyRef]
  );

  const plateUrl =
    (activePlate?.isolated ? activePlate.isolatedUrl : activePlate?.originalUrl) ||
    referenceImageUrl;

  return {
    applyOwnBible,
    rollScenes,
    scenesLoading,
    animateAllReady,
    playScene,
    queueBeat,
    selectStillTake,
    setBeatPose,
    selectClipTake,
    animateBeat,
    retryClip,
    extendBeat,
    plateUrl,
  };
}
