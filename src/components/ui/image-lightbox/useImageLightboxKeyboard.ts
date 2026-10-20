import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { isStillLightboxKind } from '@/lib/comfyui/outputs';
import type { ComfyOutputMediaKind } from '@/lib/comfyui/outputs';
import type { GalleryLightboxFit } from '@/lib/gallery/lightbox-prefs';
import type {
  ImageLightboxSlideChrome,
  ImageLightboxSlideshowOptions,
} from '@/components/ui/image-lightbox/types';

export type UseImageLightboxKeyboardOptions = {
  open: boolean;
  index: number;
  imagesLength: number;
  onClose: () => void;
  onDownloadImage?: (index: number) => Promise<void>;
  slideshow?: ImageLightboxSlideshowOptions;
  slideshowEnabled: boolean;
  isFullscreen: boolean;
  exitFullscreenPresentation: () => void;
  toggleFullscreenPresentation: () => void;
  zoom: number;
  resetZoom: () => void;
  toggleZoom: () => void;
  slideChrome?: ImageLightboxSlideChrome | null;
  mediaKinds?: ComfyOutputMediaKind[];
  goToIndex: (nextIndex: number, manual?: boolean) => void;
  helpOpen: boolean;
  metaOpen: boolean;
  loadHistogram: () => Promise<void>;
  histogramOpen: boolean;
  chromeCompact: boolean;
  hasDistinctFullRes: boolean;
  setHelpOpen: Dispatch<SetStateAction<boolean>>;
  setMetaOpen: Dispatch<SetStateAction<boolean>>;
  setFitMode: Dispatch<SetStateAction<GalleryLightboxFit>>;
  setBaOpen: Dispatch<SetStateAction<boolean>>;
  setDualMode: Dispatch<SetStateAction<boolean>>;
  setDualIndex: Dispatch<SetStateAction<number | null>>;
  setHistogramOpen: Dispatch<SetStateAction<boolean>>;
  setActionsOpen: Dispatch<SetStateAction<boolean>>;
  setChromeCompact: Dispatch<SetStateAction<boolean>>;
  setPreferFullRes: Dispatch<SetStateAction<boolean>>;
  setFullResLoading: Dispatch<SetStateAction<boolean>>;
  setCurrentImageLoaded: Dispatch<SetStateAction<boolean>>;
};

