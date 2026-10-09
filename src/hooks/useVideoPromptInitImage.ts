'use client';

import { useCallback, useState } from 'react';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { looksLikeVideoUrl } from '@/lib/media-kind';
import { extractVideoLastFrame } from '@/lib/video-last-frame';
import { preferCloudForVideoStillHandoff } from '@/lib/video-still-handoff';
import { canFalExtendFromParentUrl, type VideoClipMode } from '@/lib/video-clip-mode';
import { loadEngineSettings, saveEngineSettings } from '@/lib/engine-settings';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { isVideoModel } from '@/lib/queue-tool-model';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import { sharedPatchFromGalleryHandoff, type GalleryHandoffPayload } from '@/lib/gallery-handoff';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import type { SharedToolSettings } from '@/lib/settings-cache';
import {
  parseVisionScanApiResponse,
  prepareVisionScanImagePayload,
  resolveStillFileForVisionScan,
} from '@/lib/vision-scan-still';

export const LOCAL_INIT_IMAGE_MARKER = 'local-upload';

export function isFetchableImageRef(value: string): boolean {
  return /^(?:https?:|data:|blob:)/i.test(value.trim());
}

type UseVideoPromptInitImageOptions = {
  initImageUrl: string;
  setInitImageUrl: (value: string) => void;
  setParentVideoUrl: (value: string) => void;
  setParentGalleryEntryId: (value: string | undefined) => void;
  setClipMode: (mode: VideoClipMode) => void;
  setSubject: (value: string) => void;
  setMotion: (value: string) => void;
  setError: (value: string | null) => void;
  updateShared: (patch: Partial<SharedToolSettings>) => void;
  updateToolSettings: (patch: Record<string, unknown>) => void;
  camera: string;
  style: string;
  shared: SharedToolSettings;
};

