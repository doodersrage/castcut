'use client';

import type { RefObject } from 'react';
import ImageLightbox from '@/components/ui/ImageLightbox';
import { GALLERY_UPLOAD_ACCEPT } from '@/components/gallery/GalleryUploadButton';
import {
  GALLERY_SLIDESHOW_INTERVAL_OPTIONS,
  GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
  type GallerySlideshowIntervalMs,
} from '@/lib/gallery/comfyui-gallery';
import type { GalleryPanelLightboxSlotProps } from '@/components/gallery/gallery-panel-body-types';

type GalleryPanelLightboxSlotComponentProps = {
  uploadInputRef: RefObject<HTMLInputElement | null>;
  importDroppedImages: (files: File[]) => Promise<void>;
  lightbox: GalleryPanelLightboxSlotProps;
};

export default function GalleryPanelLightboxSlot({
  uploadInputRef,
  importDroppedImages,
  lightbox,
}: GalleryPanelLightboxSlotComponentProps) {
  return (
    <>
      <input
        ref={uploadInputRef}
        type="file"
        accept={GALLERY_UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={event => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          void importDroppedImages(files);
        }}
      />
      <ImageLightbox
        state={lightbox.resolvedLightbox}
        onClose={lightbox.closeLightbox}
        onIndexChange={lightbox.onIndexChange}
        onDownloadImage={lightbox.onDownloadImage}
        slideChrome={lightbox.slideChrome}
        slideshow={
          lightbox.playlistLength > 1
            ? {
                playing: lightbox.slideshowPlaying,
                intervalMs: lightbox.slideshowIntervalMs,
                intervalOptions: GALLERY_SLIDESHOW_INTERVAL_OPTIONS,
                transition: lightbox.slideshowTransition,
                transitionOptions: GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
                onPlayingChange: lightbox.setSlideshowPlaying,
                onIntervalChange: intervalMs =>
                  lightbox.setSlideshowIntervalMs(intervalMs as GallerySlideshowIntervalMs),
                onTransitionChange: lightbox.setSlideshowTransition,
                fullscreen: lightbox.slideshowFullscreen,
                onFullscreenChange: lightbox.setSlideshowFullscreen,
              }
            : undefined
        }
      />
    </>
  );
}
