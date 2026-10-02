'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/Button';
import ImageLightboxFilmstrip from '@/components/ui/image-lightbox/ImageLightboxFilmstrip';
import ImageLightboxHistogramPanel from '@/components/ui/image-lightbox/ImageLightboxHistogramPanel';
import ImageLightboxJobBadge from '@/components/ui/image-lightbox/ImageLightboxJobBadge';
import ImageLightboxMetaPanel from '@/components/ui/image-lightbox/ImageLightboxMetaPanel';
import ImageLightboxSlideChromeBar, {
  type ImageLightboxSlideChromeBarProps,
} from '@/components/ui/image-lightbox/ImageLightboxSlideChrome';
import ImageLightboxSlideshowControls from '@/components/ui/image-lightbox/ImageLightboxSlideshowControls';
import ImageLightboxTutorialTip from '@/components/ui/image-lightbox/ImageLightboxTutorialTip';
import type {
  ImageLightboxSlideChrome,
  ImageLightboxSlideshowOptions,
  ImageLightboxState,
} from '@/components/ui/image-lightbox/types';
import { isStillLightboxKind, type ComfyOutputMediaKind } from '@/lib/comfyui-outputs';
import type { GallerySlideshowTransition } from '@/lib/comfyui-gallery';
import type { LightboxHistogram } from '@/lib/lightbox-histogram';

type SlideChromeBarBindings = Omit<ImageLightboxSlideChromeBarProps, 'compact' | 'slideChrome'>;

export type ImageLightboxBottomChromeProps = {
  compact?: boolean;
  state: ImageLightboxState;
  images: string[];
  index: number;
  displayIndex: number;
  dualMode: boolean;
  dualIndex: number | null;
  onGoToIndex: (nextIndex: number, userInitiated?: boolean) => void;
  onDualIndexChange: Dispatch<SetStateAction<number | null>>;
  tutorialVisible: boolean;
  helpOpen: boolean;
  onShowShortcuts: () => void;
  onDismissTutorial: () => void;
  slideChrome: ImageLightboxSlideChrome | null;
  histogramOpen: boolean;
  histogramLoading: boolean;
  histogramError: string | null;
  histogram: LightboxHistogram | null;
  onHistogramClose: () => void;
  metaOpen: boolean;
  noteDraft: string;
  onNoteDraftChange: Dispatch<SetStateAction<string>>;
  preferFullRes: boolean;
  hasDistinctFullRes: boolean;
  fullResLoading: boolean;
  copyFlash: string | null;
  flashCopy: (label: string) => void;
  slideshowEnabled: boolean;
  slideshow?: ImageLightboxSlideshowOptions;
  transition: GallerySlideshowTransition;
  transitionOptions: readonly GallerySlideshowTransition[];
  isFullscreen: boolean;
  onPauseSlideshow: () => void;
  onToggleFullscreen: () => void;
  slideChromeBar: SlideChromeBarBindings;
  currentOriginalUrl: string | undefined;
  currentDownloadUrl: string | undefined;
  onDownloadImage?: (index: number) => Promise<void>;
  currentMediaKind: ComfyOutputMediaKind;
  canGoPrevious: boolean;
  canGoNext: boolean;
};

function OpenOriginalLink({ compact, href }: { compact?: boolean; href: string }) {
  if (compact) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="type-caption text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        Open original
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="ui-btn-ghost !min-h-9 px-4 type-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      Open original
    </a>
  );
}

function DownloadButton({ compact, onClick }: { compact?: boolean; onClick: () => void }) {
  return (
    <Button
      variant="secondary"
      className={
        compact
          ? '!min-h-9 px-3 type-caption'
          : '!min-h-9 px-3 type-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]'
      }
      onClick={onClick}
    >
      Download (D)
    </Button>
  );
}

