'use client';

import { useState } from 'react';
import type { VisionBackfillProgress } from '@/lib/gallery/vision-backfill';
import { COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/gallery/comfyui-gallery';
import type { PromptProject } from '@/lib/prompt-projects';
import type { GalleryPageSize } from '@/lib/gallery/comfyui-gallery';
import { GALLERY_PAGE_SIZE_ALL, GALLERY_PAGE_SIZE_OPTIONS } from '@/lib/gallery/comfyui-gallery';
import type { ComfyGalleryFilter } from '@/lib/gallery/comfyui-gallery';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import { FilterChip } from '@/components/gallery/GalleryFilterChip';

export type GalleryFiltersAdvancedPanelProps = {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  tools: string[];
  models: string[];
  userTags?: string[];
  projects: PromptProject[];
  projectFilterId: string;
  setProjectFilterId: (value: string) => void;
  pageSize: GalleryPageSize;
  setPageSize: (value: GalleryPageSize) => void;
  paginationEnabled: boolean;
  embeddingSearchActive: boolean;
  embeddingSearchUnavailable?: boolean;
  onStartSlideshow?: () => void;
  onStartFullscreenSlideshow?: () => void;
  slideshowAvailable?: boolean;
};

export function GalleryFiltersAdvancedPanel({
  filter,
  setFilter,
  tools,
  models,
  userTags = [],
  projects,
  projectFilterId,
  setProjectFilterId,
  pageSize,
  setPageSize,
  paginationEnabled,
  embeddingSearchActive,
  embeddingSearchUnavailable = false,
  onStartSlideshow,
  onStartFullscreenSlideshow,
  slideshowAvailable,
}: GalleryFiltersAdvancedPanelProps) {
  const [backfillProgress, setBackfillProgress] = useState<VisionBackfillProgress | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);

  const activeToggleCount = [
    filter.favoritesOnly,
    filter.semanticSearch,
    filter.reviewMode,
    filter.unreviewedOnly,
    filter.reviewAutoAdvance,
    filter.visionTagsOnly,
    filter.atRiskOnly,
    filter.duplicatesOnly,
    filter.needsVisionReview,
    filter.userTag,
    filter.customGroup,
    filter.similarToEntryId,
    filter.model,
    filter.minRating,
    filter.tool,
  ].filter(Boolean).length;

  async function runVisionBackfill() {
    const { backfillVisionTags, listUntaggedCompletedEntries } =
      await import('@/lib/gallery/vision-backfill');
    const entries = listUntaggedCompletedEntries(100);
    if (entries.length === 0) {
      return;
    }
    setBackfillLoading(true);
    setBackfillProgress({ total: entries.length, completed: 0, tagged: 0, skipped: 0, failed: 0 });
    try {
      await backfillVisionTags(entries, {
        concurrency: 2,
        onProgress: progress => setBackfillProgress({ ...progress }),
      });
      window.dispatchEvent(new Event(COMFYUI_GALLERY_UPDATED_EVENT));
    } finally {
      setBackfillLoading(false);
    }
  }

  return (
    <CollapsibleSection
      title="Filters"
      summary="Tool, project, saved views, review toggles, and slideshow."
      defaultOpen={false}
      persistKey="gallery-advanced-filters"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.length > 0 ? (
          <label className="space-y-1.5">
            <span className="type-caption text-[var(--text-muted)]">Tool</span>
            <select
              value={filter.tool ?? ''}
              onChange={event =>
                setFilter({
                  ...filter,
                  tool: event.target.value || undefined,
                })
              }
              className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
            >
              <option value="">All tools</option>
              {tools.map(tool => (
                <option key={tool} value={tool}>
                  {tool}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {models.length > 0 ? (
          <label className="space-y-1.5">
            <span className="type-caption text-[var(--text-muted)]">Model</span>
            <select
              value={filter.model ?? ''}
              onChange={event =>
                setFilter({
                  ...filter,
                  model: event.target.value || undefined,
                })
              }
              className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
            >
              <option value="">All models</option>
              {models.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {userTags.length > 0 ? (
          <label className="space-y-1.5">
            <span className="type-caption text-[var(--text-muted)]">Tags</span>
            <select
              value={filter.userTag ?? ''}
              onChange={event =>
                setFilter({
                  ...filter,
                  userTag: event.target.value || undefined,
                })
              }
              data-testid="gallery-filter-user-tag"
              className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
            >
              <option value="">All tags</option>
              {userTags.map(tag => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="space-y-1.5">
          <span className="type-caption text-[var(--text-muted)]">Project</span>
          <select
            value={projectFilterId}
            onChange={event => setProjectFilterId(event.target.value)}
            className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
          >
            <option value="">All projects</option>
            <option value="active">Active project</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        {paginationEnabled ? (
          <label className="space-y-1.5">
            <span className="type-caption text-[var(--text-muted)]">Per page</span>
            <select
              value={pageSize}
              onChange={event => setPageSize(event.target.value as GalleryPageSize)}
              className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
            >
              {GALLERY_PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
              <option value={GALLERY_PAGE_SIZE_ALL}>All</option>
            </select>
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={!filter.mediaKind || filter.mediaKind === 'all'}
          label="All media"
          onClick={() => setFilter({ ...filter, mediaKind: 'all' })}
        />
        <FilterChip
          active={filter.mediaKind === 'image'}
          label="Stills"
          onClick={() => setFilter({ ...filter, mediaKind: 'image' })}
        />
        <FilterChip
          active={filter.mediaKind === 'video'}
          label="Videos"
          onClick={() => setFilter({ ...filter, mediaKind: 'video' })}
        />
        <FilterChip
          active={filter.mediaKind === 'audio'}
          label="Audio"
          onClick={() => setFilter({ ...filter, mediaKind: 'audio' })}
        />
        <FilterChip
          active={filter.mediaKind === 'mesh'}
          label="3D"
          onClick={() => setFilter({ ...filter, mediaKind: 'mesh' })}
        />
        <FilterChip
          active={Boolean(filter.favoritesOnly)}
          label="Favorites"
          onClick={() =>
            setFilter({ ...filter, favoritesOnly: filter.favoritesOnly ? undefined : true })
          }
        />
        <FilterChip
          active={Boolean(filter.semanticSearch)}
          label={embeddingSearchActive ? 'Semantic ✓' : 'Semantic'}
          onClick={() =>
            setFilter({
              ...filter,
              semanticSearch: filter.semanticSearch ? undefined : true,
            })
          }
        />
        <FilterChip
          active={Boolean(filter.reviewMode)}
          label="Review mode"
          testId="gallery-filter-review-mode"
          onClick={() => setFilter({ ...filter, reviewMode: filter.reviewMode ? undefined : true })}
        />
        <FilterChip
          active={Boolean(filter.unreviewedOnly)}
          label="Unreviewed"
          onClick={() =>
            setFilter({
              ...filter,
              unreviewedOnly: filter.unreviewedOnly ? undefined : true,
            })
          }
        />
        <FilterChip
          active={Boolean(filter.visionTagsOnly)}
          label="Vision tags"
          onClick={() =>
            setFilter({ ...filter, visionTagsOnly: filter.visionTagsOnly ? undefined : true })
          }
        />
        <FilterChip
          active={Boolean(filter.duplicatesOnly)}
          label="Duplicates"
          testId="gallery-filter-duplicates"
          onClick={() =>
            setFilter({
              ...filter,
              duplicatesOnly: filter.duplicatesOnly ? undefined : true,
            })
          }
        />
        <FilterChip
          active={Boolean(filter.needsVisionReview)}
          label="Vision inbox"
          testId="gallery-filter-vision-inbox"
          onClick={() =>
            setFilter({
              ...filter,
              needsVisionReview: filter.needsVisionReview ? undefined : true,
            })
          }
        />
        <FilterChip
          active={Boolean(filter.atRiskOnly)}
          label="At risk"
          onClick={() =>
            setFilter({
              ...filter,
              atRiskOnly: filter.atRiskOnly ? undefined : true,
            })
          }
        />
        <button
          type="button"
          disabled={backfillLoading}
          onClick={() => void runVisionBackfill()}
          className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] transition hover:bg-[var(--tint-info-bg)] hover:border-[var(--tint-info-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-40 ${
            backfillLoading ? 'text-slate-400' : 'text-[var(--tint-info-text)]'
          }`}
        >
          {backfillLoading
            ? backfillProgress
              ? `Tagging ${backfillProgress.completed}/${backfillProgress.total}`
              : 'Tagging…'
            : 'Tag untagged'}
        </button>
        {filter.semanticSearch && embeddingSearchUnavailable ? (
          <span className="rounded-[var(--radius-full)] border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2.5 py-1 text-[10px] text-[var(--tint-warning-text)]">
            Semantic search needs LLM embeddings — using text match
          </span>
        ) : null}
        {filter.reviewMode ? (
          <FilterChip
            active={Boolean(filter.reviewAutoAdvance)}
            label="Auto-advance"
            onClick={() =>
              setFilter({
                ...filter,
                reviewAutoAdvance: filter.reviewAutoAdvance ? undefined : true,
              })
            }
          />
        ) : null}
        {slideshowAvailable && onStartSlideshow ? (
          <button
            type="button"
            onClick={onStartSlideshow}
            className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] transition hover:bg-[var(--tint-warning-bg)] hover:border-[var(--tint-warning-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] text-[var(--tint-warning-text)]`}
          >
            Slideshow
          </button>
        ) : null}
        {slideshowAvailable && onStartFullscreenSlideshow ? (
          <button
            type="button"
            onClick={onStartFullscreenSlideshow}
            className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] transition hover:bg-[var(--accent-soft)] hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] text-[var(--accent-text)]`}
          >
            Fullscreen slideshow
          </button>
        ) : null}
        {activeToggleCount > 0 ? (
          <button
            type="button"
            className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--bg-muted)] transition hover:bg-[var(--accent-muted)] hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]`}
            onClick={() =>
              setFilter({
                ...filter,
                favoritesOnly: undefined,
                semanticSearch: undefined,
                reviewMode: undefined,
                unreviewedOnly: undefined,
                reviewAutoAdvance: undefined,
                visionTagsOnly: undefined,
                atRiskOnly: undefined,
                model: undefined,
                minRating: undefined,
                tool: undefined,
              })
            }
          >
            Clear toggles
          </button>
        ) : null}
      </div>

      {filter.reviewMode ? (
        <p className="rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2 text-[11px] text-[var(--accent-text)]">
          Review shortcuts: <kbd className="rounded bg-[var(--bg-muted)] px-1">1–5</kbd> rate ·{' '}
          <kbd className="rounded bg-[var(--bg-muted)] px-1">F</kbd> favorite ·{' '}
          <kbd className="rounded bg-[var(--bg-muted)] px-1">N</kbd>/
          <kbd className="rounded bg-[var(--bg-muted)] px-1">P</kbd> navigate
          {filter.reviewAutoAdvance ? ' · auto-advance on' : ''}
        </p>
      ) : null}
    </CollapsibleSection>
  );
}
