'use client';

import type React from 'react';

import type { ComfyGalleryFilter, ComfyGalleryJobStatus } from '@/lib/comfyui-gallery';
import { GALLERY_UNGROUPED_FILTER } from '@/lib/gallery-custom-groups';
import { FilterChip } from '@/components/gallery/GalleryFilterChip';

type Props = {
  /** Phones: hide everything but Search (the Filters toggle opens it). */
  collapsedOnPhone?: boolean;
  /** Phones: the Filters toggle, shown right under Search. */
  phoneToggle?: React.ReactNode;
  lean: boolean;
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  queryDraft: string;
  setQueryDraft: (value: string) => void;
  embeddingSearchActive: boolean;
  embeddingSearchLoading: boolean;
  embeddingSearchUnavailable: boolean;
  customGroups: string[];
  onRenameCustomGroup?: (from: string, to: string) => void;
  onDeleteCustomGroup?: (name: string) => void;
};

export function GalleryFiltersSearchGroup({
  lean,
  filter,
  setFilter,
  queryDraft,
  setQueryDraft,
  embeddingSearchActive,
  embeddingSearchLoading,
  embeddingSearchUnavailable,
  customGroups,
  onRenameCustomGroup,
  onDeleteCustomGroup,
  collapsedOnPhone = false,
  phoneToggle,
}: Props) {
  const phoneHidden = collapsedOnPhone ? ' max-md:hidden' : '';
  return (
    <>
      <label className="min-w-[min(100%,20rem)] flex-1 space-y-1.5">
        <span className="type-caption text-[var(--text-muted)]">Search</span>
        <input
          type="search"
          value={queryDraft}
          onChange={event => setQueryDraft(event.target.value)}
          placeholder={
            lean
              ? 'Search prompts, tool, or model…'
              : 'Prompt, tool, model, prompt id, vision tags…'
          }
          className="ui-input block w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
        />
      </label>
      {phoneToggle}

      {!lean ? (
        <div className={`flex min-w-[8rem] flex-col gap-1.5${phoneHidden}`}>
          <span className="type-caption text-[var(--text-muted)]">Match</span>
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              active={Boolean(filter.semanticSearch)}
              label={
                embeddingSearchLoading
                  ? 'Semantic…'
                  : embeddingSearchActive
                    ? 'Semantic ✓'
                    : 'Semantic'
              }
              testId="gallery-filter-semantic-inline"
              onClick={() =>
                setFilter({
                  ...filter,
                  semanticSearch: filter.semanticSearch ? undefined : true,
                })
              }
            />
            {filter.semanticSearch && embeddingSearchUnavailable ? (
              <span className="type-caption text-[var(--tint-warning-text)]">text fallback</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <label className={`min-w-[8rem] space-y-1.5${phoneHidden}`}>
        <span className="type-caption text-[var(--text-muted)]">Status</span>
        <select
          value={filter.status ?? 'all'}
          onChange={event =>
            setFilter({
              ...filter,
              status: event.target.value as ComfyGalleryJobStatus | 'all',
            })
          }
          className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="error">Error</option>
        </select>
      </label>

      <label className={`min-w-[8rem] space-y-1.5${phoneHidden}`}>
        <span className="type-caption text-[var(--text-muted)]">Gallery group</span>
        <select
          value={filter.customGroup ?? ''}
          onChange={event =>
            setFilter({
              ...filter,
              customGroup: event.target.value || undefined,
            })
          }
          data-testid="gallery-filter-custom-group"
          className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
        >
          <option value="">All groups</option>
          <option value={GALLERY_UNGROUPED_FILTER}>Ungrouped</option>
          {customGroups.map(group => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
      </label>

      {filter.customGroup &&
      filter.customGroup !== GALLERY_UNGROUPED_FILTER &&
      (onRenameCustomGroup || onDeleteCustomGroup) ? (
        <div className={`flex flex-wrap items-end gap-2 pb-0.5${phoneHidden}`}>
          {onRenameCustomGroup ? (
            <button
              type="button"
              data-testid="gallery-group-rename"
              className="ui-btn-ghost ui-btn-sm text-[11px]"
              onClick={() => {
                const next = window.prompt('Rename group', filter.customGroup);
                if (next?.trim() && next.trim() !== filter.customGroup) {
                  onRenameCustomGroup(filter.customGroup!, next.trim());
                  setFilter(previous => ({ ...previous, customGroup: next.trim() }));
                }
              }}
            >
              Rename
            </button>
          ) : null}
          {onDeleteCustomGroup ? (
            <button
              type="button"
              data-testid="gallery-group-delete"
              className="ui-btn-ghost ui-btn-sm text-[11px] text-[var(--tint-danger-text)]"
              onClick={() => {
                if (
                  window.confirm(
                    `Remove group “${filter.customGroup}” from all gallery items? Files stay; only the group label is cleared.`
                  )
                ) {
                  onDeleteCustomGroup(filter.customGroup!);
                  setFilter(previous => ({ ...previous, customGroup: undefined }));
                }
              }}
            >
              Delete group
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
