'use client';

import { Button } from '@/components/ui/Button';
import { storyboardHtml } from '@/lib/print/print-sheets';
import { openPrintSheet } from '@/lib/print/print-sheets-client';
import { contactSheetFrames } from '@/lib/gallery/contact-sheet';
import {
  galleryEntryPrimaryThumbUrl,
  galleryEntryPrimaryViewUrl,
} from '@/lib/gallery/comfyui-gallery';
import GalleryExperimentPanel from '@/components/gallery/GalleryExperimentPanel';
import type { GalleryBulkExperimentHandlers } from '@/hooks/useGalleryPanelActions';
import type { ComfyGalleryEntry, ComfyGalleryFilter } from '@/lib/gallery/comfyui-gallery';
import type { ParamExperimentAxis } from '@/lib/experiment/param-experiment-queue';
import type { PromptProject } from '@/lib/prompt/projects';

type GalleryPanelBulkSectionProps = {
  leanGallery: boolean;
  leanBulkEnabled: boolean;
  bulkEnabled: boolean;
  visibleEntries: ComfyGalleryEntry[];
  selectedIds: string[];
  selectedEntries: ComfyGalleryEntry[];
  projects: PromptProject[];
  paramAxis: ParamExperimentAxis;
  setParamAxis: (axis: ParamExperimentAxis) => void;
  similarSearchActive: boolean;
  clearSelection: () => void;
  openCompare: () => void;
  bulkExperimentHandlers: GalleryBulkExperimentHandlers;
  downloadError: string | null;
  filter: ComfyGalleryFilter;
  setFilter: (
    patch: Partial<ComfyGalleryFilter> | ((previous: ComfyGalleryFilter) => ComfyGalleryFilter)
  ) => void;
  setLoraExportScope: (scope: 'favorites' | 'selected') => void;
  setLoraExportOpen: (open: boolean) => void;
  selectAllVisible: () => void;
};

/** The entries as a contact sheet in a new tab. */
function openContactSheet(entries: readonly ComfyGalleryEntry[]) {
  if (!entries.length) return;
  openPrintSheet(
    storyboardHtml({
      title: 'Contact sheet',
      subtitle: `${entries.length} picture${entries.length === 1 ? '' : 's'} · ${new Date().toLocaleDateString()}`,
      shape: 'square',
      origin: window.location.origin,
      frames: contactSheetFrames(
        entries,
        entry => galleryEntryPrimaryThumbUrl(entry) ?? galleryEntryPrimaryViewUrl(entry)
      ),
    })
  );
}

export default function GalleryPanelBulkSection({
  leanGallery,
  leanBulkEnabled,
  bulkEnabled,
  visibleEntries,
  selectedIds,
  selectedEntries,
  projects,
  paramAxis,
  setParamAxis,
  similarSearchActive,
  clearSelection,
  openCompare,
  bulkExperimentHandlers,
  downloadError,
  filter,
  setFilter,
  setLoraExportScope,
  setLoraExportOpen,
  selectAllVisible,
}: GalleryPanelBulkSectionProps) {
  return (
    <>
      {leanBulkEnabled && visibleEntries.length > 0 && selectedIds.length === 0 ? (
        <div
          data-testid="gallery-multiselect-tip"
          className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[var(--text-muted)]"
        >
          <span>
            {leanGallery
              ? 'Select cards → Compare, Collect, Group, or Queue. Tip: Shift-click for a range.'
              : 'Select cards to compare, export, queue, group, assign projects, or remove.'}
          </span>
          <div className="flex items-center gap-2">
            {!leanGallery ? (
              <button
                type="button"
                onClick={() => {
                  setLoraExportScope('favorites');
                  setLoraExportOpen(true);
                }}
                className="ui-btn-ghost ui-btn-sm"
              >
                Export LoRA dataset (favorites/4–5★)
              </button>
            ) : null}
            <button type="button" onClick={selectAllVisible} className="ui-btn-ghost ui-btn-sm">
              Select visible ({visibleEntries.length})
            </button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="gallery-contact-sheet"
              title="The shown pictures numbered on a page, with tool, date, model and prompt — print or save as PDF"
              onClick={() => openContactSheet(visibleEntries.slice(0, 120))}
            >
              Contact sheet
            </Button>
          </div>
        </div>
      ) : null}

      {selectedIds.length > 0 ? (
        <div className="flex justify-end px-1">
          <Button
            size="sm"
            variant="ghost"
            data-testid="gallery-contact-sheet-selected"
            title="The selected pictures numbered on a page — print or save as PDF"
            onClick={() => openContactSheet(selectedEntries)}
          >
            Contact sheet ({selectedIds.length})
          </Button>
        </div>
      ) : null}
      {bulkEnabled ? (
        <GalleryExperimentPanel
          lean={leanGallery}
          selectedCount={selectedIds.length}
          selectedEntries={selectedEntries}
          projects={projects}
          paramAxis={paramAxis}
          setParamAxis={setParamAxis}
          similarSearchActive={similarSearchActive}
          onClearSelection={clearSelection}
          onCompare={openCompare}
          {...bulkExperimentHandlers}
        />
      ) : null}

      {downloadError ? <p className="text-xs ui-status-danger">{downloadError}</p> : null}

      {filter.characterId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2 text-xs text-[var(--accent-text)]">
          <span>Character filter: this cast member only</span>
          <Button
            variant="outline"
            tone="accent"
            type="button"
            onClick={() =>
              setFilter(previous => ({ ...previous, characterId: undefined, lookId: undefined }))
            }
            className="rounded-lg px-2 py-0.5 text-2xs text-inherit transition hover:border-[var(--accent-border)] hover:text-[var(--accent-text)]"
          >
            Clear
          </Button>
        </div>
      ) : null}
    </>
  );
}