export function useImageLightboxKeyboard(options: UseImageLightboxKeyboardOptions): void {
  const {
    open,
    index,
    imagesLength,
    onClose,
    onDownloadImage,
    slideshow,
    slideshowEnabled,
    isFullscreen,
    exitFullscreenPresentation,
    toggleFullscreenPresentation,
    zoom,
    resetZoom,
    toggleZoom,
    slideChrome,
    mediaKinds,
    goToIndex,
    helpOpen,
    metaOpen,
    loadHistogram,
    histogramOpen,
    chromeCompact,
    hasDistinctFullRes,
    setHelpOpen,
    setMetaOpen,
    setFitMode,
    setBaOpen,
    setDualMode,
    setDualIndex,
    setHistogramOpen,
    setActionsOpen,
    setChromeCompact,
    setPreferFullRes,
    setFullResLoading,
    setCurrentImageLoaded,
  } = options;

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === 'Escape') {
        if (helpOpen) {
          event.preventDefault();
          setHelpOpen(false);
          return;
        }
        if (metaOpen) {
          event.preventDefault();
          setMetaOpen(false);
          return;
        }
        if (zoom > 1) {
          event.preventDefault();
          resetZoom();
          return;
        }
        if (isFullscreen) {
          exitFullscreenPresentation();
          return;
        }
        onClose();
        return;
      }

      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault();
        setHelpOpen(previous => !previous);
        return;
      }

      if ((event.key === 'm' || event.key === 'M') && slideChrome?.meta) {
        event.preventDefault();
        setMetaOpen(previous => !previous);
        return;
      }

      if (event.key === 'v' || event.key === 'V') {
        event.preventDefault();
        setFitMode(previous =>
          previous === 'contain' ? 'cover' : previous === 'cover' ? 'actual' : 'contain'
        );
        return;
      }

      if (
        (event.key === 'x' || event.key === 'X') &&
        slideChrome?.beforeAfterUrl &&
        isStillLightboxKind(mediaKinds?.[index])
      ) {
        event.preventDefault();
        setBaOpen(previous => !previous);
        setDualMode(false);
        return;
      }

      if ((event.key === 'y' || event.key === 'Y') && imagesLength > 1) {
        event.preventDefault();
        setDualMode(previous => {
          const next = !previous;
          if (!next) {
            setDualIndex(null);
          } else {
            setBaOpen(false);
            const fallback = index < imagesLength - 1 ? index + 1 : Math.max(0, index - 1);
            setDualIndex(previousDual =>
              previousDual != null && previousDual !== index ? previousDual : fallback
            );
          }
          return next;
        });
        return;
      }

      if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        if (histogramOpen) {
          setHistogramOpen(false);
        } else {
          void loadHistogram();
        }
        return;
      }

      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        if (chromeCompact) {
          setActionsOpen(previous => !previous);
        } else {
          setChromeCompact(true);
          setActionsOpen(true);
        }
        return;
      }

      if ((event.key === 'o' || event.key === 'O') && hasDistinctFullRes) {
        event.preventDefault();
        setPreferFullRes(previous => {
          const next = !previous;
          if (next) {
            setFullResLoading(true);
            setCurrentImageLoaded(false);
          }
          return next;
        });
        return;
      }

      if (slideshowEnabled && (event.key === ' ' || event.key === 'Spacebar')) {
        event.preventDefault();
        slideshow?.onPlayingChange(!slideshow.playing);
        return;
      }

      if (slideshowEnabled && (event.key === 'f' || event.key === 'F') && !event.shiftKey) {
        event.preventDefault();
        toggleFullscreenPresentation();
        return;
      }

      if ((event.key === 'd' || event.key === 'D') && onDownloadImage) {
        event.preventDefault();
        void onDownloadImage(index);
        return;
      }

      if ((event.key === 'z' || event.key === 'Z') && isStillLightboxKind(mediaKinds?.[index])) {
        event.preventDefault();
        toggleZoom();
        return;
      }

      if (
        (event.key === 'b' ||
          event.key === 'B' ||
          (event.shiftKey && (event.key === 'f' || event.key === 'F'))) &&
        slideChrome?.onToggleFavorite
      ) {
        event.preventDefault();
        slideChrome.onToggleFavorite();
        return;
      }

      if (event.key >= '1' && event.key <= '5' && slideChrome?.onRate) {
        event.preventDefault();
        slideChrome.onRate(Number(event.key) as 1 | 2 | 3 | 4 | 5);
        return;
      }

      if (
        (event.key === 'i' || event.key === 'I') &&
        slideChrome?.onImprove &&
        slideChrome.showImprove !== false
      ) {
        event.preventDefault();
        slideChrome.onImprove();
        return;
      }

      if (
        (event.key === 'c' || event.key === 'C') &&
        slideChrome?.onCompose &&
        slideChrome.showCompose !== false
      ) {
        event.preventDefault();
        slideChrome.onCompose();
        return;
      }

      if (
        (event.key === 'u' || event.key === 'U') &&
        slideChrome?.onUseStack &&
        slideChrome.showUseStack !== false
      ) {
        event.preventDefault();
        slideChrome.onUseStack();
        return;
      }

      if (
        (event.key === 'l' || event.key === 'L') &&
        slideChrome?.onUseFace &&
        slideChrome.showUseFace !== false
      ) {
        event.preventDefault();
        slideChrome.onUseFace();
        return;
      }

      if ((event.key === 'a' || event.key === 'A') && slideChrome?.onAddToCompare) {
        event.preventDefault();
        slideChrome.onAddToCompare();
        return;
      }

      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        slideChrome?.onRemove &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        slideChrome.onRemove();
        return;
      }

      if ((event.key === 'p' || event.key === 'P') && slideChrome?.onShowParent) {
        event.preventDefault();
        slideChrome.onShowParent();
        return;
      }

      if ((event.key === 'g' || event.key === 'G') && slideChrome?.onShowDerivatives) {
        event.preventDefault();
        slideChrome.onShowDerivatives();
        return;
      }

      if ((event.key === 's' || event.key === 'S') && slideChrome?.onJumpToSibling) {
        event.preventDefault();
        slideChrome.onJumpToSibling();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const prevIndex = index > 0 ? index - 1 : slideshow?.playing ? imagesLength - 1 : index;
        if (prevIndex !== index) {
          goToIndex(prevIndex, !slideshow?.playing);
        }
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const nextIndex = index < imagesLength - 1 ? index + 1 : slideshow?.playing ? 0 : index;
        if (nextIndex !== index) {
          goToIndex(nextIndex, !slideshow?.playing);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [
    open,
    index,
    imagesLength,
    onClose,
    onDownloadImage,
    slideshow,
    slideshowEnabled,
    isFullscreen,
    exitFullscreenPresentation,
    toggleFullscreenPresentation,
    zoom,
    resetZoom,
    toggleZoom,
    slideChrome,
    mediaKinds,
    goToIndex,
    helpOpen,
    metaOpen,
    loadHistogram,
    histogramOpen,
    chromeCompact,
    hasDistinctFullRes,
    setHelpOpen,
    setMetaOpen,
    setFitMode,
    setBaOpen,
    setDualMode,
    setDualIndex,
    setHistogramOpen,
    setActionsOpen,
    setChromeCompact,
    setPreferFullRes,
    setFullResLoading,
    setCurrentImageLoaded,
  ]);
}
