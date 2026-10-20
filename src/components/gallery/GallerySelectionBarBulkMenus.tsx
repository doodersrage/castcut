'use client';

import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import type { ParamExperimentAxis } from '@/lib/param-experiment-queue';
import { ActionMenu, MenuItem } from '@/components/gallery/GallerySelectionBarMenus';

type QueueCapabilities = {
  canUpscale: boolean;
  canUpscaleFinal: boolean;
  canUpscaleMax: boolean;
  canRefine: boolean;
  canMoire: boolean;
  canMoireFinal: boolean;
  canMoireMax: boolean;
  allRapid: boolean;
  allLightning: boolean;
};

type GallerySelectionBarBulkMenusProps = {
  selectedCount: number;
  selectedEntries: ComfyGalleryEntry[];
  lean?: boolean;
  compareReady: boolean;
  stitchReady: boolean;
  stitchableCount: number;
  queueCapabilities: QueueCapabilities;
  upscaleFinalLabel: string;
  upscaleMaxLabel: string;
  paramAxis: ParamExperimentAxis;
  singleSelected: boolean;
  similarSearchActive: boolean;
  canClearSimilar: boolean;
  customGroups?: string[];
  groupDraft: string;
  onGroupDraftChange: (value: string) => void;
  projects: import('@/lib/prompt-projects').PromptProject[];
  onExportSidecars: () => void;
  onDownloadImages: () => void;
  onExportZip: () => void;
  onExportLoraDataset: () => void;
  onExportCsv: () => void;
  onExportJsonl: () => void;
  onExportCompareJson: () => void;
  onExportCompareHtml: () => void;
  onStitchVideos: () => void;
  onBulkUpscaleFinal: () => void;
  onBulkUpscaleMax: () => void;
  onBulkRefine: () => void;
  onBulkMoireCleanFinal: () => void;
  onBulkMoireCleanMax: () => void;
  onBulkRequeue: () => void;
  onSeedExperiment: () => void;
  onParamExperiment: () => void;
  onParamGrid: () => void;
  onMutateWinner: () => void;
  onNegativeAb: () => void;
  onVariations: () => void;
  onTopics: () => void;
  onFindSimilar: () => void;
  onFindVisualSimilar?: () => void;
  onClearSimilar: () => void;
  onFavorite: (favorite: boolean) => void;
  onRate: (rating: NonNullable<ComfyGalleryEntry['reviewRating']>) => void;
  onAssignCustomGroup?: (groupName: string) => void;
  onClearCustomGroup?: () => void;
  onRenameCustomGroup?: (from: string, to: string) => void;
  onDeleteCustomGroup?: (name: string) => void;
  onAssignActiveProject: () => void;
  onAssignProject: (projectId: string) => void;
  onApplyUserTag?: (tag: string) => void;
};

