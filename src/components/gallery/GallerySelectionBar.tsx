'use client';

import { useMemo, useState } from 'react';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import type { PromptProject } from '@/lib/prompt-projects';
import type { ParamExperimentAxis } from '@/lib/param-experiment-queue';
import {
  canUpscaleGalleryEntry,
  galleryEntryAlreadyEnrichedForUpscale,
  galleryEntrySupportsMoireClean,
  galleryEntrySupportsRefine,
} from '@/lib/gallery/entry-actions';
import { isQwenRapidAioModel } from '@/lib/model-denoise-defaults';
import { isQwenLightningModel } from '@/lib/workflow/model-sampling-patch';
import { countGalleryStitchableVideos } from '@/lib/gallery/video-stitch';
import GallerySelectionBarBulkMenus from '@/components/gallery/GallerySelectionBarBulkMenus';

export type GallerySelectionBarProps = {
  selectedCount: number;
  selectedEntries: ComfyGalleryEntry[];
  projects: PromptProject[];
  paramAxis: ParamExperimentAxis;
  setParamAxis: (axis: ParamExperimentAxis) => void;
  similarSearchActive: boolean;
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
  lean?: boolean;
};

export default function GallerySelectionBar(props: GallerySelectionBarProps) {
  const [groupDraft, setGroupDraft] = useState('');
  const queueCapabilities = useMemo(() => {
    const entries = props.selectedEntries;
    const canUpscaleFinal = entries.some(entry => canUpscaleGalleryEntry(entry, 'final'));
    const canUpscaleMax = entries.some(entry => canUpscaleGalleryEntry(entry, 'max'));
    const canUpscale = canUpscaleFinal || canUpscaleMax;
    const canRefine = entries.some(entry => galleryEntrySupportsRefine(entry.model));
    const canMoireFinal = entries.some(
      entry =>
        galleryEntrySupportsMoireClean(entry.model) &&
        entry.status === 'completed' &&
        !galleryEntryAlreadyEnrichedForUpscale(entry, 'final')
    );
    const canMoireMax = entries.some(
      entry =>
        galleryEntrySupportsMoireClean(entry.model) &&
        entry.status === 'completed' &&
        !galleryEntryAlreadyEnrichedForUpscale(entry, 'max')
    );
    const canMoire = canMoireFinal || canMoireMax;
    const allRapid = entries.length > 0 && entries.every(entry => isQwenRapidAioModel(entry.model));
    const allLightning =
      entries.length > 0 && entries.every(entry => isQwenLightningModel(entry.model));
    return {
      canUpscale,
      canUpscaleFinal,
      canUpscaleMax,
      canRefine,
      canMoire,
      canMoireFinal,
      canMoireMax,
      allRapid,
      allLightning,
    };
  }, [props.selectedEntries]);

  if (props.selectedCount === 0) {
    return null;
  }

  const singleSelected = props.selectedCount === 1;
  const compareReady = props.selectedCount >= 2 && props.selectedCount <= 4;
  const stitchableCount = countGalleryStitchableVideos(props.selectedEntries);
  const stitchReady = stitchableCount >= 2;
  const upscaleFinalLabel = queueCapabilities.allRapid
    ? 'Bulk Flux polish → Final'
    : 'Bulk upscale → Final (~1.25× Lanczos)';
  const upscaleMaxLabel = queueCapabilities.allRapid
    ? 'Bulk Flux polish → Max (blur + resample)'
    : 'Bulk upscale → Max (full pipeline)';

  const selectionClassName =
    props.selectedCount <= 3
      ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)] rounded-xl px-2.5 py-1 text-xs font-medium'
      : props.selectedCount <= 10
        ? 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)] rounded-xl px-2.5 py-1 text-xs font-medium'
        : 'border-[var(--border-default)]/70 bg-[var(--bg-elevated)] text-[var(--text-muted)] tabular-nums rounded-lg px-2.5 py-1 text-xs font-medium';

  return (
    <div className="ui-gallery-dock sticky top-[calc(var(--header-offset,0px)+0.5rem)] z-20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1 flex items-center gap-2 border-r border-[var(--border-subtle)] pr-3">
          <span className={selectionClassName}>{props.selectedCount} selected</span>
          <button
            type="button"
            onClick={props.onClearSelection}
            className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--bg-muted)] transition hover:bg-[var(--accent-muted)] hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] text-[var(--accent-text)]`}
          >
            Clear
          </button>
        </div>

        <button
          type="button"
          className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] transition hover:bg-[var(--tint-success-bg)] hover:border-[var(--tint-success-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-success-border)] text-[var(--tint-success-text)] disabled:!hidden`}
          disabled={!compareReady}
          onClick={props.onCompare}
        >
          Compare
        </button>

        <button
          type="button"
          className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] text-[var(--accent-text)] disabled:!hidden`}
          disabled={!stitchReady}
          title="Join selected clips end-to-end in oldest-to-newest order, including animated webp/gif. Re-encodes in the browser — does not run a video model."
          onClick={props.onStitchVideos}
        >
          {`Stitch clips (${stitchableCount})`}
        </button>

        <GallerySelectionBarBulkMenus
          {...props}
          groupDraft={groupDraft}
          onGroupDraftChange={setGroupDraft}
          compareReady={compareReady}
          stitchReady={stitchReady}
          stitchableCount={stitchableCount}
          queueCapabilities={queueCapabilities}
          upscaleFinalLabel={upscaleFinalLabel}
          upscaleMaxLabel={upscaleMaxLabel}
          singleSelected={singleSelected}
        />

        <button
          type="button"
          className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-danger-border)] text-[var(--tint-danger-text)]`}
          onClick={props.onDelete}
        >
          Remove selected
        </button>

        {!props.lean ? (
          <label className="ml-auto hidden items-center gap-1 text-[11px] text-[var(--text-muted)] sm:flex">
            Param axis
            <select
              value={props.paramAxis}
              onChange={event => props.setParamAxis(event.target.value as ParamExperimentAxis)}
              className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-2 py-1 text-[var(--text-secondary)]"
            >
              <option value="cfg">CFG</option>
              <option value="steps">Steps</option>
              <option value="width">Width</option>
              <option value="seed">Seed</option>
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}
