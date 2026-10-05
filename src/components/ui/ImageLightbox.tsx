'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { FixAreaTarget } from '@/lib/fix-area-client';
import ImageLightboxBottomChrome from '@/components/ui/image-lightbox/ImageLightboxBottomChrome';
import ImageLightboxImageStage from '@/components/ui/image-lightbox/ImageLightboxImageStage';
import ImageLightboxShell from '@/components/ui/image-lightbox/ImageLightboxShell';
import ImageLightboxSideNav from '@/components/ui/image-lightbox/ImageLightboxSideNav';
import { resolveTransitionClasses } from '@/components/ui/image-lightbox/imageLightboxTransitions';
import { useImageLightboxKeyboard } from '@/components/ui/image-lightbox/useImageLightboxKeyboard';
import { useImageLightboxPresentation } from '@/components/ui/image-lightbox/useImageLightboxPresentation';
import { useImageLightboxSlideChromeBarBindings } from '@/components/ui/image-lightbox/useImageLightboxSlideChromeBarBindings';
import { useImageLightboxStage } from '@/components/ui/image-lightbox/useImageLightboxStage';
import type {
  ImageLightboxSlideChrome,
  ImageLightboxSlideshowOptions,
  ImageLightboxState,
} from '@/components/ui/image-lightbox/types';

const FixAreaDialog = dynamic(() => import('@/components/fix-area/FixAreaDialog'), {
  ssr: false,
  loading: () => null,
});

export type {
  ImageLightboxState,
  ImageLightboxSlideshowOptions,
  ImageLightboxSlideMeta,
  ImageLightboxJobChrome,
  ImageLightboxSlideChrome,
} from '@/components/ui/image-lightbox/types';

type ImageLightboxProps = {
  state: ImageLightboxState | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  /** Optional per-slide download trigger. */
  onDownloadImage?: (index: number) => Promise<void>;
  slideshow?: ImageLightboxSlideshowOptions;
  /** Review / iterate chrome for the active slide. */
  slideChrome?: ImageLightboxSlideChrome | null;
};

