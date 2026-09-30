'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  formatGallerySlideshowInterval,
  GALLERY_SLIDESHOW_TRANSITION_LABELS,
  type GallerySlideshowTransition,
} from '@/lib/comfyui-gallery';
import type { ImageLightboxSlideshowOptions } from '@/components/ui/image-lightbox/types';

type ImageLightboxSlideshowControlsProps = {
  compact?: boolean;
  slideshowEnabled: boolean;
  slideshow?: ImageLightboxSlideshowOptions;
  transition: GallerySlideshowTransition;
  transitionOptions: readonly GallerySlideshowTransition[];
  isFullscreen: boolean;
  onPauseSlideshow: () => void;
  onToggleFullscreen: () => void;
};

export default function ImageLightboxSlideshowControls({
  compact = false,
  slideshowEnabled,
  slideshow,
  transition,
  transitionOptions,
  isFullscreen,
  onPauseSlideshow,
  onToggleFullscreen,
}: ImageLightboxSlideshowControlsProps) {
  // Hooks before the early return.
  const [open, setOpen] = useState(false);
  if (!slideshowEnabled) {
    return null;
  }

  // Inline lightbox: one "Slideshow" button — Play / interval / effect / fullscreen took a row
  // beside the rating controls on every image. Fullscreen (compact) keeps them all visible.
  if (!compact && !open && !slideshow?.playing) {
    return (
      <Button
        variant="secondary"
        className="!min-h-9 px-3 type-caption"
        data-testid="lightbox-slideshow-open"
        onClick={() => setOpen(true)}
      >
        Slideshow
      </Button>
    );
  }

  return (
    <>
      <Button
        variant={compact ? 'ghost' : 'secondary'}
        className={`${compact ? '!min-h-8 !text-white hover:!bg-white/10' : '!min-h-9'} px-3 type-caption`}
        onClick={() => slideshow?.onPlayingChange(!slideshow.playing)}
      >
        {slideshow?.playing ? 'Pause' : 'Play'}
      </Button>
      {slideshow?.onIntervalChange &&
      slideshow.intervalOptions &&
      slideshow.intervalOptions.length > 0 ? (
        <label
          className={`flex items-center gap-2 type-caption ${compact ? 'text-white/70' : 'text-[var(--text-tertiary)]'}`}
        >
          Every
          <select
            value={slideshow.intervalMs}
            onChange={event => {
              onPauseSlideshow();
              slideshow.onIntervalChange?.(Number(event.target.value));
            }}
            className={
              compact
                ? 'rounded-md border border-white/15 bg-black/40 px-2 py-1 text-white'
                : 'rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[var(--text-secondary)]'
            }
          >
            {slideshow.intervalOptions.map(option => (
              <option key={option} value={option}>
                {formatGallerySlideshowInterval(option)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {slideshow?.onTransitionChange && transitionOptions.length > 0 ? (
        <label
          className={`flex items-center gap-2 type-caption ${compact ? 'text-white/70' : 'text-[var(--text-tertiary)]'}`}
        >
          Effect
          <select
            value={transition}
            onChange={event => {
              onPauseSlideshow();
              slideshow.onTransitionChange?.(event.target.value as GallerySlideshowTransition);
            }}
            className={
              compact
                ? 'rounded-md border border-white/15 bg-black/40 px-2 py-1 text-white'
                : 'rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[var(--text-secondary)]'
            }
          >
            {transitionOptions.map(option => (
              <option key={option} value={option}>
                {GALLERY_SLIDESHOW_TRANSITION_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {slideshow?.onFullscreenChange ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={`${compact ? '!min-h-8 !text-white hover:!bg-white/10' : '!min-h-9'} px-3 type-caption`}
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </Button>
      ) : null}
    </>
  );
}
