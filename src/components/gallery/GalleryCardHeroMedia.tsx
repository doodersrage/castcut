'use client';

import GalleryKindPreview from '@/components/ui/GalleryKindPreview';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/gallery/comfyui-gallery';
import { Button } from '@/components/ui/Button';
import { useRef, useState } from 'react';

/** 0:05, 1:12. */
function clipLength(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

type Props = {
  entry: ComfyGalleryEntry;
  layout: GalleryLayoutMode;
  previewUrl: string;
  playbackIndex: number;
  primaryMediaKind: ReturnType<
    typeof import('@/lib/gallery/comfyui-gallery').galleryEntryPrimaryMediaKind
  >;
  lqipUrl: string | null;
  showHtmlVideo: boolean;
  isVideoHero: boolean;
  heroSrcSet: string | null;
  heroLoaded: boolean;
  setHeroLoaded: (loaded: boolean) => void;
  setHeroVideoFailed: (failed: boolean) => void;
  pickMode: boolean;
  pickable: boolean;
  pickLabel: string;
  onPick?: () => void;
  onOpenImage: (index: number) => void;
  onPrefetchImage?: (index: number) => void;
};

export function GalleryCardHeroMedia({
  entry,
  layout,
  previewUrl,
  playbackIndex,
  primaryMediaKind,
  lqipUrl,
  showHtmlVideo,
  isVideoHero,
  heroSrcSet,
  heroLoaded,
  setHeroLoaded,
  setHeroVideoFailed,
  pickMode,
  pickable,
  pickLabel,
  onPick,
  onOpenImage,
  onPrefetchImage,
}: Props) {
  // A clip plays while the pointer is on it (2026-11-05): every clip in the grid looped at once.
  const videoRef = useRef<HTMLVideoElement>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const isFilm = entry.derivedKind === 'film';
  const play = () => {
    const video = videoRef.current;
    if (video && video.paused) void video.play().catch(() => undefined);
  };
  const stop = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0.1;
  };
  return (
    <Button
      variant="plain"
      type="button"
      onClick={() => {
        if (pickMode && pickable && onPick) {
          onPick();
          return;
        }
        onOpenImage(playbackIndex);
      }}
      onPointerEnter={() => {
        onPrefetchImage?.(playbackIndex);
        play();
      }}
      onPointerLeave={stop}
      onFocus={() => {
        onPrefetchImage?.(playbackIndex);
        play();
      }}
      onBlur={stop}
      onPointerDown={() => onPrefetchImage?.(playbackIndex)}
      className={`relative block h-full w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] ${
        pickMode && pickable ? 'cursor-pointer' : 'cursor-zoom-in'
      }`}
      aria-label={
        pickMode && pickable
          ? pickLabel
          : primaryMediaKind === 'audio'
            ? 'Open audio preview'
            : primaryMediaKind === 'mesh'
              ? 'Open 3D file'
              : primaryMediaKind === 'video'
                ? 'Open clip preview'
                : 'Open image preview'
      }
      disabled={pickMode && !pickable}
    >
      {lqipUrl && primaryMediaKind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={lqipUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-80 blur-xl"
        />
      ) : null}
      {showHtmlVideo ? (
        <video
          ref={videoRef}
          src={previewUrl.includes('#') ? previewUrl : `${previewUrl}#t=0.1`}
          loop
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={event => {
            const length = event.currentTarget.duration;
            if (Number.isFinite(length) && length > 0) setSeconds(length);
          }}
          poster={lqipUrl ?? undefined}
          onLoadedData={() => setHeroLoaded(true)}
          onError={() => setHeroVideoFailed(true)}
          className="relative h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.02]"
        />
      ) : primaryMediaKind === 'audio' || primaryMediaKind === 'mesh' ? (
        <GalleryKindPreview
          kind={primaryMediaKind}
          src={previewUrl}
          filename={entry.images[playbackIndex]?.filename}
          className="relative h-full w-full"
          alt={entry.prompt.slice(0, 80)}
        />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={previewUrl}
          srcSet={isVideoHero ? undefined : (heroSrcSet ?? undefined)}
          alt={entry.prompt.slice(0, 80)}
          loading="lazy"
          decoding="async"
          sizes={
            isVideoHero
              ? undefined
              : layout === 'list'
                ? '9rem'
                : layout === 'dense'
                  ? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw'
                  : '(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw'
          }
          onLoad={() => setHeroLoaded(true)}
          className={`relative h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.02] ${
            isVideoHero || heroLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
      {showHtmlVideo || isVideoHero ? (
        // A clip says so, and how long; a film is marked as one.
        <span
          className="pointer-events-none absolute bottom-2 right-2 rounded-full border border-white/15 bg-black/60 px-1.5 py-0.5 text-3xs font-medium text-white/90 backdrop-blur-sm"
          data-testid="gallery-card-clip-badge"
        >
          {isFilm ? 'Film' : '▶'}
          {seconds ? ` ${clipLength(seconds)}` : ''}
        </span>
      ) : primaryMediaKind === 'audio' ? (
        <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-white/15 bg-black/55 px-1.5 py-0.5 text-4xs font-medium uppercase tracking-wide text-white/85 backdrop-blur-sm">
          Audio
        </span>
      ) : primaryMediaKind === 'mesh' ? (
        <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-white/15 bg-black/55 px-1.5 py-0.5 text-4xs font-medium uppercase tracking-wide text-white/85 backdrop-blur-sm">
          3D
        </span>
      ) : null}
    </Button>
  );
}
