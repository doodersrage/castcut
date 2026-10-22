'use client';

import { useState } from 'react';
import type {
  ComfyGalleryFilter,
  ComfyGallerySort,
  GalleryLayoutMode,
  GalleryPageSize,
} from '@/lib/gallery/comfyui-gallery';
import type { GalleryDensity } from '@/lib/gallery/density';
import {
  deleteGallerySavedView,
  loadGallerySavedViews,
  upsertGallerySavedView,
  type GallerySavedView,
} from '@/lib/gallery/saved-views';
import { Button } from '@/components/ui/Button';

export type GalleryFiltersSavedViewsProps = {
  savedViews: GallerySavedView[];
  viewNameDraft: string;
  setViewNameDraft: (value: string) => void;
  onSaveView: () => void;
  onApplyView: (view: GallerySavedView) => void;
  onDeleteView: (id: string) => void;
  lean?: boolean;
};

export default function GalleryFiltersSavedViews({
  savedViews,
  viewNameDraft,
  setViewNameDraft,
  onSaveView,
  onApplyView,
  onDeleteView,
  lean = false,
}: GalleryFiltersSavedViewsProps) {
  if (savedViews.length === 0 && lean) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="type-caption text-[var(--text-muted)]">Views</span>
      {savedViews.map(view => (
        <span key={view.id} className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => onApplyView(view)}
            data-testid={`gallery-saved-view-${view.id}`}
            className="ui-chip rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            {view.name}
          </button>
          {!lean ? (
            <Button
              variant="quiet"
              type="button"
              onClick={() => onDeleteView(view.id)}
              className="rounded-xl px-1 text-xs transition hover:text-[var(--tint-danger-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              aria-label={`Delete saved view ${view.name}`}
            >
              ×
            </Button>
          ) : null}
        </span>
      ))}
      {!lean ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={viewNameDraft}
            onChange={event => setViewNameDraft(event.target.value)}
            placeholder="Name this view…"
            className="ui-input min-w-[10rem] px-2 py-1 text-2xs"
          />
          <button
            type="button"
            onClick={onSaveView}
            className="ui-btn-ghost ui-btn-sm rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--bg-muted)] text-xs text-[var(--accent-text)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Save view
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function useGallerySavedViewsState() {
  const [savedViews, setSavedViews] = useState<GallerySavedView[]>(() => loadGallerySavedViews());
  const [viewNameDraft, setViewNameDraft] = useState('');

  function saveCurrentView({
    filter,
    sort,
    projectFilterId,
    layout,
    pageSize,
    density,
  }: {
    filter: ComfyGalleryFilter;
    sort: ComfyGallerySort;
    projectFilterId: string;
    layout: GalleryLayoutMode;
    pageSize: GalleryPageSize;
    density: GalleryDensity;
  }) {
    const name = viewNameDraft.trim() || `View ${savedViews.length + 1}`;
    upsertGallerySavedView({
      id: crypto.randomUUID(),
      name,
      filter,
      sort,
      projectFilterId,
      layout,
      pageSize,
      density,
    });
    setSavedViews(loadGallerySavedViews());
    setViewNameDraft('');
  }

  function deleteView(id: string) {
    deleteGallerySavedView(id);
    setSavedViews(loadGallerySavedViews());
  }

  return {
    savedViews,
    viewNameDraft,
    setViewNameDraft,
    saveCurrentView,
    deleteView,
  };
}
