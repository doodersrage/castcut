'use client';

import type { AestheticScoreResult } from '@/lib/aesthetic-score';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/gallery/comfyui-gallery';
import { GalleryCardHeroMedia } from '@/components/gallery/GalleryCardHeroMedia';
import { GalleryCardHoverActions } from '@/components/gallery/GalleryCardHoverActions';
import { GalleryCardPlaceholderStates } from '@/components/gallery/GalleryCardPlaceholderStates';
import { GalleryCardTopChrome } from '@/components/gallery/GalleryCardTopChrome';

export type GalleryCardImageBlockProps = {
  entry: ComfyGalleryEntry;
  layout: GalleryLayoutMode;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: (event?: { shiftKey?: boolean }) => void;
  previewUrl: string | null;
  onToggleFavorite: () => void;
  onDownloadError: (message: string | null) => void;
  onRequeue: (
    newSeed: boolean,
    qualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile,
    options?: { exactGraph?: boolean; stickyHost?: boolean }
  ) => void;
  onCancel: () => void;
  onFaceDetail?: () => void;
  showFaceDetailAction?: boolean;
  onOpenImage: (index: number) => void;
  onPrefetchImage?: (index: number) => void;
  onCustomGroupClick?: (group: string) => void;
  pickMode?: boolean;
  pickable?: boolean;
  pickLabel?: string;
  onPick?: () => void;
  leanHoverActions?: boolean;
  isRendering: boolean;
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
  comfyHostLabel: string | null;
  progressPercent: number | null;
  aestheticScore: AestheticScoreResult;
  aestheticBusy: boolean;
  scoreWithVision: () => void;
};

export default function GalleryCardImageBlock({
  entry,
  layout,
  selectable,
  selected,
  onToggleSelected,
  previewUrl,
  onToggleFavorite,
  onDownloadError,
  onRequeue,
  onCancel,
  onFaceDetail,
  showFaceDetailAction = false,
  onOpenImage,
  onPrefetchImage,
  onCustomGroupClick,
  pickMode = false,
  pickable = false,
  pickLabel = 'Use this image',
  onPick,
  leanHoverActions = false,
  isRendering,
  playbackIndex,
  primaryMediaKind,
  lqipUrl,
  showHtmlVideo,
  isVideoHero,
  heroSrcSet,
  heroLoaded,
  setHeroLoaded,
  setHeroVideoFailed,
  comfyHostLabel,
  progressPercent,
  aestheticScore,
  aestheticBusy,
  scoreWithVision,
}: GalleryCardImageBlockProps) {
  return (
    <div
      className={`ui-gallery-frame relative overflow-hidden ${
        layout === 'list'
          ? 'h-28 w-28 shrink-0 rounded-xl sm:h-32 sm:w-36'
          : layout === 'dense'
            ? 'aspect-square rounded-t-xl'
            : 'aspect-[4/5] rounded-t-2xl sm:aspect-square'
      } ${pickMode && !pickable ? 'opacity-45' : ''}`}
    >
      {previewUrl && !isRendering ? (
        <>
          <GalleryCardHeroMedia
            entry={entry}
            layout={layout}
            previewUrl={previewUrl}
            playbackIndex={playbackIndex}
            primaryMediaKind={primaryMediaKind}
            lqipUrl={lqipUrl}
            showHtmlVideo={showHtmlVideo}
            isVideoHero={isVideoHero}
            heroSrcSet={heroSrcSet}
            heroLoaded={heroLoaded}
            setHeroLoaded={setHeroLoaded}
            setHeroVideoFailed={setHeroVideoFailed}
            pickMode={pickMode}
            pickable={pickable}
            pickLabel={pickLabel}
            onPick={onPick}
            onOpenImage={onOpenImage}
            onPrefetchImage={onPrefetchImage}
          />
          {layout !== 'list' && !(pickMode && pickable) ? (
            <GalleryCardHoverActions
              entry={entry}
              layout={layout}
              playbackIndex={playbackIndex}
              isVideoHero={isVideoHero}
              leanHoverActions={leanHoverActions}
              onOpenImage={onOpenImage}
              onRequeue={onRequeue}
              onDownloadError={onDownloadError}
              onFaceDetail={onFaceDetail}
              showFaceDetailAction={showFaceDetailAction}
            />
          ) : null}
        </>
      ) : isRendering ? (
        <GalleryCardPlaceholderStates
          entry={entry}
          isRendering
          onCancel={onCancel}
          onRequeue={onRequeue}
          comfyHostLabel={comfyHostLabel}
        />
      ) : (
        <GalleryCardPlaceholderStates
          entry={entry}
          isRendering={false}
          onCancel={onCancel}
          onRequeue={onRequeue}
          comfyHostLabel={comfyHostLabel}
        />
      )}

      <GalleryCardTopChrome
        entry={entry}
        layout={layout}
        selectable={selectable}
        selected={selected}
        onToggleSelected={onToggleSelected}
        previewUrl={previewUrl}
        onToggleFavorite={onToggleFavorite}
        onCustomGroupClick={onCustomGroupClick}
        primaryMediaKind={primaryMediaKind}
        aestheticScore={aestheticScore}
        aestheticBusy={aestheticBusy}
        scoreWithVision={scoreWithVision}
      />

      {(entry.status === 'pending' || entry.status === 'running') &&
      entry.queuePosition != null &&
      entry.queuePosition > 0 &&
      progressPercent == null ? (
        <p className="absolute bottom-2 left-2 z-10 rounded-full border border-[var(--border-default)]/60 bg-[var(--bg-base)]/80 px-2 py-0.5 text-[10px] text-[var(--text-muted)] backdrop-blur">
          Queue #{entry.queuePosition}
        </p>
      ) : null}
    </div>
  );
}
