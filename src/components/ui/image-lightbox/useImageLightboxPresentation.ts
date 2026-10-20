'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
  resolveGallerySlideshowTransitionMs,
} from '@/lib/gallery/comfyui-gallery';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  isStillLightboxKind,
  shouldUseHtmlVideoElement,
  stripGalleryViewWidthParam,
} from '@/lib/comfyui/outputs';
import { prefetchGalleryImageUrl } from '@/lib/gallery/image-prefetch';
import {
  loadGalleryLightboxUiPreferences,
  saveGalleryLightboxUiPreferences,
  type GalleryLightboxFit,
} from '@/lib/gallery/lightbox-prefs';
import { computeLightboxHistogram, type LightboxHistogram } from '@/lib/lightbox-histogram';
import { resolveSlideDirection } from '@/components/ui/image-lightbox/imageLightboxTransitions';
import type {
  ImageLightboxSlideshowOptions,
  ImageLightboxState,
} from '@/components/ui/image-lightbox/types';

type UseImageLightboxPresentationArgs = {
  state: ImageLightboxState | null;
  slideshow?: ImageLightboxSlideshowOptions;
  onIndexChange: (index: number) => void;
  slideNote?: string;
};

export type ImageLightboxPresentation = {
  mounted: boolean;
  open: boolean;
  images: string[];
  index: number;
  displayIndex: number;
  previousIndex: number | null;
  slideDirection: 1 | -1;
  titleAnimating: boolean;
  currentImageLoaded: boolean;
  setCurrentImageLoaded: Dispatch<SetStateAction<boolean>>;
  metaOpen: boolean;
  setMetaOpen: Dispatch<SetStateAction<boolean>>;
  helpOpen: boolean;
  setHelpOpen: Dispatch<SetStateAction<boolean>>;
  copyFlash: string | null;
  fitMode: GalleryLightboxFit;
  setFitMode: Dispatch<SetStateAction<GalleryLightboxFit>>;
  chromeCompact: boolean;
  setChromeCompact: Dispatch<SetStateAction<boolean>>;
  actionsOpen: boolean;
  setActionsOpen: Dispatch<SetStateAction<boolean>>;
  baOpen: boolean;
  setBaOpen: Dispatch<SetStateAction<boolean>>;
  baPosition: number;
  setBaPosition: Dispatch<SetStateAction<number>>;
  dualMode: boolean;
  setDualMode: Dispatch<SetStateAction<boolean>>;
  dualIndex: number | null;
  setDualIndex: Dispatch<SetStateAction<number | null>>;
  moreOpen: boolean;
  setMoreOpen: Dispatch<SetStateAction<boolean>>;
  tutorialVisible: boolean;
  setTutorialVisible: Dispatch<SetStateAction<boolean>>;
  preferFullRes: boolean;
  setPreferFullRes: Dispatch<SetStateAction<boolean>>;
  fullResLoading: boolean;
  setFullResLoading: Dispatch<SetStateAction<boolean>>;
  histogram: LightboxHistogram | null;
  histogramOpen: boolean;
  setHistogramOpen: Dispatch<SetStateAction<boolean>>;
  histogramError: string | null;
  htmlVideoFailed: Record<string, boolean>;
  setHtmlVideoFailed: Dispatch<SetStateAction<Record<string, boolean>>>;
  histogramLoading: boolean;
  noteDraft: string;
  setNoteDraft: Dispatch<SetStateAction<string>>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  midResUrl: string | undefined;
  currentThumbUrl: string | undefined;
  currentOriginalUrl: string | undefined;
  hasDistinctFullRes: boolean;
  currentKind: import('@/lib/comfyui/outputs').ComfyOutputMediaKind;
  playInlineVideo: boolean;
  currentUrl: string;
  currentDownloadUrl: string | undefined;
  currentTitle: string | undefined;
  canGoPrevious: boolean;
  canGoNext: boolean;
  slideshowEnabled: boolean;
  isFullscreen: boolean;
  isTransitioning: boolean;
  transition: NonNullable<ImageLightboxSlideshowOptions['transition']>;
  transitionMs: number;
  transitionOptions: readonly NonNullable<ImageLightboxSlideshowOptions['transition']>[];
  pauseSlideshow: () => void;
  exitFullscreenPresentation: () => void;
  enterFullscreenPresentation: () => void;
  toggleFullscreenPresentation: () => void;
  flashCopy: (label: string) => void;
  loadHistogram: () => Promise<void>;
};

