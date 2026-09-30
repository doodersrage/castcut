'use client';

import { memo, type ReactNode } from 'react';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import type { ParamExperimentAxis } from '@/lib/param-experiment-queue';
import GallerySelectionBar from '@/components/gallery/GallerySelectionBar';
import type { PromptProject } from '@/lib/prompt-projects';

export type GalleryExperimentPanelProps = {
  selectedCount: number;
  selectedEntries: ComfyGalleryEntry[];
  projects: PromptProject[];
  paramAxis: ParamExperimentAxis;
  setParamAxis: (axis: ParamExperimentAxis) => void;
  similarSearchActive: boolean;
  lean?: boolean;
  onClearSelection: () => void;
  onCompare: () => void;
  onAssignActiveProject: () => void;
  onAssignProject: (projectId: string) => void;
  onFavorite: (favorite: boolean) => void;
  onRate: (rating: NonNullable<ComfyGalleryEntry['reviewRating']>) => void;
  onDelete: () => void;
  onExportSidecars: () => void;
  onDownloadImages: () => void;
  onExportZip: () => void;
  onStitchVideos: () => void;
  onExportLoraDataset: () => void;
  onExportCompareJson: () => void;
  onExportCompareHtml: () => void;
  onFindSimilar: () => void;
  onFindVisualSimilar?: () => void;
  onClearSimilar: () => void;
  canClearSimilar: boolean;
  onApplyUserTag?: (tag: string) => void;
  customGroups?: string[];
  onAssignCustomGroup?: (groupName: string) => void;
  onClearCustomGroup?: () => void;
  onRenameCustomGroup?: (from: string, to: string) => void;
  onDeleteCustomGroup?: (name: string) => void;
  onSeedExperiment: () => void;
  onParamExperiment: () => void;
  onParamGrid: () => void;
  onMutateWinner: () => void;
  onVariations: () => void;
  onTopics: () => void;
  onNegativeAb: () => void;
  onExportCsv: () => void;
  onExportJsonl: () => void;
  onBulkRequeue: () => void;
  onBulkUpscaleFinal: () => void;
  onBulkUpscaleMax: () => void;
  onBulkRefine: () => void;
  onBulkMoireCleanFinal: () => void;
  onBulkMoireCleanMax: () => void;
  footer?: ReactNode;
};

function GalleryExperimentPanelInner(props: GalleryExperimentPanelProps) {
  const { footer, ...barProps } = props;
  return (
    // Sticky here, not only on the bar: a sticky child of a 47px wrapper never stuck, so the
    // bulk actions scrolled away while picking cards further down.
    <div className="sticky top-[calc(var(--header-offset,0px)+0.5rem)] z-20 space-y-3">
      <GallerySelectionBar {...barProps} />
      {footer}
    </div>
  );
}

export default memo(GalleryExperimentPanelInner);
