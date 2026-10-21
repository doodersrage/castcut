'use client';

import GalleryKindPreview from '@/components/ui/GalleryKindPreview';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/gallery/comfyui-gallery';

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
  return (
    <button
      type="button"
      onClick={() => {
        if (pickMode && pickable && onPick) {
          onPick();
          return;
        }
        onOpenImage(playbackIndex);
      }}
      onPointerEnter={() => onPrefetchImage?.(playbackIndex)}
      onFocus={() => onPrefetchImage?.(playbackIndex)}
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
          src={previewUrl}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
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
      {isVideoHero ? (
        <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-white/15 bg-black/55 px-1.5 py-0.5 text-4xs font-medium uppercase tracking-wide text-white/85 backdrop-blur-sm">
          Video
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
    </button>
  );
}
