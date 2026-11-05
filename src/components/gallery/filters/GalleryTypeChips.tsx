'use client';

import type { ComfyGalleryFilter } from '@/lib/gallery/comfyui-gallery';
import { SegmentedControl } from '@/components/ui/ToolPageShell';

type GalleryType = 'all' | 'stills' | 'clips' | 'films';

function typeOf(filter: ComfyGalleryFilter): GalleryType {
  if (filter.derivedKind === 'film') return 'films';
  if (filter.mediaKind === 'image') return 'stills';
  if (filter.mediaKind === 'video') return 'clips';
  return 'all';
}

/**
 * What kind of thing (2026-11-05): stills, clips or films, in the bar — the Stills / Videos chips
 * sat in the folded Filters, and films had no filter there at all.
 */
export function GalleryTypeChips({
  filter,
  setFilter,
}: {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
}) {
  return (
    <SegmentedControl
      aria-label="Type"
      value={typeOf(filter)}
      onChange={value =>
        setFilter(previous => ({
          ...previous,
          mediaKind: value === 'stills' ? 'image' : value === 'clips' ? 'video' : 'all',
          derivedKind:
            value === 'films'
              ? 'film'
              : previous.derivedKind === 'film'
                ? undefined
                : previous.derivedKind,
        }))
      }
      options={[
        { value: 'all', label: 'All', testId: 'gallery-type-all' },
        { value: 'stills', label: 'Stills', testId: 'gallery-type-stills' },
        { value: 'clips', label: 'Clips', testId: 'gallery-type-clips' },
        { value: 'films', label: 'Films', testId: 'gallery-type-films' },
      ]}
    />
  );
}

/** The star floor as one small menu (it was a five-button row). */
export function GalleryRatingSelect({
  filter,
  setFilter,
}: {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
}) {
  return (
    <select
      aria-label="Minimum rating"
      value={filter.minRating ? String(filter.minRating) : ''}
      data-testid="gallery-filter-rating"
      onChange={event =>
        setFilter(previous => ({
          ...previous,
          minRating: event.target.value ? (Number(event.target.value) as 1 | 3 | 4 | 5) : undefined,
        }))
      }
      className="ui-select h-9 w-auto"
    >
      <option value="">Any ★</option>
      <option value="5">5★ only</option>
      <option value="4">4★ and up</option>
      <option value="3">3★ and up</option>
      <option value="1">Rated</option>
    </select>
  );
}
