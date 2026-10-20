'use client';

import { pronounceForCast } from '@/lib/cast/speech';
import { useRenderBackend } from '@/lib/render-backend-status';
import {
  framedTalkingStill,
  talkingStillFraming,
  talkingStillBody,
} from '@/lib/talking-clip-framing-client';
import { stillWordsSeated } from '@/lib/talking-clip-framing';
import { adultAgeLineIn, neutralizeYouthWords, withAdultAgeLine } from '@/lib/adult-age-safeguard';
import { stripStillPromptForClip } from '@/lib/clip-prompt-from-still';
import {
  clipEngineForShot,
  ROOM_SOUND_UNDER_TALKING,
  stillHeldGesture,
  stillInMotion,
  withAdultLtxLines,
  isLtx25Model,
  conversationClipPrompt,
  conversationPartnerNoun,
  LTX25_TALKING_FULL_FRAME_LONG_SIDE,
  normalizeSpokenLine,
  talkingClipPrompt,
  dayClipVideoModel,
  storyClipChoice,
} from '@/lib/ltx25-renderer';
import { leadIsMan } from '@/hooks/roleplay/useRoleplayBeatQueueCore';
import { castVoiceSampleFor } from '@/lib/cast/voice';
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
} from '@/lib/story/roleplay';
import { reinforceIntimateStillPrompt } from '@/lib/intimate-prompt-clarify';
import {
  looksLikeVideoUrl,
  nextRoleplayMotionKind,
  shouldAutoQueueRoleplayClip,
} from '@/lib/story/roleplay-film';
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
      // A reply on a two-person still: a one-shot conversation.
      const replyLine = normalizeSpokenLine(latest.replyLine);
      const stillText = parentEntry?.prompt ?? latest.prompt;
      const conversation = speaking && Boolean(replyLine) && stillPromptPeople(stillText) >= 2;
      if (speaking) {
        // Talking: she stays put facing the camera; an adult still's age sentence stays.
        const lead = leadIsMan() ? 'man' : 'woman';
        prompt = conversation
          ? conversationClipPrompt({
              line: pronounceForCast(spokenLine, shared.activeCharacterId),
              reply: replyLine && pronounceForCast(replyLine, shared.activeCharacterId),
              tone: latest.lineTone,
              lead,
              partner: conversationPartnerNoun(stillText, lead),
            })
          : talkingClipPrompt({
              line: pronounceForCast(spokenLine, shared.activeCharacterId),
              speaker: leadIsMan() ? 'He' : 'She',
              tone: latest.lineTone,
            });
        if (stillAgeLine) prompt = withAdultAgeLine(prompt, stillAgeLine);
      }
      // Story clips: the same choices as Day — LTX-2.5 (default), WAN or MiniMax-H3 (Video
      // `storyClips`). Image-to-video only (H3 starts from a frame here).
      const storyClipModel = dayClipVideoModel(
        storyClipChoice(loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).storyClips),
        videoModel
      );
      const clipModel =
        queueClipMode === 'i2v'
          ? clipEngineForShot(storyClipModel, {
              adultDuo,
              speaking,
              clothedSolo: [latest.prompt, parentEntry?.prompt].every(
                text => stillPromptPeople(text) === 1 && !isAdultContentPrompt(text)
              ),
              keepLtxForClothedSolo:
                loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).ltxClothedSolo !== false,
              keepLtxForAdultDuo:
                loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).ltxAdultDuo === true,
            })
          : clipEngineForShot(videoModel, { adultDuo: true });
      // An adult clip on LTX-2.5 — two-person (Video ltxAdultDuo) or a nude solo still: a calm
      // tempo line, a firmer hold on the still and 1024 (comfyui-config); two-person clips also
      // say the anatomy outright.
      const fastPace =
        !speaking &&
        isLtx25Model(clipModel) &&
        (adultDuo || isAdultContentPrompt(parentEntry?.prompt ?? latest.prompt));
      if (fastPace) prompt = withAdultLtxLines(prompt, adultDuo);
      // A clothed one-person clip on LTX also holds the still harder at 1024 (closer face).
      const holdStill =
        fastPace ||
        (!speaking &&
          isLtx25Model(clipModel) &&
          stillPromptPeople(parentEntry?.prompt ?? latest.prompt) === 1 &&
          !isAdultContentPrompt(parentEntry?.prompt ?? latest.prompt));

      // The whole still, for its pose (the crop below replaces the URL with the crop).
      const stillPoseUrl = hasInit && !inputImage ? inputImageUrl : undefined;
      // A talking clip starts chest-up when her face is small in the still (talking-clip-framing).
      let talkingCropped = false;
      if (
        speaking &&
        !conversation &&
        hasInit &&
        !inputImage &&
        inputImageUrl &&
        !latest.lineFullFrame
      ) {
        const framed = await framedTalkingStill(inputImageUrl);
        if (framed) {
          inputImage = framed;
          inputImageUrl = undefined;
          talkingCropped = true;
        }
      }
      // Kept whole and not already close: wording that holds the framing, or LTX punches in to
      // her face (talking-clip-framing.ts).
      const framing =
        speaking && !conversation && !talkingCropped && hasInit && !inputImage && inputImageUrl
          ? await talkingStillFraming(inputImageUrl)
          : 'close';
      // The still's pose: seated or lying (else its words) — only then the seated hold — and the
      // limbs it caught mid-action, which the clip relaxes instead of freezing. Read from the
      // whole still, before any chest-up crop.
      if (speaking && !conversation && stillPoseUrl) {
        const stillBody = await talkingStillBody(stillPoseUrl, stillText);
        const seated =
          framing !== 'close' &&
          (stillBody?.posture ?? (stillWordsSeated(stillText) ? 'seated' : null)) === 'seated';
        prompt = talkingClipPrompt({
          line: pronounceForCast(spokenLine, shared.activeCharacterId),
          speaker: leadIsMan() ? 'He' : 'She',
          tone: latest.lineTone,
          framing,
          seated,
          inMotion: stillInMotion(stillText),
          heldGesture: stillHeldGesture(stillText),
          ...(stillBody ? { limbs: stillBody.limbs } : {}),
        });
        if (stillAgeLine) prompt = withAdultAgeLine(prompt, stillAgeLine);
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
                  // ~5 s: room for a line of about 14 words; ~6 s for a conversation.
                  videoFrames: conversation ? 96 : 80,
                  videoFps: 16,
                  videoSpeech: 'on',
                  // A kept voice would pull both speakers toward hers — not in a conversation.
                  ...(conversation
                    ? {}
                    : castVoiceSampleFor(loadSettingsCache().shared.activeCharacterId)),
                  // Not cropped chest-up: render larger so the small face holds.
                  ...(talkingCropped ? {} : { videoLongSide: LTX25_TALKING_FULL_FRAME_LONG_SIDE }),
                  // The Story's setting as room sound under the voice (ROOM_SOUND_UNDER_TALKING).
                  ...(ROOM_SOUND_UNDER_TALKING &&
                  toolSettings.setting?.trim() &&
                  loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).talkAmbience !== false
                    ? { videoAmbience: toolSettings.setting.trim() }
                    : {}),
                }
              : {
                  videoFrames: 64,
                  videoFps: 16,
                  ...(holdStill ? { videoStillHold: 'on' as const } : {}),
                  ...(isLtx25Model(clipModel) &&
                  loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).ltxRefine === true
                    ? { videoRefine: 'on' as const }
                    : {}),
                }
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
      toolSettings.setting,
      updateToolSettings,
    ]
  );

  useEffect(() => {
    queueBeatMotionRef.current = queueBeatMotion;
  }, [queueBeatMotion]);

  // Auto-clips wait while ComfyUI is down (they would only fail on page open) and run once it
  // is back — nothing is marked queued meanwhile.
  const renderOffline = useRenderBackend().state === 'offline';
  useEffect(() => {
    if (beatOutput !== 'clip' || !autoQueue || renderOffline) {
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
  }, [autoQueue, beatOutput, queueBeatMotion, renderOffline, toolSettings.story]);

  return {
    queueBeatMotion,
    queueBeatMotionRef,
  };
}
