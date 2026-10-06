'use client';

import { useCallback, useMemo } from 'react';
import {
  patchRoleplayStoryBeat,
  selectRoleplayClipTakePatch,
  pinRoleplayStillTakePatch,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { useRoleplaySceneFlow } from '@/hooks/useRoleplaySceneFlow';
import { lastRoleplayMotionSource } from '@/lib/roleplay-film';
import type { FixAreaTarget } from '@/lib/fix-area-client';
import { buildStoryFixAreaTarget } from '@/lib/roleplay-fix-area';
import type { MobilePlayToolOrchestrationCore } from '@/hooks/mobile-play/useMobilePlayToolOrchestrationCore';
import { useStoryBeatEdit } from '@/hooks/roleplay/useStoryBeatEdit';

export function useMobilePlayToolOrchestrationPart2(ctx: MobilePlayToolOrchestrationCore) {
  const {
    updateToolSettings,
    toolSettings,
    scenes,
    setScenes,
    setError,
    bio,
    storyRef,
    sessionRef,
    story,
    beatQueue,
    requestBody,
    commitStill,
    autoQueue,
    hasReferenceImage,
    referenceImageUrl,
    activePlate,
    content,
  } = ctx;

  // Fix an area (fix-area.ts) on a beat's shown still — the phone reel's ⋯ → Fix an area….
  const fixAreaTargetForBeat = useCallback(
    (beat: RoleplayStoryBeat): FixAreaTarget | null =>
      buildStoryFixAreaTarget({ beat, storyRef, content, updateToolSettings }),
    [content, storyRef, updateToolSettings]
  );

  const rejectedScenesMemory = useMemo(
    () => toolSettings.rejectedScenes ?? [],
    [toolSettings.rejectedScenes]
  );

  // Roll and play scenes through the flow desk Story uses: the same guards, the same rejected
  // cards memory, the clip-only mode ("Clip" output queued on pick writes no still) and the
  // same write into the live reel.
  const sceneFlow = useRoleplaySceneFlow({
    storyRef,
    toolSettings,
    updateToolSettings,
    bio,
    rejectedScenesMemory,
    requestBody,
    commitStill,
    skipStillForClip: beatQueue.skipStillForClip,
    autoQueue,
    // The phone page plays From photo only.
    playAsResolved: 'photo',
    hasReferenceImage,
    setError,
    scenesState: [scenes, setScenes],
    referenceMissingMessage: 'Capture a plate first.',
    sessionRef,
  });
  const { rollScenes, playScene, scenesLoading, playingId } = sceneFlow;

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

  const queueBeat = beatQueue.queueBeat;

  // Edit a scene in the reel and write its still again — the same hook desk Story uses.
  const beatEdit = useStoryBeatEdit({
    storyRef,
    updateToolSettings,
    bio,
    requestBody,
    commitStill,
    referenceMissingMessage: hasReferenceImage ? null : 'Capture a plate first.',
    setError,
  });

  const selectStillTake = useCallback(
    (beat: RoleplayStoryBeat, index: number) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      updateToolSettings({
        story: patchRoleplayStoryBeat(
          storyRef.current,
          latest,
          pinRoleplayStillTakePatch(latest, index)
        ),
      });
    },
    [storyRef, updateToolSettings]
  );

  const setBeatPose = useCallback(
    (
      beat: RoleplayStoryBeat,
      patch: Pick<
        RoleplayStoryBeat,
        'poseLayout' | 'poseVariant' | 'posePhoto' | 'poseCamera' | 'poseLead' | 'poseLook'
      >
    ) => {
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
    rollScenes,
    scenesLoading,
    playingId,
    animateAllReady,
    playScene,
    queueBeat,
    beatEdit,
    selectStillTake,
    fixAreaTargetForBeat,
    setBeatPose,
    selectClipTake,
    animateBeat,
    retryClip,
    extendBeat,
    plateUrl,
  };
}