export default function GallerySelectionBarBulkMenus(props: GallerySelectionBarBulkMenusProps) {
  const {
    selectedCount,
    selectedEntries,
    lean,
    compareReady,
    stitchReady,
    stitchableCount,
    queueCapabilities,
    upscaleFinalLabel,
    upscaleMaxLabel,
    paramAxis,
    singleSelected,
    canClearSimilar,
    customGroups,
    groupDraft,
    onGroupDraftChange,
    projects,
  } = props;

  return (
    <>
      <ActionMenu label="Export" disabled={selectedCount === 0}>
        <MenuItem
          label={
            stitchReady
              ? `Stitch clips into one video (${stitchableCount})`
              : 'Stitch clips into one video'
          }
          disabled={!stitchReady}
          onClick={props.onStitchVideos}
        />
        <MenuItem label="Sidecars" onClick={props.onExportSidecars} />
        <MenuItem label="Images" onClick={props.onDownloadImages} />
        {!lean ? <MenuItem label="ZIP bundle" onClick={props.onExportZip} /> : null}
        {!lean ? (
          <MenuItem label="Export LoRA dataset" onClick={props.onExportLoraDataset} />
        ) : null}
        {!lean ? <MenuItem label="CSV" onClick={props.onExportCsv} /> : null}
        {!lean ? <MenuItem label="JSONL" onClick={props.onExportJsonl} /> : null}
        {!lean ? (
          <>
            <MenuItem
              label="Compare JSON"
              disabled={!compareReady}
              onClick={props.onExportCompareJson}
            />
            <MenuItem
              label="Compare HTML"
              disabled={!compareReady}
              onClick={props.onExportCompareHtml}
            />
          </>
        ) : null}
      </ActionMenu>

      <ActionMenu label="Queue" disabled={selectedCount === 0}>
        {queueCapabilities.canUpscale || queueCapabilities.canMoire ? (
          <>
            <MenuItem
              label={upscaleFinalLabel}
              disabled={
                queueCapabilities.allRapid
                  ? !queueCapabilities.canMoireFinal
                  : !queueCapabilities.canUpscaleFinal
              }
              onClick={
                queueCapabilities.allRapid ? props.onBulkMoireCleanFinal : props.onBulkUpscaleFinal
              }
            />
            <MenuItem
              label={upscaleMaxLabel}
              disabled={
                queueCapabilities.allRapid
                  ? !queueCapabilities.canMoireMax
                  : !queueCapabilities.canUpscaleMax
              }
              onClick={
                queueCapabilities.allRapid ? props.onBulkMoireCleanMax : props.onBulkUpscaleMax
              }
            />
          </>
        ) : null}
        {queueCapabilities.canRefine ? (
          <MenuItem label="Bulk refine → low-denoise second pass" onClick={props.onBulkRefine} />
        ) : null}
        {queueCapabilities.canMoire && !queueCapabilities.allRapid ? (
          <>
            <MenuItem
              label="Bulk Flux polish → Final (blur only)"
              onClick={props.onBulkMoireCleanFinal}
            />
            <MenuItem
              label="Bulk Flux polish → Max (blur + resample)"
              onClick={props.onBulkMoireCleanMax}
            />
          </>
        ) : null}
        {queueCapabilities.allLightning ? (
          <MenuItem
            label="Bulk variation → Lightning (new seeds + Final quality)"
            onClick={props.onBulkRequeue}
          />
        ) : (
          <MenuItem label="Bulk new variation (randomized seeds)" onClick={props.onBulkRequeue} />
        )}
        {!lean ? (
          <>
            <MenuItem
              label="Seed experiment → perturb seed"
              onClick={props.onSeedExperiment}
              disabled={!singleSelected}
            />
            <MenuItem
              label={`Param experiment → sweep ${paramAxis}`}
              onClick={props.onParamExperiment}
              disabled={!singleSelected}
            />
            <MenuItem
              label="Param grid (CFG×steps) → matrix"
              onClick={props.onParamGrid}
              disabled={!singleSelected}
            />
            <MenuItem
              label="Mutate crowned winner → text diff prompt"
              onClick={props.onMutateWinner}
              disabled={!singleSelected}
            />
            <MenuItem
              label="Negative A/B → toggle prompt"
              onClick={props.onNegativeAb}
              disabled={!singleSelected}
            />
          </>
        ) : null}
      </ActionMenu>

      {!lean ? (
        <ActionMenu label="Send" disabled={!singleSelected}>
          <MenuItem label="Open in Variations" onClick={props.onVariations} />
          <MenuItem label="Open in Topics" onClick={props.onTopics} />
          <MenuItem label="Find similar" onClick={props.onFindSimilar} />
          {props.onFindVisualSimilar ? (
            <MenuItem label="Looks like this" onClick={props.onFindVisualSimilar} />
          ) : null}
          {canClearSimilar ? (
            <MenuItem label="Clear similar filter" onClick={props.onClearSimilar} />
          ) : null}
        </ActionMenu>
      ) : null}

      <ActionMenu label="Collect">
        <MenuItem label="Favorite" onClick={() => props.onFavorite(true)} />
        <MenuItem label="Unfavorite" onClick={() => props.onFavorite(false)} />
        {[5, 4, 3, 2, 1].map(rating => (
          <MenuItem
            key={rating}
            label={`Rate ${rating}★`}
            onClick={() => props.onRate(rating as NonNullable<ComfyGalleryEntry['reviewRating']>)}
          />
        ))}
      </ActionMenu>

      {props.onAssignCustomGroup ? (
        <ActionMenu label="Group">
          <form
            className="flex flex-col gap-1 px-2 py-2"
            onSubmit={event => {
              event.preventDefault();
              const name = groupDraft.trim();
              if (!name) {
                return;
              }
              props.onAssignCustomGroup?.(name);
              onGroupDraftChange('');
            }}
          >
            <input
              value={groupDraft}
              onChange={event => onGroupDraftChange(event.target.value)}
              placeholder="New group name"
              aria-label="Gallery group name"
              data-testid="gallery-group-name-input"
              maxLength={80}
              className="ui-input w-full px-2 py-1 text-[11px]"
            />
            <button
              type="submit"
              disabled={!groupDraft.trim()}
              data-testid="gallery-group-assign"
              className="ui-menu-item rounded-xl border-[var(--border-subtle)]/60 bg-[var(--bg-elevated)] text-[11px] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] hover:text-[var(--accent-text)] disabled:opacity-40"
            >
              Assign to group
            </button>
          </form>
          {(customGroups ?? []).slice(0, 12).map(name => (
            <MenuItem
              key={`group-${name}`}
              label={name}
              onClick={() => props.onAssignCustomGroup?.(name)}
            />
          ))}
          {props.onClearCustomGroup ? (
            <MenuItem
              label="Remove from group"
              disabled={!selectedEntries.some(entry => Boolean(entry.customGroup?.trim()))}
              onClick={props.onClearCustomGroup}
            />
          ) : null}
          {props.onRenameCustomGroup && (customGroups?.length ?? 0) > 0 ? (
            <MenuItem
              label="Rename group…"
              onClick={() => {
                const from =
                  selectedEntries.find(entry => entry.customGroup?.trim())?.customGroup ??
                  customGroups?.[0];
                if (!from) {
                  return;
                }
                const next = window.prompt(`Rename group “${from}”`, from);
                if (next?.trim() && next.trim() !== from) {
                  props.onRenameCustomGroup?.(from, next.trim());
                }
              }}
            />
          ) : null}
          {props.onDeleteCustomGroup && (customGroups?.length ?? 0) > 0 ? (
            <MenuItem
              label="Delete group…"
              onClick={() => {
                const name =
                  selectedEntries.find(entry => entry.customGroup?.trim())?.customGroup ??
                  customGroups?.[0];
                if (!name) {
                  return;
                }
                if (
                  window.confirm(
                    `Remove group “${name}” from all gallery items? Files stay; only the label is cleared.`
                  )
                ) {
                  props.onDeleteCustomGroup?.(name);
                }
              }}
            />
          ) : null}
        </ActionMenu>
      ) : null}

      <ActionMenu label="Project">
        <MenuItem label="Assign active project" onClick={props.onAssignActiveProject} />
        {projects.map(project => (
          <MenuItem
            key={project.id}
            label={project.name}
            onClick={() => props.onAssignProject(project.id)}
          />
        ))}
        {!lean && props.onApplyUserTag ? (
          <MenuItem
            label="Add tag…"
            onClick={() => {
              const tag = window.prompt('Tag to apply to selected stills');
              if (tag?.trim()) {
                props.onApplyUserTag?.(tag.trim());
              }
            }}
          />
        ) : null}
      </ActionMenu>
    </>
  );
}