export function useImageLightboxPresentation({
  state,
  slideshow,
  onIndexChange,
  slideNote,
}: UseImageLightboxPresentationArgs): ImageLightboxPresentation {
  const [mounted, setMounted] = useState(false);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);
  const [titleAnimating, setTitleAnimating] = useState(false);
  const [currentImageLoaded, setCurrentImageLoaded] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copyFlash, setCopyFlash] = useState<string | null>(null);
  const [fitMode, setFitMode] = useState<GalleryLightboxFit>('contain');
  const [chromeCompact, setChromeCompact] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [baOpen, setBaOpen] = useState(false);
  const [baPosition, setBaPosition] = useState(50);
  const [dualMode, setDualMode] = useState(false);
  const [dualIndex, setDualIndex] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [preferFullRes, setPreferFullRes] = useState(false);
  const [fullResLoading, setFullResLoading] = useState(false);
  const [histogram, setHistogram] = useState<LightboxHistogram | null>(null);
  const [histogramOpen, setHistogramOpen] = useState(false);
  const [histogramError, setHistogramError] = useState<string | null>(null);
  const [htmlVideoFailed, setHtmlVideoFailed] = useState<Record<string, boolean>>({});
  const [histogramLoading, setHistogramLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const prefsHydratedRef = useRef(false);
  const playlistKeyRef = useRef('');
  const containerRef = useRef<HTMLDivElement>(null);

  const open = Boolean(state && state.images.length > 0);
  const images = useMemo(() => state?.images ?? [], [state?.images]);
  const index = state?.index ?? 0;
  const transition = slideshow?.transition ?? 'slide';
  const transitionMs = resolveGallerySlideshowTransitionMs(transition);
  const midResUrl = images[displayIndex] ?? images[0];
  const currentThumbUrl =
    state?.thumbImages?.[displayIndex] ?? state?.thumbImages?.[0] ?? undefined;
  const currentOriginalUrl = (() => {
    const candidate =
      state?.originalImages?.[displayIndex] ?? state?.originalImages?.[0] ?? midResUrl;
    if (!candidate) {
      return undefined;
    }
    return stripGalleryViewWidthParam(candidate);
  })();
  const hasDistinctFullRes = Boolean(
    currentOriginalUrl && midResUrl && currentOriginalUrl !== midResUrl
  );
  const currentKind = state?.mediaKinds?.[displayIndex] ?? 'image';
  const playInlineVideo = shouldUseHtmlVideoElement(
    currentKind,
    currentOriginalUrl ?? midResUrl ?? ''
  );
  const currentUrl =
    (preferFullRes || playInlineVideo || !isStillLightboxKind(currentKind)) && currentOriginalUrl
      ? currentOriginalUrl
      : (midResUrl ?? '');
  const currentDownloadUrl = state?.downloadUrls?.[displayIndex] ?? undefined;
  const currentTitle = state?.titles?.[displayIndex] ?? state?.title;
  const canGoPrevious = index > 0;
  const canGoNext = index < images.length - 1;
  const slideshowEnabled = Boolean(slideshow && images.length > 1);
  const isFullscreen = Boolean(slideshow?.fullscreen);
  const isTransitioning = previousIndex !== null && transitionMs > 0;
  const transitionOptions = slideshow?.transitionOptions ?? GALLERY_SLIDESHOW_TRANSITION_OPTIONS;

  const pauseSlideshow = useCallback(() => {
    if (slideshow?.playing) {
      slideshow.onPlayingChange(false);
    }
  }, [slideshow]);

  const exitFullscreenPresentation = useCallback(() => {
    if (document.fullscreenElement === containerRef.current) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
    slideshow?.onFullscreenChange?.(false);
  }, [slideshow]);

  const enterFullscreenPresentation = useCallback(() => {
    slideshow?.onFullscreenChange?.(true);
    const element = containerRef.current;
    if (element?.requestFullscreen) {
      void element.requestFullscreen().catch(() => undefined);
    }
  }, [slideshow]);

  const toggleFullscreenPresentation = useCallback(() => {
    if (isFullscreen) {
      exitFullscreenPresentation();
      return;
    }
    enterFullscreenPresentation();
  }, [enterFullscreenPresentation, exitFullscreenPresentation, isFullscreen]);

  const flashCopy = useCallback((label: string) => {
    setCopyFlash(label);
    window.setTimeout(() => {
      setCopyFlash(previous => (previous === label ? null : previous));
    }, 1400);
  }, []);

  const loadHistogram = useCallback(async () => {
    const url = currentOriginalUrl || midResUrl;
    if (!url) {
      return;
    }
    setHistogramOpen(true);
    setHistogramLoading(true);
    setHistogramError(null);
    const result = await computeLightboxHistogram(url);
    setHistogramLoading(false);
    if (!result) {
      setHistogram(null);
      setHistogramError('Could not sample colors (CORS or load failed).');
      return;
    }
    setHistogram(result);
  }, [currentOriginalUrl, midResUrl]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setMounted(true);
      if (!prefsHydratedRef.current) {
        prefsHydratedRef.current = true;
        const prefs = loadGalleryLightboxUiPreferences();
        setFitMode(prefs.fit);
        setChromeCompact(prefs.chromeCompact);
        setTutorialVisible(!prefs.tutorialSeen);
      }
    });
  }, []);

  useEffect(() => {
    if (!prefsHydratedRef.current) {
      return;
    }
    saveGalleryLightboxUiPreferences({
      fit: fitMode,
      tutorialSeen: !tutorialVisible,
      chromeCompact,
    });
  }, [fitMode, tutorialVisible, chromeCompact]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setBaOpen(false);
      setBaPosition(50);
      setMoreOpen(false);
      setPreferFullRes(false);
      setFullResLoading(false);
      setHistogram(null);
      setHistogramOpen(false);
      setHistogramError(null);
      if (dualMode && dualIndex === index) {
        setDualIndex(null);
      }
    });
  }, [index, dualMode, dualIndex]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setNoteDraft(slideNote ?? '');
    });
  }, [slideNote, index]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (!open) {
        setPreviousIndex(null);
        setDisplayIndex(0);
        setTitleAnimating(false);
        return;
      }

      const playlistKey = images.join('\u0000');
      if (playlistKeyRef.current !== playlistKey) {
        playlistKeyRef.current = playlistKey;
        setPreviousIndex(null);
        setDisplayIndex(index);
        setTitleAnimating(false);
        return;
      }

      if (index === displayIndex) {
        return;
      }

      if (transition === 'none') {
        setDisplayIndex(index);
        return;
      }

      const direction = resolveSlideDirection(
        displayIndex,
        index,
        images.length,
        Boolean(slideshow?.playing)
      );

      setSlideDirection(direction);
      setPreviousIndex(displayIndex);
      setDisplayIndex(index);
      setTitleAnimating(true);
    });
  }, [open, index, displayIndex, images, slideshow?.playing, transition]);

  useEffect(() => {
    if (previousIndex === null || transitionMs === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPreviousIndex(null);
      setTitleAnimating(false);
    }, transitionMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [previousIndex, transitionMs]);

  useEffect(() => {
    if (!open || !isFullscreen) {
      return;
    }

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        slideshow?.onFullscreenChange?.(false);
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [open, isFullscreen, slideshow]);

  useEffect(() => {
    if (!open || !isFullscreen) {
      return;
    }

    const element = containerRef.current;
    if (element?.requestFullscreen && document.fullscreenElement !== element) {
      void element.requestFullscreen().catch(() => undefined);
    }
  }, [open, isFullscreen]);

  useEffect(() => {
    if (!open || !slideshow?.playing || images.length <= 1 || isTransitioning) {
      return;
    }

    const timer = window.setTimeout(() => {
      const nextIndex = index < images.length - 1 ? index + 1 : 0;
      onIndexChange(nextIndex);
    }, slideshow.intervalMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    open,
    slideshow?.playing,
    slideshow?.intervalMs,
    index,
    images.length,
    onIndexChange,
    isTransitioning,
  ]);

  useEffect(() => {
    if (!open || images.length === 0) {
      return;
    }

    const current = images[index];
    if (current && isStillLightboxKind(state?.mediaKinds?.[index])) {
      prefetchGalleryImageUrl(current);
    }

    const neighborIndexes = [index - 1, index + 1].filter(
      neighbor => neighbor >= 0 && neighbor < images.length
    );
    for (const neighbor of neighborIndexes) {
      const url = images[neighbor];
      if (!url || !isStillLightboxKind(state?.mediaKinds?.[neighbor])) {
        continue;
      }
      prefetchGalleryImageUrl(url);
    }
  }, [open, index, images, state?.mediaKinds]);

  useEffect(() => {
    scheduleAfterCommit(() => setCurrentImageLoaded(false));
  }, [currentUrl]);

  return {
    mounted,
    open,
    images,
    index,
    displayIndex,
    previousIndex,
    slideDirection,
    titleAnimating,
    currentImageLoaded,
    setCurrentImageLoaded,
    metaOpen,
    setMetaOpen,
    helpOpen,
    setHelpOpen,
    copyFlash,
    fitMode,
    setFitMode,
    chromeCompact,
    setChromeCompact,
    actionsOpen,
    setActionsOpen,
    baOpen,
    setBaOpen,
    baPosition,
    setBaPosition,
    dualMode,
    setDualMode,
    dualIndex,
    setDualIndex,
    moreOpen,
    setMoreOpen,
    tutorialVisible,
    setTutorialVisible,
    preferFullRes,
    setPreferFullRes,
    fullResLoading,
    setFullResLoading,
    histogram,
    histogramOpen,
    setHistogramOpen,
    histogramError,
    htmlVideoFailed,
    setHtmlVideoFailed,
    histogramLoading,
    noteDraft,
    setNoteDraft,
    containerRef,
    midResUrl,
    currentThumbUrl,
    currentOriginalUrl,
    hasDistinctFullRes,
    currentKind,
    playInlineVideo,
    currentUrl,
    currentDownloadUrl,
    currentTitle,
    canGoPrevious,
    canGoNext,
    slideshowEnabled,
    isFullscreen,
    isTransitioning,
    transition,
    transitionMs,
    transitionOptions,
    pauseSlideshow,
    exitFullscreenPresentation,
    enterFullscreenPresentation,
    toggleFullscreenPresentation,
    flashCopy,
    loadHistogram,
  };
}
