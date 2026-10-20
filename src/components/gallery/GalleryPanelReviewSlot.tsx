'use client';

import GalleryVisionReviewButton from '@/components/gallery/GalleryVisionReviewButton';
import GalleryReviewTouchBar from '@/components/gallery/GalleryReviewTouchBar';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import { galleryEntryViewUrls } from '@/lib/gallery/comfyui-gallery';

type GalleryPanelReviewSlotProps = {
  reviewFocusEntry: ComfyGalleryEntry;
  reviewFocusIndex: number;
  visibleEntries: ComfyGalleryEntry[];
  onReviewRating: (entry: ComfyGalleryEntry, rating: 1 | 2 | 3 | 4 | 5) => void;
  onToggleFavorite: (entryId: string) => void;
  onSelectEntry: (entryId: string) => void;
};

export default function GalleryPanelReviewSlot({
  reviewFocusEntry,
  reviewFocusIndex,
  visibleEntries,
  onReviewRating,
  onToggleFavorite,
  onSelectEntry,
}: GalleryPanelReviewSlotProps) {
  const reviewImageUrl = galleryEntryViewUrls(reviewFocusEntry)[0];

  return (
    <>
      {reviewImageUrl ? (
        <GalleryVisionReviewButton
          imageDataUrl={reviewImageUrl}
          prompt={reviewFocusEntry.prompt}
          onApplyRating={rating => {
            onReviewRating(reviewFocusEntry, rating);
          }}
        />
      ) : null}
      <GalleryReviewTouchBar
        onRate={rating => {
          onReviewRating(reviewFocusEntry, rating);
        }}
        onFavorite={() => onToggleFavorite(reviewFocusEntry.id)}
        onNext={() => {
          const nextEntry =
            visibleEntries[Math.min(reviewFocusIndex + 1, visibleEntries.length - 1)];
          if (nextEntry) {
            onSelectEntry(nextEntry.id);
          }
        }}
        onPrev={() => {
          const prevEntry = visibleEntries[Math.max(reviewFocusIndex - 1, 0)];
          if (prevEntry) {
            onSelectEntry(prevEntry.id);
          }
        }}
      />
    </>
  );
}
