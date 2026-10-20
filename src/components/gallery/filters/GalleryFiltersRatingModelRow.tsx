'use client';

import type { ComfyGalleryFilter } from '@/lib/gallery/comfyui-gallery';
import { SegmentedControl } from '@/components/ui/ToolPageShell';

type Props = {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  models: string[];
};

export function GalleryFiltersRatingModelRow({ filter, setFilter, models }: Props) {
  return (
    <div className="hidden flex-wrap items-center gap-2 md:flex">
      <SegmentedControl
        aria-label="Minimum rating"
        value={filter.minRating ? String(filter.minRating) : 'any'}
        onChange={value =>
          setFilter(previous => ({
            ...previous,
            minRating: value === 'any' ? undefined : (Number(value) as 1 | 3 | 4 | 5),
          }))
        }
        options={[
          { value: 'any', label: 'Any ★', testId: 'gallery-filter-rating-any' },
          { value: '5', label: '5★', testId: 'gallery-filter-rating-5' },
          { value: '4', label: '≥4★', testId: 'gallery-filter-rating-4' },
          { value: '3', label: '≥3★', testId: 'gallery-filter-rating-3' },
          { value: '1', label: '≥1★', testId: 'gallery-filter-rating-1' },
        ]}
      />
      {models.length > 0 ? (
        <label className="flex items-center gap-1.5 type-caption text-[var(--text-muted)]">
          Model
          <select
            value={filter.model ?? ''}
            onChange={event =>
              setFilter({
                ...filter,
                model: event.target.value || undefined,
              })
            }
            data-testid="gallery-filter-model"
            className="ui-input !w-auto min-w-[10rem] px-2 py-1 text-xs"
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
    </div>
  );
}
