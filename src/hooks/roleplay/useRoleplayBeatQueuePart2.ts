'use client';

import { useCallback, useEffect, useRef } from 'react';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { loadEngineSettings } from '@/lib/engine-settings';
import { resolveFalExtendParentUrl } from '@/lib/fal-extend-upload';
import {
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
} from '@/lib/settings-cache';
import { resolvePreferredVideoModel } from '@/lib/queue-tool-model';
import {
  beginRoleplayClipRetryPatch,
  lastCompletedRoleplayStillUrl,
  patchRoleplayStoryBeat,
  roleplayClipQueueResultPatch,
  roleplayClipTakes,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import {
  looksLikeVideoUrl,
  nextRoleplayMotionKind,
  shouldAutoQueueRoleplayClip,
} from '@/lib/roleplay-film';
import { extractVideoLastFrame } from '@/lib/video-last-frame';
import {
  canFalExtendFromParentUrl,
  continueClipPathRanMessage,
  resolveVideoContinuePath,
  type VideoContinuePath,
} from '@/lib/video-clip-mode';
import { registerContinueStitch } from '@/lib/video-continue-stitch';
import type {
  RoleplayBeatQueueCore,
  UseRoleplayBeatQueueOptions,
} from '@/hooks/roleplay/useRoleplayBeatQueueCore';

export function useRoleplayBeatQueuePart2(
  options: UseRoleplayBeatQueueOptions,
  core: RoleplayBeatQueueCore
) {
  const {
    storyRef,
    toolSettings,
    updateToolSettings,
    shared,
    actions,
    playAs,
    referenceImageUrl,
    beatOutput,
    autoQueue,
    setError,
  } = options;
  const { roleplayCharacterQueueFields } = core;

  const autoClipQueuedRef = useRef(new Set<string>());
  const queueBeatMotionRef = useRef<
    (
      beat: RoleplayStoryBeat,
      options?: {
        source?: { imageUrl: string; parentPromptId?: string; fromClip: boolean };
        retry?: boolean;
      }
    ) => Promise<void>
  >(async () => undefined);

  const queueBeatMotion = useCallback(
    async (
      beat: RoleplayStoryBeat,
      motionOptions?: {
        source?: { imageUrl: string; parentPromptId?: string; fromClip: boolean };
        retry?: boolean;
      }
    ) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      const retry = motionOptions?.retry === true;
      const stillUrl = lastCompletedRoleplayStillUrl(latest) || latest.imageUrl?.trim() || '';
      const source =
        retry || !motionOptions?.source
          ? stillUrl
            ? {
                imageUrl: stillUrl,
                parentPromptId: latest.promptId?.trim(),
                fromClip: false,
              }
            : playAs === 'photo' && referenceImageUrl
              ? { imageUrl: referenceImageUrl, fromClip: false }
              : null
          : motionOptions.source;
      const hasInit = Boolean(source?.imageUrl);
      if (!hasInit && !latest.prompt?.trim() && !latest.blurb?.trim()) {
        setError('Write a beat prompt, or add a still, before queueing a clip.');
        return;
      }

      const startPatch = retry
        ? beginRoleplayClipRetryPatch(latest)
        : { clipStatus: 'writing' as const };
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, startPatch),
      });

      const engine = loadEngineSettings().engine;
      const parentClipUrl = source?.fromClip ? source.imageUrl : '';
      let continuePath: VideoContinuePath = 'last-frame';
      let extendUrl = '';
      let pathNote: string | null = null;

      if (!retry && parentClipUrl && looksLikeVideoUrl(parentClipUrl)) {
        continuePath = resolveVideoContinuePath({ engine, parentUrl: parentClipUrl });
        if (engine === 'fal') {
          if (canFalExtendFromParentUrl(parentClipUrl)) {
            extendUrl = parentClipUrl;
            continuePath = 'extend';
          } else {
            const resolved = await resolveFalExtendParentUrl({
              parentUrl: parentClipUrl,
              falApiKey: loadSettingsCache().shared.sessionFalApiKey,
            });
            if (resolved.url) {
              extendUrl = resolved.url;
              continuePath = 'extend';
            } else if (resolved.uploadAttempted) {
              continuePath = 'last-frame';
              pathNote = `${
                resolved.uploadError?.trim() ||
                'Could not upload that local clip to Fal for extend-video.'
              } Continuing from the last frame instead.`;
            } else {
              continuePath = 'last-frame';
            }
          }
        } else if (continuePath === 'extend' && engine === 'grok') {
          extendUrl = parentClipUrl;
        }
      }

      const useNativeExtend = Boolean(extendUrl) && continuePath === 'extend';
      if (pathNote) {
        setError(pathNote);
      }

      let inputImage: File | undefined;
      let inputImageUrl: string | undefined = useNativeExtend ? undefined : source?.imageUrl;
      if (!useNativeExtend && source?.imageUrl && looksLikeVideoUrl(source.imageUrl)) {
        try {
          const blob = await extractVideoLastFrame(source.imageUrl);
          inputImage = new File([blob], 'roleplay-last-frame.jpg', {
            type: blob.type || 'image/jpeg',
          });
          inputImageUrl = undefined;
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not read the last frame.');
          updateToolSettings({
            story: patchRoleplayStoryBeat(
              storyRef.current,
              latest,
              roleplayClipQueueResultPatch(
                storyRef.current.find(
                  entry => entry.id === latest.id && entry.at === latest.at
                ) ?? {
                  ...latest,
                  ...startPatch,
                },
                undefined
              )
            ),
          });
          return;
        }
      }

      const parentClipPromptId = retry
        ? roleplayClipTakes(latest)
            .map(take => take.clipPromptId?.trim())
            .filter((id): id is string => Boolean(id))
            .at(-1)
        : source?.parentPromptId;
      const parentEntry = parentClipPromptId
        ? loadComfyGallery().find(entry => entry.promptId === parentClipPromptId)
        : latest.promptId
          ? loadComfyGallery().find(entry => entry.promptId === latest.promptId)
          : undefined;
      const videoModel = resolvePreferredVideoModel({
        toolModel: loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).model,
        sharedModel: shared.model,
      });
      if (!pathNote) {
        setError(null);
      }
      let prompt = latest.prompt?.trim() || latest.blurb;
      try {
        const response = await fetch('/api/video-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: latest.title,
            motion: latest.prompt?.trim() || latest.blurb,
            model: videoModel,
            durationSec: 4,
          }),
        });
        const data = (await response.json()) as { prompt?: string };
        if (data.prompt?.trim()) {
          prompt = data.prompt.trim();
        }
      } catch {
        /* use beat prompt */
      }

      const queueClipMode = retry
        ? hasInit
          ? ('i2v' as const)
          : ('t2v' as const)
        : useNativeExtend
          ? ('extend' as const)
          : hasInit
            ? ('i2v' as const)
            : ('t2v' as const);

      let promptId: string | undefined;
      try {
        promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
          queueTool: 'video',
          queueModel: videoModel,
          inputImage: hasInit ? inputImage : undefined,
          inputImageUrl: hasInit ? inputImageUrl : undefined,
          parentGalleryEntryId: parentEntry?.id,
          derivedKind: retry
            ? 'variation'
            : source?.fromClip
              ? 'extend'
              : hasInit
                ? nextRoleplayMotionKind(parentEntry)
                : 't2v',
          clipMode: queueClipMode,
          videoUrl: useNativeExtend ? extendUrl : undefined,
          qualityProfile: 'final',
          ...roleplayCharacterQueueFields(undefined, { videoFrames: 64, videoFps: 16 }),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not queue that clip.');
      }

      if (promptId && !retry && continuePath === 'stitch' && parentClipUrl) {
        registerContinueStitch({ childPromptId: promptId, parentUrl: parentClipUrl });
      }

      if (promptId && !pathNote && source?.fromClip && !retry) {
        setError(continueClipPathRanMessage(continuePath));
      }

      const after = storyRef.current.find(
        entry => entry.id === latest.id && entry.at === latest.at
      ) ?? {
        ...latest,
        ...startPatch,
      };
      updateToolSettings({
        story: patchRoleplayStoryBeat(
          storyRef.current,
          latest,
          roleplayClipQueueResultPatch(after, promptId)
        ),
      });
    },
    [
      actions,
      playAs,
      referenceImageUrl,
      roleplayCharacterQueueFields,
      setError,
      shared.model,
      storyRef,
      updateToolSettings,
    ]
  );

  useEffect(() => {
    queueBeatMotionRef.current = queueBeatMotion;
  }, [queueBeatMotion]);

  useEffect(() => {
    if (beatOutput !== 'clip' || !autoQueue) {
      return;
    }
    for (const beat of toolSettings.story ?? []) {
      const key = `${beat.id}:${beat.at}:${beat.imageUrl ?? ''}`;
      if (autoClipQueuedRef.current.has(key) || !shouldAutoQueueRoleplayClip(beat)) {
        continue;
      }
      autoClipQueuedRef.current.add(key);
      void queueBeatMotion(beat);
    }
  }, [autoQueue, beatOutput, queueBeatMotion, toolSettings.story]);

  return {
    queueBeatMotion,
    queueBeatMotionRef,
  };
}