function SharedPanels({
  compact,
  tutorialVisible,
  helpOpen,
  onShowShortcuts,
  onDismissTutorial,
  slideChrome,
  histogramOpen,
  histogramLoading,
  histogramError,
  histogram,
  onHistogramClose,
  metaOpen,
  noteDraft,
  onNoteDraftChange,
  preferFullRes,
  hasDistinctFullRes,
  fullResLoading,
  copyFlash,
  flashCopy,
}: Pick<
  ImageLightboxBottomChromeProps,
  | 'compact'
  | 'tutorialVisible'
  | 'helpOpen'
  | 'onShowShortcuts'
  | 'onDismissTutorial'
  | 'slideChrome'
  | 'histogramOpen'
  | 'histogramLoading'
  | 'histogramError'
  | 'histogram'
  | 'onHistogramClose'
  | 'metaOpen'
  | 'noteDraft'
  | 'onNoteDraftChange'
  | 'preferFullRes'
  | 'hasDistinctFullRes'
  | 'fullResLoading'
  | 'copyFlash'
  | 'flashCopy'
>) {
  return (
    <>
      <ImageLightboxTutorialTip
        compact={compact}
        tutorialVisible={tutorialVisible}
        helpOpen={helpOpen}
        onShowShortcuts={onShowShortcuts}
        onDismiss={onDismissTutorial}
      />
      <ImageLightboxJobBadge compact={compact} job={slideChrome?.job} />
      <ImageLightboxHistogramPanel
        compact={compact}
        histogramOpen={histogramOpen}
        histogramLoading={histogramLoading}
        histogramError={histogramError}
        histogram={histogram}
        onClose={onHistogramClose}
      />
      <ImageLightboxMetaPanel
        compact={compact}
        metaOpen={metaOpen}
        meta={slideChrome?.meta}
        onNoteChange={slideChrome?.onNoteChange}
        onCopyPrompt={slideChrome?.onCopyPrompt}
        onCopyNegative={slideChrome?.onCopyNegative}
        note={slideChrome?.note}
        noteDraft={noteDraft}
        onNoteDraftChange={onNoteDraftChange}
        preferFullRes={preferFullRes}
        hasDistinctFullRes={hasDistinctFullRes}
        fullResLoading={fullResLoading}
        copyFlash={copyFlash}
        flashCopy={flashCopy}
      />
    </>
  );
}

