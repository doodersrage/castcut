'use client';

import { framedTalkingStill } from '@/lib/talking-clip-framing-client';
import { adultAgeLineIn, neutralizeYouthWords, withAdultAgeLine } from '@/lib/adult-age-safeguard';
import { stripStillPromptForClip } from '@/lib/clip-prompt-from-still';
import {
  clipEngineForShot,
  LTX25_TALKING_FULL_FRAME_LONG_SIDE,
  normalizeSpokenLine,
  talkingClipPrompt,
} from '@/lib/ltx25-renderer';
import { leadIsMan } from '@/hooks/roleplay/useRoleplayBeatQueueCore';
import { castVoiceSampleFor } from '@/lib/cast-voice';
import { isAdultContentPrompt } from '@/lib/adult-age-safeguard';
import { stillPromptPeople } from '@/lib/still-clip-prompt';
import { RAPID_DUO_RECIPE_MARK } from '@/lib/prompt-recipe-mark';
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
import { reinforceIntimateStillPrompt } from '@/lib/intimate-prompt-clarify';
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
      // The still prompt talks to the edit model (Image 1 / Image 3 pose map) — not the clip's.
      let prompt = reinforceIntimateStillPrompt(
        stripStillPromptForClip(latest.prompt) || latest.blurb || ''
      );
      try {
        const response = await fetch('/api/video-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: latest.title,
            motion: prompt,
            model: videoModel,
            durationSec: 4,
          }),
        });
        const data = (await response.json()) as { prompt?: string };
        if (data.prompt?.trim()) {
          prompt = reinforceIntimateStillPrompt(data.prompt.trim());
        }
      } catch {
        /* use beat prompt */
      }
      // A clip from an adult still names the same ages as the still (adult-age-safeguard.ts);
      // the queue adds the generic sentence to any other adult clip.
      const stillAgeLine = adultAgeLineIn(parentEntry?.prompt);
      if (stillAgeLine) {
        prompt = withAdultAgeLine(neutralizeYouthWords(prompt), stillAgeLine);
      }

      // A spoken line makes a talking clip (LTX-2.5 speaks the quoted words, lip-synced).
      const spokenLine = normalizeSpokenLine(latest.line);

      const queueClipMode = retry
        ? hasInit
          ? ('i2v' as const)
          : ('t2v' as const)
        : useNativeExtend
          ? ('extend' as const)
          : hasInit
            ? ('i2v' as const)
            : ('t2v' as const);

      // LTX-2.5 converts image-to-video clips only, and drifts off two-person sex acts — those
      // (and text-to-video / extend) stay on WAN.
      const adultDuo = [latest.prompt, parentEntry?.prompt].some(text =>
        (text ?? '').includes(RAPID_DUO_RECIPE_MARK)
      );
      const speaking = Boolean(spokenLine) && queueClipMode === 'i2v' && !adultDuo;
      if (speaking) {
        // Talking: she stays put facing the camera; an adult still's age sentence stays.
        prompt = talkingClipPrompt({ line: spokenLine, speaker: leadIsMan() ? 'He' : 'She' });
        if (stillAgeLine) prompt = withAdultAgeLine(prompt, stillAgeLine);
      }
      const clipModel =
        queueClipMode === 'i2v'
          ? clipEngineForShot(videoModel, {
              adultDuo,
              speaking,
              clothedSolo: [latest.prompt, parentEntry?.prompt].every(
                text => stillPromptPeople(text) === 1 && !isAdultContentPrompt(text)
              ),
              keepLtxForClothedSolo:
                loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).ltxClothedSolo === true,
            })
          : clipEngineForShot(videoModel, { adultDuo: true });

      // A talking clip starts chest-up when her face is small in the still (talking-clip-framing).
      let talkingCropped = false;
      if (speaking && hasInit && !inputImage && inputImageUrl && !latest.lineFullFrame) {
        const framed = await framedTalkingStill(inputImageUrl);
        if (framed) {
          inputImage = framed;
          inputImageUrl = undefined;
          talkingCropped = true;
        }
      }

      let promptId: string | undefined;
      try {
        promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
          queueTool: 'video',
          queueModel: clipModel,
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
          ...roleplayCharacterQueueFields(
            undefined,
            speaking
              ? {
                  // ~5 s: room for a line of about 14 words.
                  videoFrames: 80,
                  videoFps: 16,
                  videoSpeech: 'on',
                  ...castVoiceSampleFor(loadSettingsCache().shared.activeCharacterId),
                  // Not cropped chest-up: render larger so the small face holds.
                  ...(talkingCropped ? {} : { videoLongSide: LTX25_TALKING_FULL_FRAME_LONG_SIDE }),
                }
              : { videoFrames: 64, videoFps: 16 }
          ),
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
