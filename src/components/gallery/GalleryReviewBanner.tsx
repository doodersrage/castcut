'use client';

import type { ComfyGalleryFilter } from '@/lib/gallery/comfyui-gallery';

type GalleryReviewBannerProps = {
  filter: ComfyGalleryFilter;
};

export default function GalleryReviewBanner({ filter }: GalleryReviewBannerProps) {
  return (
    <div
      data-testid="gallery-review-banner"
      className="ui-gallery-dock sticky top-[calc(var(--header-offset,0px)+0.5rem)] z-20 px-4 py-3"
      role="status"
    >
      <p className="text-sm font-medium text-[var(--text-primary)]">Review mode</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--accent-text)]">
        Click a card to focus it, then rate with <kbd className="ui-kbd">1–5</kbd>, favorite with{' '}
        <kbd className="ui-kbd">F</kbd>, navigate with <kbd className="ui-kbd">N</kbd> /{' '}
        <kbd className="ui-kbd">P</kbd>
        {filter.reviewAutoAdvance ? ' · auto-advance enabled' : ''}
        {filter.unreviewedOnly ? ' · showing unreviewed only' : ''}
      </p>
    </div>
  );
}
