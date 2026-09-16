'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { cacheBustIdentityMediaUrl, persistIdentityImage } from '@/lib/gallery-media-client';
import {
  dayPlateIsolatePending,
  dayPlateSourceKey,
  resolveDayPlateForIsolate,
  type DayPlate,
} from '@/lib/day-plate';
import {
  collectIsolateSourceUrls,
  isolateSubjectOnWhite,
  ISOLATE_QUEUE_BLOCKED_MESSAGE,
  loadImageBlobFromUrls,
  normalizeIsolateSubject,
} from '@/lib/isolate-subject';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import type { DayToolCache } from '@/lib/settings-cache';

type DayPlateIsolateCacheFields = Pick<
  DayToolCache,
  | 'isolateSubject'
  | 'referenceIsolated'
  | 'plateIsolateSourceKey'
  | 'plateImageUrl'
  | 'plateImageFilename'
  | 'plateOriginalUrl'
  | 'plateOriginalFilename'
>;

export function useDayPlateIsolate(input: {
  mounted: boolean;
  model?: string | null;
  basePlate: DayPlate | null;
  toolSettings: DayPlateIsolateCacheFields;
  updateToolSettings: (patch: Partial<DayToolCache>) => void;
  setError: (message: string | null) => void;
}) {
  const { mounted, model, basePlate, toolSettings, updateToolSettings, setError } = input;
  const [isolateStatus, setIsolateStatus] = useState<string | null>(null);
  const [isolateBusy, setIsolateBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isolateGenRef = useRef(0);
  const autoIsolateAttemptedRef = useRef('');

  const isolateSubject = normalizeIsolateSubject(toolSettings.isolateSubject);
  const sourceKey = dayPlateSourceKey(basePlate);
  const isolateCache = useMemo(
    () => ({
      isolateSubject: toolSettings.isolateSubject,
      referenceIsolated: toolSettings.referenceIsolated,
      plateIsolateSourceKey: toolSettings.plateIsolateSourceKey,
      plateImageUrl: toolSettings.plateImageUrl,
      plateImageFilename: toolSettings.plateImageFilename,
      plateOriginalUrl: toolSettings.plateOriginalUrl,
      plateOriginalFilename: toolSettings.plateOriginalFilename,
    }),
    [
      toolSettings.isolateSubject,
      toolSettings.plateImageFilename,
      toolSettings.plateImageUrl,
      toolSettings.plateIsolateSourceKey,
      toolSettings.plateOriginalFilename,
      toolSettings.plateOriginalUrl,
      toolSettings.referenceIsolated,
    ]
  );
  const plate = useMemo(
    () =>
      resolveDayPlateForIsolate({
        basePlate,
        isolateSubject,
        cache: isolateCache,
      }),
    [basePlate, isolateCache, isolateSubject]
  );
  const isolatePending = dayPlateIsolatePending({
    basePlate,
    isolateSubject,
    cache: isolateCache,
  });
  const hasPlate = Boolean(plate?.filename?.trim() || plate?.imageUrl?.trim());
  const displayUrl = previewUrl || plate?.imageUrl?.trim() || null;

  const clearPreview = useCallback(() => {
    setPreviewUrl(previous => {
      if (previous?.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
      }
      return null;
    });
  }, []);

  const applyIsolate = useCallback(
    async (options?: { isolate?: boolean }) => {
      if (!basePlate) {
        throw new Error('Add a plate first — Keep in Outfit or set a Cast look.');
      }
      const shouldIsolate = options?.isolate ?? isolateSubject;
      const originalUrl = basePlate.originalUrl?.trim() || basePlate.imageUrl?.trim() || '';
      const originalFilename =
        basePlate.originalFilename?.trim() || basePlate.filename?.trim() || '';
      if (!originalUrl && !originalFilename) {
        throw new Error('Plate has no image to isolate.');
      }

      isolateGenRef.current += 1;
      const gen = isolateGenRef.current;
      setIsolateBusy(true);
      setIsolateStatus(null);
      setError(null);
      if (originalUrl) {
        setPreviewUrl(previous => {
          if (previous?.startsWith('blob:') && previous !== originalUrl) {
            URL.revokeObjectURL(previous);
          }
          return originalUrl;
        });
      }

      try {
        const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
        const originalName = originalFilename || `day-plate-${Date.now()}.png`;
        const sourceFile = await (async () => {
          const blob = await loadImageBlobFromUrls(
            collectIsolateSourceUrls({
              imageUrl: originalUrl,
              filename: originalName,
              comfyUrl,
            })
          );
          return new File([blob], originalName, {
            type: blob.type || 'image/png',
            lastModified: Date.now(),
          });
        })();
        if (gen !== isolateGenRef.current) {
          return;
        }

        const originalUploaded = await resolveQueueInputImage({
          file: sourceFile,
          filename: originalName,
          model: model ?? undefined,
        });
        if (gen !== isolateGenRef.current) {
          return;
        }
        const uploadedOriginalFilename = originalUploaded?.filename?.trim() || originalName;
        const originalViewUrl =
          collectIsolateSourceUrls({
            filename: uploadedOriginalFilename,
            comfyUrl,
          }).find(url => url.includes('/api/comfyui/view?')) ?? '';
        const durableOriginal =
          originalUrl && !originalUrl.startsWith('blob:')
            ? originalUrl
            : originalViewUrl || originalUrl;

        let queueFilename = uploadedOriginalFilename;
        let queueUrl = durableOriginal;
        let isolated = false;

        if (!shouldIsolate) {
          const originalDurable = await persistIdentityImage({
            file: sourceFile,
            filename: uploadedOriginalFilename,
          });
          if (gen !== isolateGenRef.current) {
            return;
          }
          queueUrl = originalDurable || durableOriginal;
        } else if (basePlate.isolated === true && dayPlateSourceKey(basePlate) === sourceKey) {
          queueFilename = basePlate.filename?.trim() || uploadedOriginalFilename;
          queueUrl = basePlate.imageUrl?.trim() || durableOriginal;
          isolated = true;
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
              model: model ?? undefined,
            });
            const cutoutFilename = cutoutUploaded?.filename?.trim();
            if (!cutoutFilename) {
              throw new Error('Cut-out upload did not return a filename.');
            }
            const cutoutDurable = await persistIdentityImage({
              file: cutout,
              filename: cutoutFilename,
            });
            if (gen !== isolateGenRef.current) {
              return;
            }
            const cutoutPreview = URL.createObjectURL(cutout);
            setPreviewUrl(previous => {
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
            const originalDurable = await persistIdentityImage({
              file: sourceFile,
              filename: uploadedOriginalFilename,
            });
            queueUrl = originalDurable || durableOriginal;
          }
        }

        if (gen !== isolateGenRef.current) {
          return;
        }

        updateToolSettings({
          isolateSubject: shouldIsolate,
          referenceIsolated: isolated,
          plateIsolateSourceKey: sourceKey,
          plateOriginalFilename: uploadedOriginalFilename,
          plateOriginalUrl: durableOriginal,
          plateImageFilename: queueFilename,
          plateImageUrl: queueUrl,
        });
        if (!isolated && !queueUrl.startsWith('blob:')) {
          setPreviewUrl(cacheBustIdentityMediaUrl(queueUrl));
        }
        setIsolateStatus(isolated ? 'Subject isolated on white.' : null);
      } catch (err) {
        if (gen !== isolateGenRef.current) {
          return;
        }
        clearPreview();
        setIsolateStatus(null);
        throw err;
      } finally {
        if (gen === isolateGenRef.current) {
          setIsolateBusy(false);
        }
      }
    },
    [basePlate, clearPreview, isolateSubject, model, setError, sourceKey, updateToolSettings]
  );

  const setIsolateSubject = useCallback(
    (next: boolean) => {
      if (!next) {
        isolateGenRef.current += 1;
        autoIsolateAttemptedRef.current = '';
        const originalUrl =
          toolSettings.plateOriginalUrl?.trim() ||
          basePlate?.originalUrl?.trim() ||
          basePlate?.imageUrl?.trim() ||
          '';
        const originalFilename =
          toolSettings.plateOriginalFilename?.trim() ||
          basePlate?.originalFilename?.trim() ||
          basePlate?.filename?.trim() ||
          '';
        updateToolSettings({
          isolateSubject: false,
          referenceIsolated: false,
          plateImageUrl: originalUrl || undefined,
          plateImageFilename: originalFilename || undefined,
        });
        if (originalUrl) {
          setPreviewUrl(cacheBustIdentityMediaUrl(originalUrl));
        } else {
          clearPreview();
        }
        setIsolateStatus(null);
        return;
      }
      updateToolSettings({ isolateSubject: true });
      if (!basePlate) {
        return;
      }
      void applyIsolate({ isolate: true }).catch(err => {
        setError(err instanceof Error ? err.message : 'Could not isolate the Day plate.');
      });
    },
    [
      applyIsolate,
      basePlate,
      clearPreview,
      setError,
      toolSettings.plateOriginalFilename,
      toolSettings.plateOriginalUrl,
      updateToolSettings,
    ]
  );

  useEffect(() => {
    if (!mounted || !basePlate || isolateBusy) {
      return;
    }
    if (!isolateSubject) {
      autoIsolateAttemptedRef.current = '';
      return;
    }
    if (!isolatePending) {
      autoIsolateAttemptedRef.current = '';
      return;
    }
    if (autoIsolateAttemptedRef.current === sourceKey) {
      return;
    }
    autoIsolateAttemptedRef.current = sourceKey;
    scheduleAfterCommit(() => {
      void applyIsolate({ isolate: true }).catch(err => {
        setError(err instanceof Error ? err.message : 'Could not isolate the Day plate.');
      });
    });
  }, [
    applyIsolate,
    basePlate,
    isolateBusy,
    isolatePending,
    isolateSubject,
    mounted,
    setError,
    sourceKey,
  ]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      clearPreview();
      setIsolateStatus(null);
    });
  }, [clearPreview, sourceKey]);

  useEffect(() => {
    if (!displayUrl || previewUrl) {
      return;
    }
    if (!displayUrl.startsWith('blob:')) {
      scheduleAfterCommit(() => {
        setPreviewUrl(cacheBustIdentityMediaUrl(displayUrl));
      });
    }
  }, [displayUrl, previewUrl]);

  return {
    plate,
    hasPlate,
    isolateSubject,
    isolatePending,
    isolateBusy,
    isolateStatus,
    platePreviewUrl: displayUrl,
    setIsolateSubject,
    applyIsolate,
  };
}
