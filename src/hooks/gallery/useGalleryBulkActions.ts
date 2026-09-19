'use client';

import { useMemo, useRef } from 'react';
import { toastBulkQueueSummary } from '@/lib/app-toast';
import { loadActiveProjectId } from '@/lib/prompt-projects';
import {
  exportGalleryCsv,
  exportGalleryJsonl,
  downloadTextFile,
} from '@/lib/history-export-formats';
import {
  downloadGalleryImagesSequential,
  downloadGallerySidecarBundle,
} from '@/lib/comfyui-gallery-export';
import { resolveRequeueImageUrlsFromEntry } from '@/lib/queue-requeue-images';
import type {
  GalleryBulkExperimentHandlers,
  UseGalleryPanelActionsInput,
} from '@/hooks/gallery/gallery-panel-actions-types';
import { useGalleryExperimentActions } from '@/hooks/gallery/useGalleryExperimentActions';

const loadGalleryRequeue = () => import('@/lib/comfyui-requeue');

export type UseGalleryBulkActionsInput = Pick<
  UseGalleryPanelActionsInput,
  | 'setRequeueStatus'
  | 'setFilter'
  | 'selectedIds'
  | 'selectedEntries'
  | 'setSelectedIds'
  | 'setProjectIds'
  | 'removeEntries'
  | 'setFavorites'
  | 'setReviewRatings'
  | 'setUserTags'
  | 'setCustomGroups'
  | 'renameCustomGroup'
  | 'deleteCustomGroup'
  | 'customGroups'
  | 'paramAxis'
  | 'filter'
  | 'setLoraExportScope'
  | 'setLoraExportOpen'
  | 'router'
>;

