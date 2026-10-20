'use client';

import { useCallback } from 'react';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import type { LoraDatasetExportUiOptions } from '@/lib/lora/dataset-export-ui';

type UseGalleryLoraExportConfirmOptions = {
  loraExportScope: 'favorites' | 'selected';
  selectedEntries: ComfyGalleryEntry[];
  entries: ComfyGalleryEntry[];
  setLoraExportOpen: (open: boolean) => void;
  setRequeueStatus: (status: string | null) => void;
};

export function useGalleryLoraExportConfirm({
  loraExportScope,
  selectedEntries,
  entries,
  setLoraExportOpen,
  setRequeueStatus,
}: UseGalleryLoraExportConfirmOptions) {
  const onLoraExportCancel = useCallback(() => {
    setLoraExportOpen(false);
  }, [setLoraExportOpen]);

  const onLoraExportConfirm = useCallback(
    (options: LoraDatasetExportUiOptions) => {
      setLoraExportOpen(false);
      setRequeueStatus('Building LoRA dataset export…');
      void import('@/lib/gallery/lora-dataset-export')
        .then(({ downloadAndPersistLoraDataset, selectLoraDatasetEntries }) => {
          const source = loraExportScope === 'selected' ? selectedEntries : entries;
          return downloadAndPersistLoraDataset(
            selectLoraDatasetEntries(
              source,
              loraExportScope === 'selected'
                ? { selectedIds: selectedEntries.map(entry => entry.id) }
                : undefined
            ),
            options
          );
        })
        .then(({ count, datasetPath }) => {
          if (count <= 0) {
            setRequeueStatus(
              loraExportScope === 'selected'
                ? 'No eligible images found for the LoRA dataset export.'
                : 'No favorited or 4–5★ entries found for the LoRA dataset export.'
            );
            return;
          }
          setRequeueStatus(
            datasetPath
              ? `LoRA dataset exported (${count} pairs, ${options.captionMode}) — on disk for train + ZIP downloaded.`
              : `LoRA dataset exported (${count} image/caption pairs, ${options.captionMode}).`
          );
        });
    },
    [entries, loraExportScope, selectedEntries, setLoraExportOpen, setRequeueStatus]
  );

  return { onLoraExportCancel, onLoraExportConfirm };
}
