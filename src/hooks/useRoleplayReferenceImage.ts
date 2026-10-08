'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import {
  cacheBustIdentityMediaUrl,
  IDENTITY_MEDIA_URL,
  isIdentityMediaUrl,
  persistOwnedPlateImage,
  sessionPlateMediaId,
} from '@/lib/gallery-media-client';
import {
  collectIsolateSourceUrls,
  isolateSubjectOnWhite,
  ISOLATE_QUEUE_BLOCKED_MESSAGE,
  loadImageBlobFromUrls,
} from '@/lib/isolate-subject';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import {
  lastRoleplayStillImage,
  normalizeRoleplayIsolateSubject,
  normalizeRoleplayPlayAs,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { resolveLocalImageFile, scanStillWithVision } from '@/lib/vision-still-scan-client';
import type { SharedToolSettings, RoleplayToolCache } from '@/lib/settings-cache';

export type RoleplayReferenceApplyInput = {
  file?: File | null;
  imageUrl?: string;
  filename?: string;
  isolate?: boolean;
};

type UseRoleplayReferenceImageOptions = {
  mounted: boolean;
  story: RoleplayStoryBeat[];
  shared: Pick<
    SharedToolSettings,
    | 'activeCharacterId'
    | 'model'
    | 'detail'
    | 'sessionLlmTemperature'
    | 'sessionAllowTemplateFallback'
    | 'sessionLlmModel'
    | 'sessionLlmVisionModel'
    | 'sessionLlmEnabled'
    | 'sessionLlmProvider'
    | 'sessionLlmApiKey'
  >;
  toolSettings: Pick<
    RoleplayToolCache,
    | 'playAs'
    | 'isolateSubject'
    | 'referenceImageUrl'
    | 'referenceImageFilename'
    | 'referenceOriginalUrl'
    | 'referenceOriginalFilename'
    | 'referenceIsolated'
    | 'extraHints'
  >;
  updateToolSettings: (partial: Partial<RoleplayToolCache>) => void;
  setError: (message: string | null) => void;
};

export function useRoleplayReferenceImage({
  mounted,
  story,
  shared,
  toolSettings,
  updateToolSettings,
  setError,
}: UseRoleplayReferenceImageOptions) {
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [isolateStatus, setIsolateStatus] = useState<string | null>(null);
  const isolateGenRef = useRef(0);
  const autoIsolateAttemptedRef = useRef(false);

  const playAs = normalizeRoleplayPlayAs(toolSettings.playAs);
  const referenceImageUrl = toolSettings.referenceImageUrl?.trim() || '';
  const referenceImageFilename = toolSettings.referenceImageFilename?.trim() || '';
  const hasReferenceImage = Boolean(referenceImageUrl || referenceImageFilename);
  const lastStill = lastRoleplayStillImage(story);
  const isolateSubject = normalizeRoleplayIsolateSubject(toolSettings.isolateSubject);
  const referenceOriginalUrl = toolSettings.referenceOriginalUrl?.trim() || '';
  const referenceOriginalFilename = toolSettings.referenceOriginalFilename?.trim() || '';
  const photoReady = playAs !== 'photo' || hasReferenceImage;
  const displayReferenceUrl = referencePreviewUrl || referenceImageUrl;

  const clearReferencePreview = useCallback(() => {
    setReferencePreviewUrl(current => {
      if (current?.startsWith('blob:')) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, []);

  const applyReference = useCallback(
    async (input: RoleplayReferenceApplyInput) => {
      const imageUrl = input.imageUrl?.trim() || '';
      const file = input.file ?? null;
      if (!file && !imageUrl && !input.filename?.trim()) {
        throw new Error('Choose a photo or a gallery still first.');
      }
      const shouldIsolate = input.isolate ?? isolateSubject;
      isolateGenRef.current += 1;
      const gen = isolateGenRef.current;
      setReferenceUploading(true);
      setIsolateStatus(null);
      setError(null);
      const localPreview = file ? URL.createObjectURL(file) : imageUrl || null;
      if (localPreview) {
        setReferencePreviewUrl(previous => {
          if (previous?.startsWith('blob:') && previous !== localPreview) {
            URL.revokeObjectURL(previous);
          }
          return localPreview;
        });
      }
      try {
        const originalName = input.filename || file?.name || `roleplay-ref-${Date.now()}.png`;
        const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
        const sourceFile =
          file ??
          (await (async () => {
            const blob = await loadImageBlobFromUrls(
              collectIsolateSourceUrls({
                imageUrl,
                filename: originalName,
                comfyUrl,
              })
            );
            return new File([blob], originalName, {
              type: blob.type || 'image/png',
              lastModified: Date.now(),
            });
          })());
        if (gen !== isolateGenRef.current) {
          return;
        }
        const originalUploaded = await resolveQueueInputImage({
          file: sourceFile,
          filename: originalName,
          model: shared.model,
        });
        if (gen !== isolateGenRef.current) {
          return;
        }
        const originalFilename = originalUploaded?.filename?.trim();
        if (!originalFilename) {
          throw new Error('Upload did not return a filename.');
        }
        const incomingDurable =
          imageUrl && !imageUrl.startsWith('blob:') && !isIdentityMediaUrl(imageUrl)
            ? imageUrl
            : '';
        const originalViewUrl =
          collectIsolateSourceUrls({
            filename: originalFilename,
            comfyUrl,
          }).find(url => url.includes('/api/comfyui/view?')) ?? '';
        const originalUrl = incomingDurable || originalViewUrl || imageUrl;

        let queueFilename = originalFilename;
        let queueUrl = originalUrl;
        let isolated = false;

        if (!shouldIsolate) {
          const originalDurable = await persistOwnedPlateImage({
            mediaId: sessionPlateMediaId('story'),
            file: sourceFile,
            filename: originalFilename,
          });
          if (gen !== isolateGenRef.current) {
            return;
          }
          queueUrl = originalDurable || originalUrl;
        } else {
          setIsolateStatus('Isolating subject on white…');
          try {
            const cutout = await isolateSubjectOnWhite(sourceFile, originalName);
            if (gen !== isolateGenRef.current) {
              return;
            }
            const cutoutUploaded = await resolveQueueInputImage({
              file: cutout,
              filename: cutout.name,
              model: shared.model,
            });
            const cutoutFilename = cutoutUploaded?.filename?.trim();
            if (!cutoutFilename) {
              throw new Error('Cut-out upload did not return a filename.');
            }
            const cutoutDurable = await persistOwnedPlateImage({
              mediaId: sessionPlateMediaId('story'),
              file: cutout,
              filename: cutoutFilename,
            });
            if (gen !== isolateGenRef.current) {
              return;
            }
            const cutoutPreview = URL.createObjectURL(cutout);
            setReferencePreviewUrl(previous => {
              if (previous?.startsWith('blob:') && previous !== cutoutPreview) {
                URL.revokeObjectURL(previous);
              }
              return cutoutPreview;
            });
            queueFilename = cutoutFilename;
            queueUrl = cutoutDurable || cutoutPreview;
            isolated = true;
          } catch (err) {
            isolated = false;
            setIsolateStatus(null);
            setError(
              err instanceof Error
                ? `${err.message} ${ISOLATE_QUEUE_BLOCKED_MESSAGE}`
                : ISOLATE_QUEUE_BLOCKED_MESSAGE
            );
            const originalDurable = await persistOwnedPlateImage({
              mediaId: sessionPlateMediaId('story'),
              file: sourceFile,
              filename: originalFilename,
            });
            queueUrl = originalDurable || originalUrl;
          }
        }

        if (gen !== isolateGenRef.current) {
          return;
        }
        if (isolated && localPreview?.startsWith('blob:')) {
          URL.revokeObjectURL(localPreview);
        }
        updateToolSettings({
          playAs: 'photo',
          isolateSubject: shouldIsolate,
          referenceOriginalFilename: originalFilename,
          referenceOriginalUrl: originalUrl.startsWith('blob:')
            ? incomingDurable || originalViewUrl
            : originalUrl,
          referenceImageFilename: queueFilename,
          referenceImageUrl: queueUrl,
          referenceIsolated: isolated,
          referenceCharacterId: shared.activeCharacterId?.trim() || undefined,
        });
        if (!isolated && !queueUrl.startsWith('blob:')) {
          setReferencePreviewUrl(cacheBustIdentityMediaUrl(queueUrl));
        }
        setIsolateStatus(isolated ? 'Subject isolated on white.' : null);
      } catch (err) {
        if (gen !== isolateGenRef.current) {
          return;
        }
        clearReferencePreview();
        setIsolateStatus(null);
        throw err;
      } finally {
        if (gen === isolateGenRef.current) {
          setReferenceUploading(false);
        }
      }
    },
    [
      clearReferencePreview,
      isolateSubject,
      setError,
      shared.activeCharacterId,
      shared.model,
      updateToolSettings,
    ]
  );

  const clearReference = useCallback(() => {
    clearReferencePreview();
    updateToolSettings({
      playAs: 'text',
      referenceImageUrl: '',
      referenceImageFilename: '',
      referenceOriginalUrl: '',
      referenceOriginalFilename: '',
      referenceIsolated: false,
    });
  }, [clearReferencePreview, updateToolSettings]);

  const applyGalleryHandoff = useCallback(
    (handoff: {
      file: File | null;
      previewUrl: string | null;
      payload: { imageFilename?: string; imageUrl?: string };
    }) => {
      void applyReference({
        file: handoff.file,
        imageUrl: handoff.previewUrl || handoff.payload.imageUrl,
        filename: handoff.payload.imageFilename,
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Could not use that still.');
      });
    },
    [applyReference, setError]
  );

  useGalleryHandoff('roleplay', applyGalleryHandoff);

  const scanWithVision = useCallback(async () => {
    const preview = referencePreviewUrl || referenceImageUrl;
    if (!preview && !referenceImageFilename) {
      setError('Add a photo first.');
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const image = await resolveLocalImageFile(null, preview, 'roleplay-photo.png');
      const prompt = await scanStillWithVision({
        image,
        purpose: 'roleplay-photo',
        model: shared.model,
        detail: shared.detail,
        extraHints: toolSettings.extraHints?.trim() || undefined,
        shared,
      });
      updateToolSettings({ extraHints: prompt });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vision scan failed.');
    } finally {
      setScanning(false);
    }
  }, [
    referenceImageFilename,
    referenceImageUrl,
    referencePreviewUrl,
    setError,
    shared,
    toolSettings.extraHints,
    updateToolSettings,
  ]);

  useEffect(() => {
    if (!mounted || playAs !== 'photo' || referenceUploading) {
      return;
    }
    if (!isolateSubject) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    if (toolSettings.referenceIsolated === true) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    const originalUrl = referenceOriginalUrl || referenceImageUrl;
    const originalFilename = referenceOriginalFilename || referenceImageFilename;
    if (!originalUrl && !originalFilename) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    if (autoIsolateAttemptedRef.current) {
      return;
    }
    autoIsolateAttemptedRef.current = true;
    void applyReference({
      imageUrl: originalUrl || IDENTITY_MEDIA_URL,
      filename: originalFilename || 'roleplay-ref.png',
      isolate: true,
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Could not isolate that photo.');
    });
  }, [
    applyReference,
    isolateSubject,
    mounted,
    playAs,
    referenceImageFilename,
    referenceImageUrl,
    referenceOriginalFilename,
    referenceOriginalUrl,
    referenceUploading,
    setError,
    toolSettings.referenceIsolated,
  ]);

  return {
    playAs,
    referencePreviewUrl,
    setReferencePreviewUrl,
    referenceUploading,
    scanning,
    isolateStatus,
    setIsolateStatus,
    referenceImageUrl,
    referenceImageFilename,
    hasReferenceImage,
    referenceOriginalUrl,
    referenceOriginalFilename,
    isolateSubject,
    photoReady,
    lastStill,
    displayReferenceUrl,
    clearReference,
    applyReference,
    scanWithVision,
  };
}
