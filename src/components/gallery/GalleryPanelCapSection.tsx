'use client';

import Link from 'next/link';
import GalleryCapCleanupWizard from '@/components/gallery/GalleryCapCleanupWizard';
import { GalleryCapWarningBanner } from '@/components/gallery/GalleryPanelChrome';
import type { ComfyGalleryEntry, ComfyGalleryFilter } from '@/lib/comfyui-gallery';
import type { GalleryCapWarningLevel } from '@/lib/gallery-cap';
import { MAX_GALLERY_ENTRIES } from '@/lib/comfyui-gallery-storage-meta';

type GalleryPanelCapSectionProps = {
  showFilters: boolean;
  galleryCapWarning: { level: GalleryCapWarningLevel; message: string | null };
  capWizardOpen: boolean;
  setCapWizardOpen: (open: boolean) => void;
  capEvictionPreview: ComfyGalleryEntry[];
  entriesLength: number;
  filter: ComfyGalleryFilter;
  setFilter: (
    patch: Partial<ComfyGalleryFilter> | ((previous: ComfyGalleryFilter) => ComfyGalleryFilter)
  ) => void;
  exportCapKeepers: () => void;
  archiveThenPurgeRest: () => void;
  finishPendingArchivePurge: () => void;
  purgeRestOnly: () => void;
  removeEntries: (ids: string[]) => void;
  setFavorites: (ids: string[], favorite: boolean) => void;
};

export default function GalleryPanelCapSection({
  showFilters,
  galleryCapWarning,
  capWizardOpen,
  setCapWizardOpen,
  capEvictionPreview,
  entriesLength,
  filter,
  setFilter,
  exportCapKeepers,
  archiveThenPurgeRest,
  finishPendingArchivePurge,
  purgeRestOnly,
  removeEntries,
  setFavorites,
}: GalleryPanelCapSectionProps) {
  const showAtRisk = () =>
    setFilter(previous => ({
      ...previous,
      atRiskOnly: true,
      favoritesOnly: undefined,
      minRating: undefined,
    }));

  const clearAtRisk = () =>
    setFilter(previous => ({
      ...previous,
      atRiskOnly: undefined,
    }));

  return (
    <>
      {galleryCapWarning.message ? (
        <GalleryCapWarningBanner
          level={galleryCapWarning.level}
          message={galleryCapWarning.message}
          onShowAtRisk={showAtRisk}
          onExportKeepers={exportCapKeepers}
          onOpenCleanup={() => setCapWizardOpen(true)}
        />
      ) : null}

      {filter.atRiskOnly ? (
        <div
          data-testid="gallery-at-risk-active"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2 text-xs text-[var(--tint-warning-text)]"
        >
          <p className="min-w-0 flex-1">
            Showing unrated non-favorites most at risk of eviction
            {!showFilters ? ' in this preview' : ''}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {!showFilters ? (
              <Link
                href="/gallery?atRisk=1"
                className="rounded-xl border border-current/30 bg-black/10 px-2.5 py-1 text-[11px] font-medium transition hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                Open full gallery
              </Link>
            ) : null}
            <button
              type="button"
              onClick={clearAtRisk}
              className="rounded-xl border border-current/30 bg-black/10 px-2.5 py-1 text-[11px] font-medium transition hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {capWizardOpen ? (
        <GalleryCapCleanupWizard
          evicted={capEvictionPreview}
          max={MAX_GALLERY_ENTRIES}
          total={entriesLength}
          onShowAtRisk={() => {
            showAtRisk();
            setCapWizardOpen(false);
          }}
          onExportKeepers={exportCapKeepers}
          onArchiveThenPurge={() => {
            archiveThenPurgeRest();
            setCapWizardOpen(false);
          }}
          onFinishPendingPurge={() => {
            finishPendingArchivePurge();
            setCapWizardOpen(false);
          }}
          onPurgeRestOnly={() => {
            purgeRestOnly();
            setCapWizardOpen(false);
          }}
          onDeleteEvicted={() => {
            if (capEvictionPreview.length === 0) {
              return;
            }
            if (
              window.confirm(
                `Delete ${capEvictionPreview.length} at-risk gallery entries? Favorites, ratings, Cast look plates, and look keepers stay.`
              )
            ) {
              removeEntries(capEvictionPreview.map(entry => entry.id));
              setCapWizardOpen(false);
            }
          }}
          onFavoriteEvicted={() => {
            if (capEvictionPreview.length === 0) {
              return;
            }
            setFavorites(
              capEvictionPreview.map(entry => entry.id),
              true
            );
            setCapWizardOpen(false);
          }}
          onClose={() => setCapWizardOpen(false)}
        />
      ) : null}
    </>
  );
}
