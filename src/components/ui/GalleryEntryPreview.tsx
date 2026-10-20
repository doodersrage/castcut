'use client';

import GalleryKindPreview from '@/components/ui/GalleryKindPreview';
import {
  galleryEntryHeroPreviewUrl,
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryPlaybackIndex,
  type ComfyGalleryEntry,
} from '@/lib/gallery/comfyui-gallery';

/**
 * Grid/list preview for a gallery entry: looping clip, audio player, 3D
 * placeholder, or still thumb.
 */
export default function GalleryEntryPreview({
  entry,
  className,
  alt = '',
  controls = false,
}: {
  entry: ComfyGalleryEntry;
  className?: string;
  alt?: string;
  controls?: boolean;
}) {
  const src = galleryEntryHeroPreviewUrl(entry);
  if (!src) {
    return null;
  }
  const kind = galleryEntryPrimaryMediaKind(entry);
  const playbackIndex = galleryEntryPrimaryPlaybackIndex(entry);
  const filename = entry.images[playbackIndex]?.filename ?? entry.images[0]?.filename;
  return (
    <GalleryKindPreview
      kind={kind}
      src={src}
      filename={filename}
      className={className}
      alt={alt}
      controls={controls}
    />
  );
}