export default function ImageLightboxBottomChrome({
  compact,
  state,
  images,
  index,
  displayIndex,
  dualMode,
  dualIndex,
  onGoToIndex,
  onDualIndexChange,
  tutorialVisible,
  helpOpen,
  onShowShortcuts,
  onDismissTutorial,
  slideChrome,
  histogramOpen,
  histogramLoading,
  histogramError,
  histogram,
  onHistogramClose,
  metaOpen,
  noteDraft,
  onNoteDraftChange,
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
  onPauseSlideshow,
  onToggleFullscreen,
  slideChromeBar,
  currentOriginalUrl,
  currentDownloadUrl,
  onDownloadImage,
  currentMediaKind,
  canGoPrevious,
  canGoNext,
}: ImageLightboxBottomChromeProps) {
  const filmstrip = state ? (
    <ImageLightboxFilmstrip
      compact={compact}
      images={images}
      index={index}
      state={state}
      dualMode={dualMode}
      dualIndex={dualIndex}
      onGoToIndex={onGoToIndex}
      onDualIndexChange={onDualIndexChange}
    />
  ) : null;

  const slideshowControls = (
    <ImageLightboxSlideshowControls
      compact={compact}
      slideshowEnabled={slideshowEnabled}
      slideshow={slideshow}
      transition={transition}
      transitionOptions={transitionOptions}
      isFullscreen={isFullscreen}
      onPauseSlideshow={onPauseSlideshow}
      onToggleFullscreen={onToggleFullscreen}
    />
  );

  const slideChromeBarNode = (
    <ImageLightboxSlideChromeBar compact={compact} slideChrome={slideChrome} {...slideChromeBar} />
  );

  const downloadActions =
    onDownloadImage && currentDownloadUrl ? (
      <DownloadButton compact={compact} onClick={() => void onDownloadImage(displayIndex)} />
    ) : null;

  const openOriginal =
    currentOriginalUrl != null ? (
      <OpenOriginalLink compact={compact} href={currentOriginalUrl} />
    ) : null;

  const shortcutsHint = compact ? (
    <p className="type-caption text-white/45 [@media(pointer:coarse)]:hidden">
      Press ? for shortcuts
    </p>
  ) : (
    <p className="type-caption text-[var(--text-muted)] [@media(pointer:coarse)]:hidden">
      Press ? for shortcuts
    </p>
  );

  if (compact) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-4 pt-12 sm:px-6">
        <div className="pointer-events-auto flex max-h-[min(48vh,30rem)] flex-col gap-2">
          <div className="sticky top-0 z-[1] shrink-0 bg-gradient-to-b from-black/70 to-transparent pb-1">
            {filmstrip}
          </div>
          <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
            <SharedPanels
              compact
              tutorialVisible={tutorialVisible}
              helpOpen={helpOpen}
              onShowShortcuts={onShowShortcuts}
              onDismissTutorial={onDismissTutorial}
              slideChrome={slideChrome}
              histogramOpen={histogramOpen}
              histogramLoading={histogramLoading}
              histogramError={histogramError}
              histogram={histogram}
              onHistogramClose={onHistogramClose}
              metaOpen={metaOpen}
              noteDraft={noteDraft}
              onNoteDraftChange={onNoteDraftChange}
              preferFullRes={preferFullRes}
              hasDistinctFullRes={hasDistinctFullRes}
              fullResLoading={fullResLoading}
              copyFlash={copyFlash}
              flashCopy={flashCopy}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {slideshowControls}
                {slideChromeBarNode}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {openOriginal}
                {downloadActions}
                {shortcutsHint}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-[min(46vh,28rem)] shrink-0 flex-col gap-2 pb-0.5">
      <div className="sticky top-0 z-[1] shrink-0 border-b border-[var(--border-subtle)]/50 bg-[var(--bg-base)]/90 pb-1.5 backdrop-blur-md">
        {filmstrip}
      </div>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        <SharedPanels
          tutorialVisible={tutorialVisible}
          helpOpen={helpOpen}
          onShowShortcuts={onShowShortcuts}
          onDismissTutorial={onDismissTutorial}
          slideChrome={slideChrome}
          histogramOpen={histogramOpen}
          histogramLoading={histogramLoading}
          histogramError={histogramError}
          histogram={histogram}
          onHistogramClose={onHistogramClose}
          metaOpen={metaOpen}
          noteDraft={noteDraft}
          onNoteDraftChange={onNoteDraftChange}
          preferFullRes={preferFullRes}
          hasDistinctFullRes={hasDistinctFullRes}
          fullResLoading={fullResLoading}
          copyFlash={copyFlash}
          flashCopy={flashCopy}
        />

        <div className="flex shrink-0 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {images.length > 1 ? (
              <div className="flex flex-wrap items-center gap-2">
                {slideshowControls}
                <Button
                  variant="secondary"
                  className="!min-h-9 px-3 type-caption"
                  disabled={!canGoPrevious}
                  onClick={() => onGoToIndex(index - 1, true)}
                >
                  Previous
                </Button>
                <p className="type-caption text-[var(--text-tertiary)]">
                  Image {index + 1} of {images.length}
                  {dualMode && dualIndex != null ? ` · pair ${dualIndex + 1}` : ''}
                  {preferFullRes ? ' · full-res' : ''}
                  {fullResLoading ? ' · loading…' : ''}
                </p>
                <Button
                  variant="secondary"
                  className="!min-h-9 px-3 type-caption"
                  disabled={!canGoNext}
                  onClick={() => onGoToIndex(index + 1, true)}
                >
                  Next
                </Button>
              </div>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap gap-2">
              {openOriginal}
              {downloadActions}
            </div>
          </div>
          {slideChrome || isStillLightboxKind(currentMediaKind) ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {slideChromeBarNode}
              {shortcutsHint}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
