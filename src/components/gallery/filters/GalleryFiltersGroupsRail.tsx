'use client';

import type { ComfyGalleryFilter } from '@/lib/gallery/comfyui-gallery';
import { GALLERY_UNGROUPED_FILTER } from '@/lib/gallery/custom-groups';
import { FilterChip } from '@/components/gallery/GalleryFilterChip';

type Props = {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  customGroups: string[];
};

export function GalleryFiltersGroupsRail({ filter, setFilter, customGroups }: Props) {
  if (customGroups.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="gallery-groups-rail"
      className="flex flex-wrap items-center gap-2"
      aria-label="Gallery groups"
    >
      <span className="type-caption text-[var(--text-muted)]">Groups</span>
      <FilterChip
        active={!filter.customGroup}
        label="All"
        onClick={() => setFilter({ ...filter, customGroup: undefined })}
      />
      <FilterChip
        active={filter.customGroup === GALLERY_UNGROUPED_FILTER}
        label="Ungrouped"
        onClick={() =>
          setFilter({
            ...filter,
            customGroup:
              filter.customGroup === GALLERY_UNGROUPED_FILTER
                ? undefined
                : GALLERY_UNGROUPED_FILTER,
          })
        }
      />
      {customGroups.map(group => (
        <FilterChip
          key={`rail-${group}`}
          active={filter.customGroup === group}
          label={group}
          onClick={() =>
            setFilter({
              ...filter,
              customGroup: filter.customGroup === group ? undefined : group,
            })
          }
        />
      ))}
    </div>
  );
}
