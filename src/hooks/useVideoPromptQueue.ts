'use client';

import { useCallback, useState } from 'react';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { nextRoleplayMotionKind } from '@/lib/roleplay-film';
import {
  canFalExtendFromParentUrl,
  continueClipPathRanMessage,
  engineCanQueueClips,
  resolveVideoContinuePath,
  type VideoClipMode,
  type VideoContinuePath,
} from '@/lib/video-clip-mode';
import { engineDisplayName } from '@/lib/engine/capabilities';
import { resolveFalExtendParentUrl } from '@/lib/fal-extend-upload';
import { loadEngineSettings } from '@/lib/engine-settings';
import { extractVideoLastFrame } from '@/lib/video-last-frame';
import { registerContinueStitch } from '@/lib/video-continue-stitch';
import { isFetchableImageRef, LOCAL_INIT_IMAGE_MARKER } from '@/hooks/useVideoPromptInitImage';
import { getCharacter } from '@/lib/character-os';
import { withCastIdentityQueueFields } from '@/lib/look-outfit-plate';
import type { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { SharedToolSettings } from '@/lib/settings-cache';

type PromptActions = ReturnType<typeof usePromptResultActions>;

type UseVideoPromptQueueOptions = {
  subject: string;
  motion: string;
  camera: string;
  style: string;
  durationSec: number;
  frames: number | undefined;
  fps: number | undefined;
  initImageUrl: string;
  parentVideoUrl: string;
  parentGalleryEntryId: string | undefined;
  file: File | null;
  previewUrl: string | null;
  hasInitImage: boolean;
  clipMode: VideoClipMode;
  shared: SharedToolSettings;
  actions: PromptActions;
  setError: (value: string | null) => void;
  setOutput: (value: string) => void;
};

export function useVideoPromptQueue({
  subject,
  motion,
  camera,
  style,
  durationSec,
  frames,
  fps,
  initImageUrl,
  parentVideoUrl,
  parentGalleryEntryId,
  file,
  previewUrl,
  hasInitImage,
  clipMode,
  shared,
  actions,
  setError,
  setOutput,
}: UseVideoPromptQueueOptions) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const inferenceEngine = shared.inferenceEngine || loadEngineSettings().engine;

  const buildVideoQueueOptions = useCallback(
    (overrides?: {
      clipMode?: VideoClipMode;
      videoUrl?: string;
      inputImage?: File;
      clearInit?: boolean;
    }) => {
      const effectiveClipMode = overrides?.clipMode ?? clipMode;
      const initImage = initImageUrl.trim();
      const initImageIsFetchable =
        initImage !== LOCAL_INIT_IMAGE_MARKER && isFetchableImageRef(initImage);
      const previewIsFetchable = Boolean(previewUrl && isFetchableImageRef(previewUrl));
      const resolvedFps =
        typeof fps === 'number' && Number.isFinite(fps) && fps > 0 ? Math.floor(fps) : 16;
      const resolvedFrames =
        typeof frames === 'number' && Number.isFinite(frames) && frames > 0
          ? Math.floor(frames)
          : Math.max(1, Math.round(Math.max(1, Number(durationSec) || 4) * resolvedFps));

      const useInit = effectiveClipMode === 'i2v' || Boolean(overrides?.inputImage);
      const lastFrameFile = overrides?.inputImage;
      const character = shared.activeCharacterId?.trim()
        ? getCharacter(shared.activeCharacterId)
        : undefined;
      const identityFields = withCastIdentityQueueFields(
        character,
        shared.ipAdapterStrength ?? 0.75,
        {
          videoFrames: resolvedFrames,
          videoFps: resolvedFps,
        }
      );
      return {
        inputImage: useInit ? lastFrameFile || file : undefined,
        inputImageUrl:
          useInit && !lastFrameFile
            ? file
              ? undefined
              : previewIsFetchable
                ? previewUrl!
                : initImageIsFetchable
                  ? initImage
                  : undefined
            : undefined,
        inputImageFilename:
          useInit &&
          !lastFrameFile &&
          !file &&
          !previewIsFetchable &&
          !initImageIsFetchable &&
          initImage &&
          initImage !== LOCAL_INIT_IMAGE_MARKER
            ? initImage
            : undefined,
        ...identityFields,
        parentGalleryEntryId,
        characterId: shared.activeCharacterId,
        lookId: shared.activeLookId ?? character?.activeLookId,
        derivedKind:
          effectiveClipMode === 'extend' || overrides?.clearInit === false
            ? ('extend' as const)
            : parentGalleryEntryId
              ? nextRoleplayMotionKind(
                  loadComfyGallery().find(entry => entry.id === parentGalleryEntryId)
                )
              : effectiveClipMode === 'i2v'
                ? ('i2v' as const)
                : ('t2v' as const),
        clipMode: effectiveClipMode,
        videoUrl:
          effectiveClipMode === 'extend'
            ? overrides?.videoUrl?.trim() || parentVideoUrl.trim() || undefined
            : undefined,
      };
    },
    [
      clipMode,
      durationSec,
      file,
      frames,
      fps,
      initImageUrl,
      parentGalleryEntryId,
      parentVideoUrl,
      previewUrl,
      shared.activeCharacterId,
      shared.activeLookId,
      shared.ipAdapterStrength,
    ]
  );

  const queueVideo = useCallback(
    (output: string) => {
      if (!output.trim()) {
        return;
      }
      if (!engineCanQueueClips(inferenceEngine) && inferenceEngine !== 'comfyui') {
        setError(
          `${engineDisplayName(inferenceEngine)} cannot queue clips. Switch the inference engine to Fal, Replicate, Grok, Gemini, Runway, or local WAN (ComfyUI).`
        );
        return;
      }
      if (clipMode === 'i2v' && !hasInitImage) {
        setError('Image-to-video needs a first frame.');
        return;
      }
      if (clipMode === 'extend' && !parentVideoUrl.trim()) {
        setError('Extend needs a parent clip. Continue from Gallery or paste a clip URL.');
        return;
      }
      void (async () => {
        let continuePath: VideoContinuePath =
          clipMode === 'extend'
            ? resolveVideoContinuePath({
                engine: inferenceEngine,
                parentUrl: parentVideoUrl,
              })
            : 'last-frame';
        let options = buildVideoQueueOptions();
        let pathNote: string | null = null;

        if (clipMode === 'extend' && inferenceEngine === 'fal') {
          if (!canFalExtendFromParentUrl(parentVideoUrl)) {
            const uploaded = await resolveFalExtendParentUrl({
              parentUrl: parentVideoUrl,
              falApiKey: shared.sessionFalApiKey,
            });
            if (uploaded.url) {
              options = buildVideoQueueOptions({ videoUrl: uploaded.url });
              continuePath = 'extend';
            } else {
              // Soft-fail → last-frame I2V (same policy as Roleplay).
              try {
                const blob = await extractVideoLastFrame(parentVideoUrl);
                const lastFrame = new File([blob], 'video-last-frame.jpg', {
                  type: blob.type || 'image/jpeg',
                });
                options = buildVideoQueueOptions({
                  clipMode: 'i2v',
                  inputImage: lastFrame,
                });
                options.derivedKind = 'extend';
                continuePath = 'last-frame';
                pathNote = `${
                  uploaded.uploadError?.trim() ||
                  'Could not upload that local clip to Fal for extend-video.'
                } Continuing from the last frame instead.`;
              } catch {
                setError(
                  uploaded.uploadError?.trim() ||
                    'Could not upload that local clip to Fal. Continue from last frame instead, or use a Fal-hosted clip.'
                );
                return;
              }
            }
          }
        } else if (
          clipMode === 'extend' &&
          continuePath === 'extend' &&
          inferenceEngine === 'grok'
        ) {
          options = buildVideoQueueOptions({ videoUrl: parentVideoUrl.trim() });
        } else if (
          clipMode === 'extend' &&
          (continuePath === 'last-frame' || continuePath === 'stitch')
        ) {
          try {
            const blob = await extractVideoLastFrame(parentVideoUrl);
            const lastFrame = new File([blob], 'video-last-frame.jpg', {
              type: blob.type || 'image/jpeg',
            });
            options = buildVideoQueueOptions({
              clipMode: 'i2v',
              inputImage: lastFrame,
            });
            options.derivedKind = 'extend';
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not read the last frame.');
            return;
          }
        }

        if (pathNote) {
          setError(pathNote);
        } else if (clipMode === 'extend') {
          setError(continueClipPathRanMessage(continuePath));
        }

        const promptId = await actions.sendComfyUi(output, null, undefined, options);
        if (
          promptId &&
          clipMode === 'extend' &&
          continuePath === 'stitch' &&
          parentVideoUrl.trim()
        ) {
          registerContinueStitch({
            childPromptId: promptId,
            parentUrl: parentVideoUrl.trim(),
          });
        }
      })();
    },
    [
      actions,
      buildVideoQueueOptions,
      clipMode,
      hasInitImage,
      inferenceEngine,
      parentVideoUrl,
      setError,
      shared.sessionFalApiKey,
    ]
  );

  const generate = useCallback(async () => {
    if (!subject.trim()) {
      setError('Describe the subject or action.');
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      const response = await fetch('/api/video-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          motion,
          camera,
          style,
          durationSec,
          model: shared.model,
        }),
      });
      const data = (await response.json()) as {
        prompt?: string;
        method?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? 'Video prompt failed.');
      }
      const prompt = await actions.finalizePrompt(data.prompt ?? '', motion);
      setOutput(prompt);
      rememberDraftFields({
        toolKey: 'video',
        label: 'Video',
        href: '/video',
        fields: [prompt, subject, motion],
      });
    } catch (err) {
      setOutput('');
      setError(err instanceof Error ? err.message : 'Video prompt failed.');
    } finally {
      setLoading(false);
    }
  }, [actions, camera, durationSec, motion, setError, setOutput, shared.model, style, subject]);

  const copyOutput = useCallback(
    async (output: string) => {
      if (!output) {
        return;
      }
      try {
        await navigator.clipboard.writeText(output);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        setError('Could not copy to clipboard.');
      }
    },
    [setError]
  );

  return {
    loading,
    copied,
    inferenceEngine,
    generate,
    queueVideo,
    copyOutput,
  };
}
