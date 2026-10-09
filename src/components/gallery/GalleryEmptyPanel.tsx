'use client';

import { AppSlotOwner, type GalleryEmptySlotProps } from '@/components/AppSlot';
import { EmptyState } from '@/components/ui/ViewState';

/**
 * The Gallery with nothing to show. Castcut puts its own panel here (start a film — the
 * 'gallery.empty' slot); without one, a plain empty state.
 */
export default function GalleryEmptyPanel(props: GalleryEmptySlotProps) {
  return (
    <AppSlotOwner
      name="gallery.empty"
      props={props}
      fallback={
        props.filtered ? (
          <EmptyState
            icon="search"
            title="No entries match these filters"
            description="Try clearing search, status, or project filters — or turn off semantic search."
            action={{ label: 'Clear filters', onClick: props.onClearFilters }}
          />
        ) : (
          <EmptyState
            icon="inbox"
            title="No gallery outputs yet"
            description="Generate a still or upload your own."
            action={
              props.onUpload ? { label: 'Upload images', onClick: props.onUpload } : undefined
            }
          />
        )
      }
    />
  );
}
