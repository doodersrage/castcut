'use client';

import dynamic from 'next/dynamic';
import LoraDatasetExportDialog from '@/components/LoraDatasetExportDialog';
import GalleryPoseDialogHost from '@/components/gallery/GalleryPoseDialog';
import type { GalleryComparePanelProps } from '@/components/GalleryComparePanel';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import type { LoraDatasetExportUiOptions } from '@/lib/lora-dataset-export-ui';

const GalleryCompareModal = dynamic(() => import('@/components/gallery/GalleryCompareModal'), {
  loading: () => null,
});

const GalleryWorkflowModal = dynamic(() => import('@/components/gallery/GalleryWorkflowModal'), {
  loading: () => null,
});

type GalleryPanelModalsSlotProps = {
  compareOpen: boolean;
  selectedEntries: ComfyGalleryEntry[];
  compareHandlers: Omit<GalleryComparePanelProps, 'entries' | 'open' | 'onClose' | 'onOpenPreview'>;
  onCompareClose: () => void;
  onOpenPreviewFromCompare: (entry: ComfyGalleryEntry) => void;
  workflowEntry: ComfyGalleryEntry | null;
  onWorkflowClose: () => void;
  loraExportOpen: boolean;
  loraExportScope: 'favorites' | 'selected';
  selectedEntriesForExport: ComfyGalleryEntry[];
  allEntries: ComfyGalleryEntry[];
  onLoraExportCancel: () => void;
  onLoraExportConfirm: (options: LoraDatasetExportUiOptions) => void;
};

export default function GalleryPanelModalsSlot({
  compareOpen,
  selectedEntries,
  compareHandlers,
  onCompareClose,
  onOpenPreviewFromCompare,
  workflowEntry,
  onWorkflowClose,
  loraExportOpen,
  onLoraExportCancel,
  onLoraExportConfirm,
}: GalleryPanelModalsSlotProps) {
  return (
    <>
      {compareOpen ? (
        <GalleryCompareModal
          open={compareOpen}
          entries={selectedEntries}
          onClose={onCompareClose}
          onOpenPreview={onOpenPreviewFromCompare}
          {...compareHandlers}
        />
      ) : null}

      {workflowEntry ? (
        <GalleryWorkflowModal entry={workflowEntry} onClose={onWorkflowClose} />
      ) : null}

      <GalleryPoseDialogHost />

      <LoraDatasetExportDialog
        open={loraExportOpen}
        onCancel={onLoraExportCancel}
        onConfirm={onLoraExportConfirm}
      />
    </>
  );
}
