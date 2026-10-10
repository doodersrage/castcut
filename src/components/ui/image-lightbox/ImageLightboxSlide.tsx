'use client';

import { type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react';
import GalleryKindPreview from '@/components/ui/GalleryKindPreview';
import type { GalleryLightboxFit } from '@/lib/gallery-lightbox-prefs';
import type { ComfyOutputMediaKind } from '@/lib/comfyui-outputs';
import { shouldUseHtmlVideoElement, stripGalleryViewWidthParam } from '@/lib/comfyui-outputs';
import type { ImageLightboxSlideChrome } from '@/components/ui/image-lightbox/types';

export type ImageLightboxSlideOptions = {
  ariaHidden?: boolean;
  isCurrent?: boolean;
  placeholderUrl?: string;
};

export type ImageLightboxSlideProps = {
  url: string;
  kind: ComfyOutputMediaKind;
  className: string;
  slideKey: string;
  options?: ImageLightboxSlideOptions;
  fitMode: GalleryLightboxFit;
  zoom: number;
  pan: { x: number; y: number };
  dragging: boolean;
  currentTitle?: string;
  baOpen: boolean;
  baPosition: number;
  slideChrome?: ImageLightboxSlideChrome | null;
  currentImageLoaded: boolean;
  preferFullRes: boolean;
  downloadFilename?: string;
  htmlVideoFailed: Record<string, boolean>;
  onHtmlVideoFailedChange: Dispatch<SetStateAction<Record<string, boolean>>>;
  onCurrentImageLoadedChange: (loaded: boolean) => void;
  onFullResLoadingChange: (loading: boolean) => void;
  onBaPositionChange: (position: number) => void;
  onStopStagePointer: (event: ReactPointerEvent<HTMLElement>) => void;
};

export default function ImageLightboxSlide({
  url,
  kind,
  className,
  slideKey,
  options,
  fitMode,
  zoom,
  pan,
  dragging,
  currentTitle,
  baOpen,
  baPosition,
  slideChrome,
  currentImageLoaded,
  preferFullRes,
  downloadFilename,
  htmlVideoFailed,
  onHtmlVideoFailedChange,
  onCurrentImageLoadedChange,
  onFullResLoadingChange,
  onBaPositionChange,
  onStopStagePointer,
}: ImageLightboxSlideProps) {
  const ariaHidden = options?.ariaHidden ?? false;
  const isCurrent = options?.isCurrent ?? false;

  if (kind === 'audio' || kind === 'mesh') {
    return (
      <div key={slideKey} className={className}>
        <GalleryKindPreview
          kind={kind}
          src={stripGalleryViewWidthParam(url)}
          filename={isCurrent ? downloadFilename : undefined}
          className="max-h-[var(--lightbox-image-max-h,calc(96vh-6.5rem))] w-full max-w-lg"
          controls={!ariaHidden}
        />
      </div>
    );
  }

  if (kind === 'video') {
    const fullUrl = stripGalleryViewWidthParam(url);
    const videoSrc = shouldUseHtmlVideoElement(kind, url)
      ? url
      : shouldUseHtmlVideoElement(kind, fullUrl)
        ? fullUrl
        : '';
    const playHtmlVideo = Boolean(videoSrc) && !htmlVideoFailed[fullUrl];
    const mediaClass =
      'max-h-[var(--lightbox-image-max-h,calc(96vh-6.5rem))] max-w-full object-contain';
    return (
      <div key={slideKey} className={className}>
        {playHtmlVideo ? (
          <video
            src={videoSrc}
            className={mediaClass}
            aria-hidden={ariaHidden || undefined}
            autoPlay={!ariaHidden}
            loop
            // The open clip plays with its sound (talking clips); the slides beside it stay quiet.
            muted={Boolean(ariaHidden)}
            playsInline
            controls={!ariaHidden}
            onError={() => {
              onHtmlVideoFailedChange(previous =>
                previous[fullUrl] ? previous : { ...previous, [fullUrl]: true }
              );
            }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fullUrl} alt="" className={mediaClass} aria-hidden={ariaHidden || undefined} />
        )}
      </div>
    );
  }

  const showPlaceholder =
    isCurrent &&
    Boolean(options?.placeholderUrl) &&
    options?.placeholderUrl !== url &&
    !currentImageLoaded;
  const fitClass =
    fitMode === 'cover' ? 'object-cover' : fitMode === 'actual' ? 'object-none' : 'object-contain';
  const sizeClass =
    fitMode === 'actual'
      ? 'max-h-none max-w-none'
      : 'max-h-[var(--lightbox-image-max-h,calc(96vh-6.5rem))] max-w-full';
  const beforeUrl =
    isCurrent && baOpen && slideChrome?.beforeAfterUrl ? slideChrome.beforeAfterUrl : null;

  return (
    <div key={slideKey} className={className}>
      {showPlaceholder ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={options!.placeholderUrl}
          alt=""
          aria-hidden
          decoding="async"
          className={`absolute inset-0 m-auto ${sizeClass} ${fitClass} opacity-90 blur-sm scale-[1.02]`}
        />
      ) : null}
      {beforeUrl ? (
        <div
          className="relative z-[1] inline-block max-w-full"
          style={
            zoom > 1
              ? {
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                }
              : undefined
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={ariaHidden ? '' : (currentTitle ?? 'Gallery image preview')}
            className={`block ${sizeClass} ${fitClass}`}
            onLoad={() => {
              onCurrentImageLoadedChange(true);
              if (preferFullRes) {
                onFullResLoadingChange(false);
              }
            }}
          />
          <div
            className="absolute inset-0 overflow-hidden border-r-2 border-white/80"
            style={{ width: `${baPosition}%` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={beforeUrl}
              alt=""
              aria-hidden
              className={`absolute left-0 top-0 h-full max-w-none ${fitClass}`}
              style={{ width: `${(100 / Math.max(baPosition, 1)) * 100}%` }}
            />
          </div>
          <label className="absolute inset-x-4 bottom-3 z-[2] flex items-center gap-3 rounded-full bg-black/55 px-3 py-1.5 text-[11px] text-white/85 backdrop-blur-md">
            <span className="shrink-0">{slideChrome?.beforeAfterLabel ?? 'Before'} / After</span>
            <input
              type="range"
              min={5}
              max={95}
              value={baPosition}
              onChange={event => onBaPositionChange(Number(event.target.value))}
              className="w-full accent-[var(--accent)]"
              aria-label="Before after wipe position"
              onPointerDown={onStopStagePointer}
            />
          </label>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={ariaHidden ? '' : (currentTitle ?? 'Gallery image preview')}
          aria-hidden={ariaHidden || undefined}
          decoding={isCurrent ? 'sync' : 'async'}
          fetchPriority={isCurrent ? 'high' : 'auto'}
          ref={
            isCurrent
              ? el => {
                  if (el?.complete && el.naturalWidth > 0) {
                    onCurrentImageLoadedChange(true);
                  }
                }
              : undefined
          }
          onLoad={
            isCurrent
              ? () => {
                  onCurrentImageLoadedChange(true);
                  if (preferFullRes) {
                    onFullResLoadingChange(false);
                  }
                }
              : undefined
          }
          className={`relative z-[1] ${sizeClass} ${fitClass} transition-opacity duration-200 ${
            isCurrent && !currentImageLoaded && options?.placeholderUrl
              ? 'opacity-0'
              : 'opacity-100'
          }`}
          style={
            isCurrent && zoom > 1
              ? {
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  cursor: dragging ? 'grabbing' : 'grab',
                  maxHeight: 'none',
                  maxWidth: 'none',
                  height: 'min(var(--lightbox-image-max-h, calc(96vh - 6.5rem)), 100%)',
                }
              : isCurrent
                ? { cursor: 'zoom-in' }
                : undefined
          }
        />
      )}
    </div>
  );
}
