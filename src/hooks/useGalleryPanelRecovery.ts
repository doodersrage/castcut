'use client';

import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { GALLERY_CAP_KEEPER_MIN_RATING } from '@/lib/gallery-cap';
import {
  downloadGalleryImagesSequential,
  downloadGallerySidecarBundle,
} from '@/lib/comfyui-gallery-export';
import { toastBulkQueueSummary } from '@/lib/app-toast';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { loadCharacters } from '@/lib/character-os';
import { ARCHIVE_PURGE_BATCH_SIZE } from '@/lib/gallery-archive-purge';
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
};

export function useGalleryPanelRecovery({
  entries,
  setRequeueStatus,
  removeEntries,
}: UseGalleryPanelRecoveryOptions): UseGalleryPanelRecoveryResult {
  const archiveBusyRef = useRef(false);

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
      setRequeueStatus('Archive & purge already running — let the ZIP downloads finish.');
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
    const zipParts = Math.max(1, Math.ceil(purgeable.length / ARCHIVE_PURGE_BATCH_SIZE));
    const largeHint =
      purgeable.length > ARCHIVE_PURGE_BATCH_SIZE
        ? `\n\nLarge gallery: this downloads ${zipParts} ZIP parts (~${ARCHIVE_PURGE_BATCH_SIZE} entries each). Stay on this tab — do not refresh.`
        : '';
    if (
      !window.confirm(
        `Download a ZIP of ${purgeable.length} entr${purgeable.length === 1 ? 'y' : 'ies'}, then remove them from this device?\n\nFavorites, 4–5★, Cast look plates, and look keepers stay (${kept.length} kept).${largeHint}`
      )
    ) {
      return;
    }
    archiveBusyRef.current = true;
    setRequeueStatus(
      `Archiving ${purgeable.length} entr${purgeable.length === 1 ? 'y' : 'ies'}${
        zipParts > 1 ? ` in ${zipParts} ZIP parts` : ''
      }…`
    );
    void import('@/lib/gallery-archive-purge')
      .then(({ archiveThenPurgeGalleryEntries }) =>
        archiveThenPurgeGalleryEntries(entries, {
          removeEntries,
          characters,
          onProgress: progress => {
            if (progress.phase === 'purge') {
              setRequeueStatus(`Purging ${progress.purgeableTotal} archived entries…`);
              return;
            }
            setRequeueStatus(
              `Archiving ZIP ${progress.batchIndex}/${progress.batchCount} (${progress.archivedSoFar}/${progress.purgeableTotal} ready)…`
            );
          },
        })
      )
      .then(result => {
        setRequeueStatus(result.message);
      })
      .catch(() => {
        setRequeueStatus('Archive & purge failed — nothing was deleted.');
      })
      .finally(() => {
        archiveBusyRef.current = false;
      });
  }, [entries, removeEntries, setRequeueStatus]);

  return {
    retryFailedEntries,
    exportCapKeepers,
    archiveThenPurgeRest,
  };
}
