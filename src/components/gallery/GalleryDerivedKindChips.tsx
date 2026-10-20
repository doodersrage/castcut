'use client';

import {
  galleryDerivedKindChipLabel,
  GALLERY_DERIVED_KIND_FILTERS,
} from '@/lib/gallery/derived-kind';
import type { ComfyGalleryFilter } from '@/lib/gallery/comfyui-gallery';
import type { Dispatch, SetStateAction } from 'react';

type GalleryDerivedKindChipsProps = {
  filter: ComfyGalleryFilter;
  setFilter: Dispatch<SetStateAction<ComfyGalleryFilter>>;
};

export default function GalleryDerivedKindChips({
  filter,
  setFilter,
}: GalleryDerivedKindChipsProps) {
  if (filter.derivativeOfEntryId || filter.focusEntryId || filter.derivedKind) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2 text-xs text-[var(--accent-text)]">
        <span>
          {filter.focusEntryId
            ? 'Lineage filter: showing source entry'
            : filter.derivativeOfEntryId
              ? 'Lineage filter: showing derived outputs'
              : `Lineage filter: ${filter.derivedKind} only`}
        </span>
        <button
          type="button"
          onClick={() =>
            setFilter(previous => ({
              ...previous,
              derivativeOfEntryId: undefined,
              focusEntryId: undefined,
              derivedKind: undefined,
            }))
          }
          className="rounded-lg border border-[var(--accent-border)] px-2 py-0.5 text-[11px] transition hover:border-[var(--accent-border)] hover:text-[var(--accent-text)]"
        >
          Clear lineage filter
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {GALLERY_DERIVED_KIND_FILTERS.map(kind => (
        <button
          key={kind}
          type="button"
          data-testid={`gallery-derived-kind-${kind}`}
          onClick={() =>
            setFilter(previous => ({
              ...previous,
              derivedKind: previous.derivedKind === kind ? undefined : kind,
            }))
          }
          className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
            filter.derivedKind === kind
              ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-base)]/40 text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
          }`}
        >
          {galleryDerivedKindChipLabel(kind)}
        </button>
      ))}
    </div>
  );
}