export function useGalleryBulkActions({
  setRequeueStatus,
  setFilter,
  selectedIds,
  selectedEntries,
  setSelectedIds,
  setProjectIds,
  removeEntries,
  setFavorites,
  setReviewRatings,
  setUserTags,
  setCustomGroups,
  renameCustomGroup,
  deleteCustomGroup,
  customGroups = [],
  paramAxis,
  filter,
  setLoraExportScope,
  setLoraExportOpen,
  router,
}: UseGalleryBulkActionsInput): GalleryBulkExperimentHandlers {
  const stitchBusyRef = useRef(false);
  const experimentHandlers = useGalleryExperimentActions({
    selectedEntries,
    paramAxis,
    setRequeueStatus,
    router,
  });

  return useMemo<GalleryBulkExperimentHandlers>(
    () => ({
      onAssignActiveProject: () => {
        const projectId = loadActiveProjectId();
        if (!projectId) {
          setRequeueStatus('Set an active project in Studio first.');
          return;
        }
        setProjectIds(selectedIds, projectId);
        setRequeueStatus(`Assigned ${selectedIds.length} entries to active project.`);
      },
      onAssignProject: projectId => {
        setProjectIds(selectedIds, projectId);
        setRequeueStatus(`Assigned ${selectedIds.length} entries.`);
      },
      onFavorite: favorite => setFavorites(selectedIds, favorite),
      onRate: rating => {
        setReviewRatings(selectedIds, rating);
        setRequeueStatus(`Rated ${selectedIds.length} selected ${rating}★.`);
      },
      onDelete: () => {
        const count = selectedIds.length;
        if (
          !window.confirm(
            `Remove ${count} selected ${count === 1 ? 'entry' : 'entries'} from the gallery?`
          )
        ) {
          return;
        }
        removeEntries(selectedIds);
        setSelectedIds([]);
        setRequeueStatus(`Removed ${count} ${count === 1 ? 'entry' : 'entries'}.`);
      },
      onExportSidecars: () => {
        downloadGallerySidecarBundle(selectedEntries);
        setRequeueStatus(`Exported ${selectedEntries.length} sidecar(s).`);
      },
      onDownloadImages: () => {
        setRequeueStatus('Downloading selected images…');
        void downloadGalleryImagesSequential(selectedEntries).then(count => {
          setRequeueStatus(`Downloaded ${count} image(s).`);
        });
      },
      onExportZip: () => {
        setRequeueStatus('Building ZIP export…');
        void import('@/lib/gallery-zip-export')
          .then(({ downloadGalleryZipBundle }) => downloadGalleryZipBundle(selectedEntries))
          .then(zip => {
            setRequeueStatus(
              `ZIP export prepared for ${zip.entryCount} entries (${zip.imageCount} image${zip.imageCount === 1 ? '' : 's'}).`
            );
          });
      },
      onStitchVideos: () => {
        if (stitchBusyRef.current) {
          return;
        }
        stitchBusyRef.current = true;
        setRequeueStatus('Stitching selected clips…');
        void import('@/lib/character-film-assemble')
          .then(({ stitchSelectedGalleryVideos }) =>
            stitchSelectedGalleryVideos({
              entries: selectedEntries,
              onProgress: progress => setRequeueStatus(progress.label),
            })
          )
          .then(result => {
            setRequeueStatus(
              result.persisted
                ? `Stitched ${result.clipCount} clips into ${result.filename} (${result.encodePath} encode) and saved to gallery.`
                : `Downloaded ${result.filename} (${result.encodePath} encode). Studio storage could not keep a copy.`
            );
          })
          .catch(error => {
            setRequeueStatus(
              error instanceof Error ? error.message : 'Could not stitch those clips.'
            );
          })
          .finally(() => {
            stitchBusyRef.current = false;
          });
      },
      onExportLoraDataset: () => {
        setLoraExportScope('selected');
        setLoraExportOpen(true);
      },
      onExportCompareJson: () => {
        void import('@/lib/gallery-compare-export').then(({ downloadCompareExport }) =>
          downloadCompareExport(selectedEntries.slice(0, 4), 'json')
        );
      },
      onExportCompareHtml: () => {
        void import('@/lib/gallery-compare-export').then(({ downloadCompareExport }) =>
          downloadCompareExport(selectedEntries.slice(0, 4), 'html')
        );
      },
      onFindSimilar: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        setFilter(previous => ({
          ...previous,
          similarToEntryId: entry.id,
          similarMode: 'prompt',
          query: undefined,
        }));
        setRequeueStatus(`Finding outputs similar to ${entry.model ?? 'selection'}…`);
      },
      onFindVisualSimilar: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        setFilter(previous => ({
          ...previous,
          similarToEntryId: entry.id,
          similarMode: 'visual',
          query: undefined,
        }));
        setRequeueStatus(`Finding stills that look like ${entry.model ?? 'selection'}…`);
      },
      onClearSimilar: () =>
        setFilter(previous => ({
          ...previous,
          similarToEntryId: undefined,
          similarMode: undefined,
        })),
      canClearSimilar: Boolean(filter.similarToEntryId),
      onApplyUserTag: (tag: string) => {
        if (!setUserTags || selectedIds.length === 0) {
          return;
        }
        setUserTags(selectedIds, [tag], 'add');
        setRequeueStatus(`Tagged ${selectedIds.length} with #${tag}`);
      },
      customGroups,
      onAssignCustomGroup: (groupName: string) => {
        if (!setCustomGroups || selectedIds.length === 0) {
          return;
        }
        setCustomGroups(selectedIds, groupName);
        setRequeueStatus(`Grouped ${selectedIds.length} as ${groupName.trim()}`);
      },
      onClearCustomGroup: () => {
        if (!setCustomGroups || selectedIds.length === 0) {
          return;
        }
        setCustomGroups(selectedIds, undefined);
        setRequeueStatus(`Removed ${selectedIds.length} from group`);
      },
      onRenameCustomGroup: (from: string, to: string) => {
        if (!renameCustomGroup) {
          return;
        }
        const changed = renameCustomGroup(from, to);
        if (changed > 0) {
          setRequeueStatus(`Renamed group to ${to.trim()} (${changed} items)`);
        }
      },
      onDeleteCustomGroup: (name: string) => {
        if (!deleteCustomGroup) {
          return;
        }
        const changed = deleteCustomGroup(name);
        if (changed > 0) {
          setRequeueStatus(`Cleared group “${name}” from ${changed} items`);
        }
      },
      ...experimentHandlers,
      onExportCsv: () => {
        downloadTextFile(
          exportGalleryCsv(selectedEntries),
          'gallery-export.csv',
          'text/csv;charset=utf-8'
        );
      },
      onExportJsonl: () => {
        downloadTextFile(
          exportGalleryJsonl(selectedEntries),
          'gallery-export.jsonl',
          'application/jsonl;charset=utf-8'
        );
      },
      onBulkRequeue: () => {
        setRequeueStatus('Bulk variation queue started…');
        void loadGalleryRequeue()
          .then(({ requeueComfyJobs }) =>
            requeueComfyJobs(
              selectedEntries.map(entry => {
                const urls = resolveRequeueImageUrlsFromEntry(entry);
                return {
                  prompt: entry.prompt,
                  negativePrompt: entry.negativePrompt,
                  tool: entry.tool,
                  model: entry.model,
                  queueParams: entry.queueParams,
                  sourceImageUrl: urls.sourceImageUrl,
                  maskImageUrl: urls.maskImageUrl,
                  newSeed: true,
                  parentGalleryEntryId: entry.id,
                  derivedKind: 'variation' as const,
                };
              }),
              setRequeueStatus
            )
          )
          .then(({ queued, failed }) => {
            setSelectedIds([]);
            toastBulkQueueSummary({
              label: 'Bulk variation queue finished',
              queued,
              failed,
            });
          });
      },
      onBulkUpscaleFinal: () => {
        setRequeueStatus('Bulk upscale (Final) started…');
        void loadGalleryRequeue()
          .then(({ bulkUpscaleGalleryEntries }) =>
            bulkUpscaleGalleryEntries(selectedEntries, 'final', setRequeueStatus)
          )
          .then(({ queued, failed, skipped }) => {
            setSelectedIds([]);
            toastBulkQueueSummary({
              label: 'Bulk upscale (Final) finished',
              queued,
              failed,
              skipped,
            });
          });
      },
      onBulkUpscaleMax: () => {
        setRequeueStatus('Bulk upscale (Max) started…');
        void loadGalleryRequeue()
          .then(({ bulkUpscaleGalleryEntries }) =>
            bulkUpscaleGalleryEntries(selectedEntries, 'max', setRequeueStatus)
          )
          .then(({ queued, failed, skipped }) => {
            setSelectedIds([]);
            toastBulkQueueSummary({
              label: 'Bulk upscale (Max) finished',
              queued,
              failed,
              skipped,
            });
          });
      },
      onBulkRefine: () => {
        setRequeueStatus('Bulk refine (Final) started…');
        void loadGalleryRequeue()
          .then(({ bulkRefineGalleryEntries }) =>
            bulkRefineGalleryEntries(selectedEntries, 'final', setRequeueStatus)
          )
          .then(({ queued, failed, skipped }) => {
            setSelectedIds([]);
            toastBulkQueueSummary({
              label: 'Bulk refine finished',
              queued,
              failed,
              skipped,
            });
          });
      },
      onBulkMoireCleanFinal: () => {
        setRequeueStatus('Bulk moiré clean (Final) started…');
        void loadGalleryRequeue()
          .then(({ bulkMoireCleanGalleryEntries }) =>
            bulkMoireCleanGalleryEntries(selectedEntries, 'final', setRequeueStatus)
          )
          .then(({ queued, failed, skipped }) => {
            setSelectedIds([]);
            toastBulkQueueSummary({
              label: 'Bulk moiré clean (Final) finished',
              queued,
              failed,
              skipped,
            });
          });
      },
      onBulkMoireCleanMax: () => {
        setRequeueStatus('Bulk moiré clean (Max) started…');
        void loadGalleryRequeue()
          .then(({ bulkMoireCleanGalleryEntries }) =>
            bulkMoireCleanGalleryEntries(selectedEntries, 'max', setRequeueStatus)
          )
          .then(({ queued, failed, skipped }) => {
            setSelectedIds([]);
            toastBulkQueueSummary({
              label: 'Bulk moiré clean (Max) finished',
              queued,
              failed,
              skipped,
            });
          });
      },
    }),
    [
      customGroups,
      deleteCustomGroup,
      experimentHandlers,
      filter.similarToEntryId,
      removeEntries,
      renameCustomGroup,
      selectedEntries,
      selectedIds,
      setCustomGroups,
      setFavorites,
      setFilter,
      setLoraExportOpen,
      setLoraExportScope,
      setProjectIds,
      setRequeueStatus,
      setReviewRatings,
      setSelectedIds,
      setUserTags,
    ]
  );
}
