'use client';

import type { ComfyGalleryFilter, GalleryPageSize } from '@/lib/comfyui-gallery';
import { GALLERY_PAGE_SIZE_ALL, GALLERY_PAGE_SIZE_OPTIONS } from '@/lib/comfyui-gallery';
import { FilterChip } from '@/components/gallery/GalleryFilterChip';

type Props = {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  paginationEnabled: boolean;
  pageSize: GalleryPageSize;
  setPageSize: (value: GalleryPageSize) => void;
};

export function GalleryFiltersLeanRow({
  filter,
  setFilter,
  paginationEnabled,
  pageSize,
  setPageSize,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChip
        active={Boolean(filter.favoritesOnly)}
        label="Favorites"
        onClick={() =>
          setFilter(previous => ({
            ...previous,
            favoritesOnly: previous.favoritesOnly ? undefined : true,
          }))
        }
      />
      <FilterChip
        active={filter.status === 'completed'}
        label="Completed"
        onClick={() =>
          setFilter(previous => ({
            ...previous,
            status: previous.status === 'completed' ? 'all' : 'completed',
          }))
        }
      />
      <FilterChip
        active={filter.status === 'error'}
        label="Failed"
        onClick={() =>
          setFilter(previous => ({
            ...previous,
            status: previous.status === 'error' ? 'all' : 'error',
          }))
        }
      />
      <FilterChip
        active={Boolean(filter.reviewMode)}
        label="Review"
        onClick={() =>
          setFilter(previous => ({
            ...previous,
            reviewMode: previous.reviewMode ? undefined : true,
            unreviewedOnly: previous.reviewMode ? undefined : true,
          }))
        }
      />
      <FilterChip
        active={Boolean(filter.unreviewedOnly)}
        label="Unreviewed"
        onClick={() =>
          setFilter(previous => ({
            ...previous,
            unreviewedOnly: previous.unreviewedOnly ? undefined : true,
            reviewMode: previous.unreviewedOnly ? previous.reviewMode : true,
          }))
        }
      />
      {paginationEnabled ? (
        <label className="flex items-center gap-1.5 whitespace-nowrap type-caption text-[var(--text-muted)]">
          Page size
          <select
            value={String(pageSize)}
            onChange={event => {
              const value = event.target.value;
              setPageSize(
                value === GALLERY_PAGE_SIZE_ALL
                  ? GALLERY_PAGE_SIZE_ALL
                  : (Number(value) as GalleryPageSize)
              );
            }}
            className="ui-input px-2 py-1 text-[11px]"
          >
            {GALLERY_PAGE_SIZE_OPTIONS.map(option => (
              <option key={String(option)} value={String(option)}>
                {option}
              </option>
            ))}
            <option value={GALLERY_PAGE_SIZE_ALL}>All</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}