export function useVideoPromptInitImage({
  initImageUrl,
  setInitImageUrl,
  setParentVideoUrl,
  setParentGalleryEntryId,
  setClipMode,
  setSubject,
  setMotion,
  setError,
  updateShared,
  updateToolSettings,
  camera,
  style,
  shared,
}: UseVideoPromptInitImageOptions) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const revokePreviewIfBlob = useCallback((url: string | null | undefined) => {
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }, []);

  const clearInitImage = useCallback(() => {
    setFile(null);
    setPreviewUrl(current => {
      revokePreviewIfBlob(current);
      return null;
    });
    setInitImageUrl('');
    setParentVideoUrl('');
  }, [revokePreviewIfBlob, setInitImageUrl, setParentVideoUrl]);

  const onInitFileChange = useCallback(
    (nextFile: File | null) => {
      setFile(nextFile);
      setPreviewUrl(current => {
        revokePreviewIfBlob(current);
        return nextFile ? URL.createObjectURL(nextFile) : null;
      });
      setInitImageUrl(nextFile ? LOCAL_INIT_IMAGE_MARKER : '');
      if (nextFile) {
        setClipMode('i2v');
      }
    },
    [revokePreviewIfBlob, setClipMode, setInitImageUrl]
  );

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      queueParams?: WorkflowParamValues;
      file: File | null;
      previewUrl: string | null;
      payload: GalleryHandoffPayload;
    }) => {
      const framesFromHandoff = Number(handoff.queueParams?.videoFrames);
      const fpsFromHandoff = Number(handoff.queueParams?.videoFps);
      const imageRef =
        handoff.payload.imageUrl?.trim() ||
        handoff.previewUrl?.trim() ||
        (handoff.file ? LOCAL_INIT_IMAGE_MARKER : '');

      const rawUrl = handoff.payload.imageUrl?.trim() || handoff.previewUrl?.trim() || '';
      const parentIsVideo = Boolean(rawUrl && looksLikeVideoUrl(rawUrl));
      const engine = loadEngineSettings().engine;
      const useFalExtend = parentIsVideo && engine === 'fal' && canFalExtendFromParentUrl(rawUrl);

      updateToolSettings({
        ...(parentIsVideo ? { parentVideoUrl: rawUrl } : { parentVideoUrl: '' }),
        ...(useFalExtend
          ? { clipMode: 'extend' as const, initImageUrl: '' }
          : imageRef
            ? { initImageUrl: imageRef, clipMode: 'i2v' as const }
            : { clipMode: 'i2v' as const }),
        ...(handoff.prompt?.trim() ? { subject: handoff.prompt.trim().slice(0, 400) } : {}),
        ...(Number.isFinite(framesFromHandoff) && framesFromHandoff > 0
          ? { frames: Math.floor(framesFromHandoff) }
          : {}),
        ...(Number.isFinite(fpsFromHandoff) && fpsFromHandoff > 0
          ? { fps: Math.floor(fpsFromHandoff) }
          : {}),
      });
      void preferCloudForVideoStillHandoff().then(cloudEngine => {
        if (cloudEngine) {
          saveEngineSettings({ engine: cloudEngine });
          updateShared({ inferenceEngine: cloudEngine });
        }
      });

      const sharedPatch = sharedPatchFromGalleryHandoff(handoff.payload);
      const handoffModel = handoff.model?.trim() as ComfyImageModel | undefined;
      if (handoffModel && isVideoModel(handoffModel)) {
        updateShared({
          model: handoffModel,
          ...sharedPatch,
        });
        updateToolSettings({ model: handoffModel });
      } else if (Object.keys(sharedPatch).length > 0) {
        updateShared(sharedPatch);
      }

      setParentGalleryEntryId(handoff.payload.galleryEntryId?.trim() || undefined);

      if (useFalExtend) {
        setFile(null);
        setPreviewUrl(current => {
          revokePreviewIfBlob(current);
          return rawUrl;
        });
        return;
      }

      if (parentIsVideo) {
        void extractVideoLastFrame(rawUrl)
          .then(blob => {
            const nextFile = new File([blob], 'last-frame.jpg', {
              type: blob.type || 'image/jpeg',
            });
            setFile(nextFile);
            setPreviewUrl(current => {
              revokePreviewIfBlob(current);
              return URL.createObjectURL(nextFile);
            });
            setInitImageUrl(LOCAL_INIT_IMAGE_MARKER);
          })
          .catch(() => {
            setError('Could not read the last frame.');
            setPreviewUrl(current => {
              revokePreviewIfBlob(current);
              return handoff.previewUrl;
            });
            setFile(handoff.file);
          });
        return;
      }

      setPreviewUrl(current => {
        revokePreviewIfBlob(current);
        return handoff.previewUrl;
      });
      setFile(handoff.file);
    },
    [
      revokePreviewIfBlob,
      setError,
      setInitImageUrl,
      setParentGalleryEntryId,
      updateShared,
      updateToolSettings,
    ]
  );

  useGalleryHandoff('video', applyGalleryHandoff);

  const pastedInitValue = initImageUrl === LOCAL_INIT_IMAGE_MARKER ? '' : initImageUrl;
  const hasInitImage = Boolean(file || previewUrl || pastedInitValue.trim());

  const scanInitWithVision = useCallback(async () => {
    if (!hasInitImage) {
      setError('Add a first frame before scanning.');
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const still = await resolveStillFileForVisionScan({
        file,
        urls: [previewUrl, pastedInitValue],
        fallbackName: 'video-init.jpg',
      });
      const { image, mimeType } = await prepareVisionScanImagePayload(still);
      const response = await fetch('/api/video-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'scan',
          image,
          mimeType,
          camera: camera.trim() || undefined,
          style: style.trim() || undefined,
          ...sharedLlmRequestBody(shared),
        }),
      });
      const data = await parseVisionScanApiResponse<{
        subject?: string;
        motion?: string;
        error?: string;
      }>(response);
      if (!response.ok || !data.subject?.trim()) {
        throw new Error(data.error ?? 'Vision scan failed.');
      }
      setClipMode('i2v');
      setSubject(data.subject.trim());
      setMotion(data.motion?.trim() || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vision scan failed.');
    } finally {
      setScanning(false);
    }
  }, [
    camera,
    file,
    hasInitImage,
    pastedInitValue,
    previewUrl,
    setClipMode,
    setError,
    setMotion,
    setSubject,
    shared,
    style,
  ]);

  return {
    file,
    previewUrl,
    scanning,
    hasInitImage,
    pastedInitValue,
    clearInitImage,
    onInitFileChange,
    scanInitWithVision,
    setPreviewUrl,
    setFile,
    revokePreviewIfBlob,
    setInitImageUrl,
  };
}
