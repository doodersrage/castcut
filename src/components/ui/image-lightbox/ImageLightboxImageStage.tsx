'use client';

import {
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import ImageLightboxSlide from '@/components/ui/image-lightbox/ImageLightboxSlide';
import type { GalleryLightboxFit } from '@/lib/gallery/lightbox-prefs';
import type { ComfyOutputMediaKind } from '@/lib/comfyui/outputs';
import type { ImageLightboxSlideChrome } from '@/components/ui/image-lightbox/types';

type ImageLightboxImageStageProps = {
  stageClassName: string;
  stageRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  onStagePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStageTouchStart: (event: ReactTouchEvent<HTMLDivElement>) => void;
  onStageTouchMove: (event: ReactTouchEvent<HTMLDivElement>) => void;
  onStageTouchEnd: () => void;
  dualMode: boolean;
  dualIndex: number | null;
  images: string[];
  displayIndex: number;
  currentUrl: string;
  currentMediaKind: ComfyOutputMediaKind;
  currentThumbUrl?: string;
  imageClassName: string;
  previousIndex: number | null;
  previousMediaKind: ComfyOutputMediaKind;
  enterClass: string;
  exitClass: string;
  mediaKinds?: ComfyOutputMediaKind[];
  thumbImages?: string[];
  fitMode: GalleryLightboxFit;
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

export default function ImageLightboxImageStage({
  stageClassName,
  stageRef,
  zoom,
  onStagePointerDown,
  onStagePointerMove,
  onStagePointerUp,
  onStageTouchStart,
  onStageTouchMove,
  onStageTouchEnd,
  dualMode,
  dualIndex,
  images,
  displayIndex,
  currentUrl,
  currentMediaKind,
  currentThumbUrl,
  imageClassName,
  previousIndex,
  previousMediaKind,
  enterClass,
  exitClass,
  mediaKinds,
  thumbImages,
  fitMode,
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
}: ImageLightboxImageStageProps) {
  const slideProps = {
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
  };

  return (
    <div
      ref={stageRef}
      className={`relative min-h-0 touch-pan-y overflow-hidden ${stageClassName} ${
        zoom > 1 ? 'cursor-grab' : ''
      }`}
      onPointerDown={onStagePointerDown}
      onPointerMove={onStagePointerMove}
      onPointerUp={onStagePointerUp}
      onPointerCancel={onStagePointerUp}
      onTouchStart={onStageTouchStart}
      onTouchMove={onStageTouchMove}
      onTouchEnd={onStageTouchEnd}
      onTouchCancel={onStageTouchEnd}
    >
      <div className="relative flex h-full min-h-0 w-full items-center justify-center">
        {dualMode && dualIndex != null && images[dualIndex] ? (
          <div className="grid h-full min-h-0 w-full grid-cols-2 gap-2 p-1">
            <ImageLightboxSlide
              url={currentUrl}
              kind={currentMediaKind}
              className={`relative ${imageClassName} min-h-0`}
              slideKey={`dual-left-${displayIndex}`}
              options={{ isCurrent: true, placeholderUrl: currentThumbUrl }}
              {...slideProps}
            />
            <ImageLightboxSlide
              url={images[dualIndex]}
              kind={mediaKinds?.[dualIndex] ?? 'image'}
              className={`relative ${imageClassName} min-h-0`}
              slideKey={`dual-right-${dualIndex}`}
              options={{ placeholderUrl: thumbImages?.[dualIndex] }}
              {...slideProps}
            />
          </div>
        ) : previousIndex !== null && images[previousIndex] ? (
          <>
            <ImageLightboxSlide
              url={images[previousIndex]}
              kind={previousMediaKind}
              className={`absolute inset-0 m-auto flex max-h-full max-w-full items-center justify-center ${exitClass}`}
              slideKey="previous-slide"
              options={{ ariaHidden: true }}
              {...slideProps}
            />
            <ImageLightboxSlide
              url={currentUrl}
              kind={currentMediaKind}
              className={`relative z-[1] ${imageClassName} ${enterClass}`}
              slideKey={`current-slide-${displayIndex}`}
              options={{ isCurrent: true, placeholderUrl: currentThumbUrl }}
              {...slideProps}
            />
          </>
        ) : (
          <ImageLightboxSlide
            url={currentUrl}
            kind={currentMediaKind}
            className={`relative ${imageClassName}`}
            slideKey={`solo-slide-${displayIndex}`}
            options={{ isCurrent: true, placeholderUrl: currentThumbUrl }}
            {...slideProps}
          />
        )}
      </div>
    </div>
  );
}
