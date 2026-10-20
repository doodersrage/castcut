import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import type { GalleryLightboxPlaylist } from '@/lib/gallery/comfyui-gallery';

/** Build ImageLightboxState from a playlist + index, or null when the playlist is empty. */
export function buildLightboxStateFromPlaylist(
  playlist: GalleryLightboxPlaylist,
  index: number
): ImageLightboxState | null {
  if (playlist.images.length === 0) {
    return null;
  }
  const safeIndex = Math.min(Math.max(index, 0), playlist.images.length - 1);
  return {
    images: playlist.images,
    thumbImages: playlist.thumbImages,
    originalImages: playlist.originalImages,
    downloadUrls: playlist.downloadUrls,
    downloadFilenames: playlist.downloadFilenames,
    titles: playlist.titles,
    mediaKinds: playlist.mediaKinds,
    index: safeIndex,
    title: playlist.titles[safeIndex],
  };
}