export default function ImageLightbox({
  state,
  onClose,
  onIndexChange,
  onDownloadImage,
  slideshow,
  slideChrome: slideChromeProp = null,
}: ImageLightboxProps) {
  // "Fix an area": the dialog opens over the lightbox for the still shown when it was asked for.
  const [fixTarget, setFixTarget] = useState<FixAreaTarget | null>(null);
  const fixArea = slideChromeProp?.fixArea ?? null;
  const slideChrome = useMemo(
    () =>
      slideChromeProp && fixArea
        ? { ...slideChromeProp, onFixArea: () => setFixTarget(fixArea) }
        : slideChromeProp,
    [fixArea, slideChromeProp]
  );
  const presentation = useImageLightboxPresentation({
    state,
    slideshow,
    onIndexChange,
    slideNote: slideChrome?.note,
  });

  const {
    mounted,
    open,
    images,
    index,
    displayIndex,
    previousIndex,
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
    currentThumbUrl,
    currentOriginalUrl,
    hasDistinctFullRes,
    currentUrl,
    currentDownloadUrl,
    currentTitle,
    canGoPrevious,
    canGoNext,
    slideshowEnabled,
    isFullscreen,
    titleAnimating,
    transition,
    transitionMs,
    transitionOptions,
    pauseSlideshow,
    exitFullscreenPresentation,
    toggleFullscreenPresentation,
    flashCopy,
    loadHistogram,
  } = presentation;

  const {
    zoom,
    pan,
    dragging,
    stageRef,
    resetZoom,
    applyZoom,
    toggleZoom,
    setPan,
    onStagePointerDown,
    onStagePointerMove,
    onStagePointerUp,
    onStageTouchStart,
    onStageTouchMove,
    onStageTouchEnd,
    goToIndex,
  } = useImageLightboxStage({
    open,
    index,
    imagesLength: images.length,
    mediaKinds: state?.mediaKinds,
    slideshow,
    onIndexChange,
    canGoNext,
    canGoPrevious,
    isFullscreen,
    mounted,
  });

  const applyZoomPreset = useCallback(
    (preset: 'fit' | 'actual' | 'center' | 'face') => {
      if (preset === 'fit') {
        resetZoom();
        setFitMode('contain');
        return;
      }
      if (preset === 'actual') {
        setFitMode('actual');
        applyZoom(1);
        setPan({ x: 0, y: 0 });
        return;
      }
      setFitMode('contain');
      if (preset === 'center') {
        applyZoom(2);
        setPan({ x: 0, y: 0 });
        return;
      }
      applyZoom(2.4);
      setPan({ x: 0, y: 72 });
    },
    [applyZoom, resetZoom, setPan, setFitMode]
  );

  const slideChromeBar = useImageLightboxSlideChromeBarBindings({
    chromeCompact,
    actionsOpen,
    metaOpen,
    helpOpen,
    moreOpen,
    baOpen,
    dualMode,
    fitMode,
    histogramOpen,
    preferFullRes,
    fullResLoading,
    hasDistinctFullRes,
    currentMediaKind: presentation.currentKind,
    imagesLength: images.length,
    index,
    setMetaOpen,
    setActionsOpen,
    setChromeCompact,
    setHelpOpen,
    setMoreOpen,
    setBaOpen,
    setDualMode,
    setDualIndex,
    setFitMode,
    setHistogramOpen,
    setPreferFullRes,
    setFullResLoading,
    setCurrentImageLoaded,
    loadHistogram,
    applyZoomPreset,
  });

  useImageLightboxKeyboard({
    // The fix dialog has its own keys (Escape closes it, not the lightbox).
    open: open && !fixTarget,
    index,
    imagesLength: images.length,
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
    mediaKinds: state?.mediaKinds,
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
  });

  // Kept outside the shell (and above the early return): a gallery refresh that briefly empties
  // the lightbox state must not remount the dialog and lose the painted strokes.
  const fixDialog = fixTarget ? (
    <FixAreaDialog target={fixTarget} onClose={() => setFixTarget(null)} />
  ) : null;

  if (!mounted || !open || !currentUrl || !state) {
    // Same shape as the full render below, so the dialog keeps its place in the tree.
    return (
      <>
        {fixDialog}
        {null}
      </>
    );
  }

  const { enter: enterClass, exit: exitClass } = resolveTransitionClasses(
    transition,
    presentation.slideDirection
  );
  const imageClassName = isFullscreen
    ? 'relative flex h-full w-full max-h-[100vh] max-w-[100vw] items-center justify-center'
    : 'relative mx-auto flex h-full max-h-full max-w-full items-center justify-center bg-[var(--bg-subtle)]';
  const currentMediaKind = presentation.currentKind;
  const previousMediaKind =
    previousIndex !== null ? (state.mediaKinds?.[previousIndex] ?? 'image') : 'image';

  const stopStagePointer = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const overline = isFullscreen
    ? `${slideshow?.playing ? 'Slideshow' : 'Paused'} · ${index + 1} / ${images.length}`
    : slideshow?.playing
      ? 'Slideshow'
      : 'Image preview';

  const bottomChromeProps = {
    state,
    images,
    index,
    displayIndex,
    dualMode,
    dualIndex,
    onGoToIndex: goToIndex,
    onDualIndexChange: setDualIndex,
    tutorialVisible,
    helpOpen,
    onShowShortcuts: () => setHelpOpen(true),
    onDismissTutorial: () => setTutorialVisible(false),
    slideChrome,
    histogramOpen,
    histogramLoading,
    histogramError,
    histogram,
    onHistogramClose: () => setHistogramOpen(false),
    metaOpen,
    noteDraft,
    onNoteDraftChange: setNoteDraft,
    preferFullRes,
    hasDistinctFullRes,
    fullResLoading,
    copyFlash,
    flashCopy,
    slideshowEnabled,
    slideshow,
    transition,
    transitionOptions,
    isFullscreen,
    onPauseSlideshow: pauseSlideshow,
    onToggleFullscreen: toggleFullscreenPresentation,
    slideChromeBar,
    currentOriginalUrl,
    currentDownloadUrl,
    onDownloadImage,
    currentMediaKind,
    canGoPrevious,
    canGoNext,
  };

  const sideNav = (
    <ImageLightboxSideNav
      imagesLength={images.length}
      index={index}
      isFullscreen={isFullscreen}
      canGoPrevious={canGoPrevious}
      canGoNext={canGoNext}
      slideshow={slideshow}
      onGoToIndex={goToIndex}
      onStopStagePointer={stopStagePointer}
    />
  );

  const stage = (
    <ImageLightboxImageStage
      stageClassName={
        isFullscreen
          ? 'h-full min-h-0'
          : 'relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-[var(--shadow-overlay,0_24px_80px_rgb(0_0_0/0.45))]'
      }
      stageRef={stageRef}
      zoom={zoom}
      onStagePointerDown={onStagePointerDown}
      onStagePointerMove={onStagePointerMove}
      onStagePointerUp={onStagePointerUp}
      onStageTouchStart={onStageTouchStart}
      onStageTouchMove={onStageTouchMove}
      onStageTouchEnd={onStageTouchEnd}
      dualMode={dualMode}
      dualIndex={dualIndex}
      images={images}
      displayIndex={displayIndex}
      currentUrl={currentUrl}
      currentMediaKind={currentMediaKind}
      currentThumbUrl={currentThumbUrl}
      imageClassName={imageClassName}
      previousIndex={previousIndex}
      previousMediaKind={previousMediaKind}
      enterClass={enterClass}
      exitClass={exitClass}
      mediaKinds={state.mediaKinds}
      thumbImages={state.thumbImages}
      fitMode={fitMode}
      pan={pan}
      dragging={dragging}
      currentTitle={currentTitle}
      baOpen={baOpen}
      baPosition={baPosition}
      slideChrome={slideChrome}
      currentImageLoaded={currentImageLoaded}
      preferFullRes={preferFullRes}
      downloadFilename={state.downloadFilenames?.[displayIndex]}
      htmlVideoFailed={htmlVideoFailed}
      onHtmlVideoFailedChange={setHtmlVideoFailed}
      onCurrentImageLoadedChange={setCurrentImageLoaded}
      onFullResLoadingChange={setFullResLoading}
      onBaPositionChange={setBaPosition}
      onStopStagePointer={stopStagePointer}
    />
  );

  return (
    <>
      {fixDialog}
      <ImageLightboxShell
        isFullscreen={isFullscreen}
        containerRef={containerRef}
        transitionMs={transitionMs}
        ariaLabel={state.title ?? (isFullscreen ? 'Fullscreen slideshow' : 'Image preview')}
        onClose={onClose}
        helpOpen={helpOpen}
        onHelpClose={() => setHelpOpen(false)}
        overline={overline}
        currentTitle={currentTitle}
        displayIndex={displayIndex}
        titleAnimating={titleAnimating}
        stage={stage}
        sideNav={sideNav}
        bottomChrome={<ImageLightboxBottomChrome compact={isFullscreen} {...bottomChromeProps} />}
      />
    </>
  );
}
