'use client';

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { GALLERY_CAP_KEEPER_MIN_RATING } from '@/lib/gallery-cap';
import {
  downloadGalleryImagesSequential,
  downloadGallerySidecarBundle,
} from '@/lib/comfyui-gallery-export';
import { toastBulkQueueSummary } from '@/lib/app-toast';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { loadCharacters } from '@/lib/character-os';
import { partitionGalleryForArchivePurge } from '@/lib/gallery-protected-ids';

export type UseGalleryPanelRecoveryOptions = {
  entries: ComfyGalleryEntry[];
  setRequeueStatus: Dispatch<SetStateAction<string | null>>;
  removeEntries: (ids: string[]) => void;
};

export type UseGalleryPanelRecoveryResult = {
  retryFailedEntries: (targets: ComfyGalleryEntry[], mode?: 'same' | 'new' | 'exact') => void;
  exportCapKeepers: () => void;
  archiveThenPurgeRest: () => void;
  /** Purge non-keepers without building a ZIP (after archive is already saved). */
  purgeRestOnly: () => void;
  /** Finish a server archive that already completed (optional re-download). */
  finishPendingArchivePurge: () => void;
};

export function useGalleryPanelRecovery({
  entries,
  setRequeueStatus,
  removeEntries,
}: UseGalleryPanelRecoveryOptions): UseGalleryPanelRecoveryResult {
  const archiveBusyRef = useRef(false);
  const resumeAttemptedRef = useRef(false);

  const runArchiveFlow = useCallback(
    (work: () => Promise<{ message: string }>) => {
      if (archiveBusyRef.current) {
        return;
      }
      archiveBusyRef.current = true;
      void work()
        .then(result => {
          setRequeueStatus(result.message);
        })
        .catch(error => {
          const message =
            error instanceof Error
              ? error.message
              : 'Archive & purge failed — nothing was deleted.';
          if (/abort/i.test(message)) {
            setRequeueStatus(
              'Archive interrupted (page navigation). Stay on Gallery — use Finish purge or Purge rest.'
            );
          } else {
            setRequeueStatus(
              error instanceof Error
                ? `Archive & purge failed — ${error.message}`
                : 'Archive & purge failed — nothing was deleted.'
            );
          }
        })
        .finally(() => {
          archiveBusyRef.current = false;
        });
    },
    [setRequeueStatus]
  );

  // After refresh: resume only when sessionStorage has a mid-flight pending job.
  useEffect(() => {
    if (archiveBusyRef.current) {
      return;
    }
    void import('@/lib/gallery-archive-purge').then(
      ({ readPendingArchivePurge, resumePendingArchivePurge }) => {
        const pending = readPendingArchivePurge();
        if (!pending || entries.length === 0 || resumeAttemptedRef.current) {
          return;
        }
        resumeAttemptedRef.current = true;
        setRequeueStatus('Resuming Archive & purge after reload…');
        runArchiveFlow(() =>
          resumePendingArchivePurge({
            removeEntries,
            remainingEntryIds: entries.map(entry => entry.id),
            onProgress: progress => {
              setRequeueStatus(progress.message);
            },
          }).then(result => {
            if (!result) {
              return { message: 'No pending archive to resume.' };
            }
            return result;
          })
        );
      }
    );
  }, [entries, removeEntries, runArchiveFlow, setRequeueStatus]);

  const retryFailedEntries = useCallback(
    (targets: ComfyGalleryEntry[], mode: 'same' | 'new' | 'exact' = 'same') => {
      const failed = targets.filter(entry => entry.status === 'error');
      if (failed.length === 0) {
        return;
      }
      setRequeueStatus(`Retrying ${failed.length} failed job(s)…`);
      void import('@/lib/comfyui-requeue')
        .then(({ requeueComfyJobs }) =>
          requeueComfyJobs(
            failed.map(entry => {
              const canExact = Boolean(entry.hasStoredWorkflow || entry.workflowJson);
              const exactGraph = mode === 'exact' && canExact;
              return {
                prompt: entry.prompt,
                negativePrompt: entry.negativePrompt,
                tool: entry.tool,
                model: entry.model,
                queueParams: entry.queueParams,
                workflowJson: entry.workflowJson,
                newSeed: mode === 'new',
                exactGraph,
                parentGalleryEntryId: entry.id,
                derivedKind: 'variation' as const,
              };
            }),
            setRequeueStatus
          )
        )
        .then(({ queued, failed: failCount }) => {
          toastBulkQueueSummary({
            label: 'Failed retry finished',
            queued,
            failed: failCount,
          });
        });
    },
    [setRequeueStatus]
  );

  const exportCapKeepers = useCallback(() => {
    const keepers = entries.filter(
      entry => Boolean(entry.favorite) || (entry.reviewRating ?? 0) >= GALLERY_CAP_KEEPER_MIN_RATING
    );
    if (keepers.length === 0) {
      setRequeueStatus('No keepers yet — favorite or rate ≥4★ first.');
      return;
    }
    downloadGallerySidecarBundle(keepers);
    setRequeueStatus(`Exporting ${keepers.length} keeper image(s)…`);
    void downloadGalleryImagesSequential(keepers).then(count => {
      setRequeueStatus(`Exported ${count} keeper image(s) + sidecars.`);
    });
  }, [entries, setRequeueStatus]);

  const archiveThenPurgeRest = useCallback(() => {
    if (archiveBusyRef.current) {
      setRequeueStatus('Archive & purge already running — wait for the ZIP download.');
      return;
    }
    const characters = loadCharacters();
    const { protected: kept, purgeable } = partitionGalleryForArchivePurge(entries, characters);
    if (purgeable.length === 0) {
      setRequeueStatus(
        kept.length > 0
          ? `Nothing to purge — ${kept.length} keeper(s) / Cast look plate(s) stay.`
          : 'Gallery is empty.'
      );
      return;
    }
    if (
      !window.confirm(
        `Archive ${purgeable.length} entr${purgeable.length === 1 ? 'y' : 'ies'} to a single ZIP on the server, download it, then remove them?\n\nFavorites, 4–5★, Cast look plates, and look keepers stay (${kept.length} kept).\n\nIf the ZIP is already saved, use “Purge rest” or “Finish purge” instead.`
      )
    ) {
      return;
    }
    setRequeueStatus(`Starting archive of ${purgeable.length}…`);
    runArchiveFlow(() =>
      import('@/lib/gallery-archive-purge').then(({ archiveThenPurgeGalleryEntries }) =>
        archiveThenPurgeGalleryEntries(entries, {
          removeEntries,
          characters,
          onProgress: progress => {
            setRequeueStatus(progress.message);
          },
        })
      )
    );
  }, [entries, removeEntries, runArchiveFlow, setRequeueStatus]);

  const purgeRestOnly = useCallback(() => {
    if (archiveBusyRef.current) {
      setRequeueStatus('Archive still running — wait, or stay on this tab.');
      return;
    }
    const characters = loadCharacters();
    const { protected: kept, purgeable } = partitionGalleryForArchivePurge(entries, characters);
    if (purgeable.length === 0) {
      setRequeueStatus(
        kept.length > 0
          ? `Nothing to purge — ${kept.length} keeper(s) / Cast look plate(s) stay.`
          : 'Gallery is empty.'
      );
      return;
    }
    if (
      !window.confirm(
        `Purge ${purgeable.length} entr${purgeable.length === 1 ? 'y' : 'ies'} now WITHOUT creating a new archive?\n\nOnly do this if you already have the ZIP (or accept losing those files).\n\nFavorites, 4–5★, Cast look plates, and look keepers stay (${kept.length} kept).`
      )
    ) {
      return;
    }
    void import('@/lib/gallery-archive-purge').then(({ purgeGalleryRestOnly }) => {
      const result = purgeGalleryRestOnly(entries, { removeEntries, characters });
      setRequeueStatus(result.message);
    });
  }, [entries, removeEntries, setRequeueStatus]);

  const finishPendingArchivePurge = useCallback(() => {
    if (archiveBusyRef.current) {
      setRequeueStatus('Archive still running — wait for it to finish.');
      return;
    }
    if (
      !window.confirm(
        'Finish purge for the latest completed server archive?\n\nThis uses the ZIP already on the server — it will not re-fetch thousands of images.'
      )
    ) {
      return;
    }
    const skipDownload = window.confirm(
      'Skip downloading the ZIP again?\n\nOK = purge only (you already saved the ZIP).\nCancel = download the ZIP once more, then purge.'
    );
    setRequeueStatus(
      skipDownload
        ? 'Finishing purge (ZIP download skipped)…'
        : 'Finishing purge — downloading ZIP…'
    );
    runArchiveFlow(() =>
      import('@/lib/gallery-archive-purge').then(({ resumePendingArchivePurge }) =>
        resumePendingArchivePurge({
          removeEntries,
          remainingEntryIds: entries.map(entry => entry.id),
          skipDownload,
          onProgress: progress => {
            setRequeueStatus(progress.message);
          },
        }).then(result => {
          if (!result) {
            return {
              message:
                'No completed archive job to finish. Use Archive & purge first, or Purge rest if you already have a ZIP.',
            };
          }
          return result;
        })
      )
    );
  }, [entries, removeEntries, runArchiveFlow, setRequeueStatus]);

  return {
    retryFailedEntries,
    exportCapKeepers,
    archiveThenPurgeRest,
    purgeRestOnly,
    finishPendingArchivePurge,
  };
}
