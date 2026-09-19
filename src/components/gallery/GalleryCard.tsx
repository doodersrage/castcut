'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { comfyUiJobProgressPercent } from '@/lib/comfyui-job-status';
import { formatComfyHostLabel } from '@/lib/queue-status-notes';
import {
  formatRenderDuration,
  resolveGalleryRenderDurationMs,
} from '@/lib/comfyui-render-duration';
import { scoreGalleryEntryHeuristic, type AestheticScoreResult } from '@/lib/aesthetic-score';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  galleryEntryMediaKinds,
  galleryEntryPrimaryLqipUrl,
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryPlaybackIndex,
  galleryEntryPrimaryThumbSrcSet,
  updateComfyGalleryEntryById,
  type ComfyGalleryEntry,
  type GalleryLayoutMode,
} from '@/lib/comfyui-gallery';
import { galleryDerivedKindLabel } from '@/lib/gallery-derived-kind';
import { shouldUseHtmlVideoElement } from '@/lib/comfyui-outputs';
import GalleryCardBodyBlock from '@/components/gallery/GalleryCardBodyBlock';
import GalleryCardImageBlock from '@/components/gallery/GalleryCardImageBlock';

type GalleryCardProps = {
  entry: ComfyGalleryEntry;
  compact: boolean;
  layout?: GalleryLayoutMode;
  selectable?: boolean;
  selected?: boolean;
  reviewFocus?: boolean;
  cardRef?: React.Ref<HTMLElement>;
  onToggleSelected?: (event?: { shiftKey?: boolean }) => void;
  previewUrl: string | null;
  imageUrls: string[];
  onRemove: () => void;
  onToggleFavorite: () => void;
  onDownloadError: (message: string | null) => void;
  onRequeue: (
    newSeed: boolean,
    qualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile,
    options?: { exactGraph?: boolean; stickyHost?: boolean }
  ) => void;
  onCancel: () => void;
  onUpscale: (qualityProfile: 'final' | 'max', options?: { force?: boolean }) => void;
  onRefine: () => void;
  onSoftSecondPass?: () => void;
  onSkinRefine?: () => void;
  onFaceDetail?: () => void;
  onAnatomyRepair?: () => void;
  onMoireClean?: (qualityProfile: 'final' | 'max', options?: { force?: boolean }) => void;
  /** When false, hide both Final and Max upscale items (unless finer flags set). */
  showUpscaleActions?: boolean;
  showUpscaleFinal?: boolean;
  showUpscaleMax?: boolean;
  showForceUpscaleMax?: boolean;
  showRefineAction?: boolean;
  showSoftSecondPassAction?: boolean;
  showSkinRefineAction?: boolean;
  showFaceDetailAction?: boolean;
  showAnatomyRepairAction?: boolean;
  showMoireCleanActions?: boolean;
  showMoireCleanFinal?: boolean;
  showMoireCleanMax?: boolean;
  showForceMoireCleanMax?: boolean;
  onShowParent?: () => void;
  onShowDerivatives?: () => void;
  hasDerivatives?: boolean;
  onOpenImage: (index: number) => void;
  /** Warm mid-res lightbox URL before open (hover/focus intent). */
  onPrefetchImage?: (index: number) => void;
  reviewMode?: boolean;
  onReviewRating?: (rating: ComfyGalleryEntry['reviewRating']) => void;
  reviewMutationHints?: string[];
  onVisionTagClick?: (tag: string) => void;
  onUserTagClick?: (tag: string) => void;
  onCustomGroupClick?: (group: string) => void;
  onViewWorkflow?: () => void;
  onRestoreExactGraph?: () => void;
  /** When set, clicking a pickable card returns the image to the calling tool. */
  pickMode?: boolean;
  pickable?: boolean;
  pickLabel?: string;
  onPick?: () => void;
  /** Simple workspace: hover chips are Open, Stack, and Lock only. */
  leanHoverActions?: boolean;
};

export default function GalleryCard({
  entry,
  compact,
  layout = 'grid',
  selectable,
  selected,
  reviewFocus = false,
  cardRef,
  onToggleSelected,
  previewUrl,
  imageUrls,
  onRemove,
  onToggleFavorite,
  onDownloadError,
  onRequeue,
  onCancel,
  onUpscale,
  onRefine,
  onSoftSecondPass,
  onSkinRefine,
  onFaceDetail,
  onAnatomyRepair,
  onMoireClean,
  showUpscaleActions = true,
  showUpscaleFinal,
  showUpscaleMax,
  showForceUpscaleMax = false,
  showRefineAction = true,
  showSoftSecondPassAction = true,
  showSkinRefineAction = true,
  showFaceDetailAction = false,
  showAnatomyRepairAction = false,
  showMoireCleanActions = true,
  showMoireCleanFinal,
  showMoireCleanMax,
  showForceMoireCleanMax = false,
  onShowParent,
  onShowDerivatives,
  hasDerivatives,
  onOpenImage,
  onPrefetchImage,
  reviewMode,
  onReviewRating,
  reviewMutationHints,
  onVisionTagClick,
  onUserTagClick,
  onCustomGroupClick,
  onViewWorkflow,
  onRestoreExactGraph,
  pickMode = false,
  pickable = false,
  pickLabel = 'Use this image',
  onPick,
  leanHoverActions = false,
}: GalleryCardProps) {
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [heroVideoFailed, setHeroVideoFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const heroSrcSet = useMemo(() => galleryEntryPrimaryThumbSrcSet(entry), [entry]);
  const lqipUrl = useMemo(() => galleryEntryPrimaryLqipUrl(entry), [entry]);
  const primaryMediaKind = useMemo(() => galleryEntryPrimaryMediaKind(entry), [entry]);
  const stripMediaKinds = useMemo(() => galleryEntryMediaKinds(entry), [entry]);
  const isVideoHero = primaryMediaKind === 'video';
  const playableHero = Boolean(
    previewUrl && shouldUseHtmlVideoElement(primaryMediaKind, previewUrl)
  );
  const showHtmlVideo = playableHero && !heroVideoFailed;
  const playbackIndex = galleryEntryPrimaryPlaybackIndex(entry);
  const isRendering = entry.status === 'pending' || entry.status === 'running';

  useEffect(() => {
    scheduleAfterCommit(() => {
      setHeroLoaded(false);
      setHeroVideoFailed(false);
    });
  }, [previewUrl]);

  const heuristicScore = useMemo(
    () => scoreGalleryEntryHeuristic(entry),
    [entry.id, entry.status, entry.favorite, entry.reviewRating, entry.prompt.length]
  );
  const cachedScore = useMemo((): AestheticScoreResult | null => {
    if (typeof entry.aestheticScore === 'number' && entry.aestheticScoreMethod) {
      return {
        score: entry.aestheticScore,
        method: entry.aestheticScoreMethod,
        notes: ['Cached score'],
      };
    }
    return null;
  }, [entry.aestheticScore, entry.aestheticScoreMethod]);
  const [aestheticScore, setAestheticScore] = useState<AestheticScoreResult>(
    cachedScore ?? heuristicScore
  );
  const [aestheticBusy, setAestheticBusy] = useState(false);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setAestheticScore(cachedScore ?? heuristicScore);
    });
  }, [cachedScore, heuristicScore]);

  const scoreWithVision = async () => {
    if (!previewUrl || aestheticBusy || entry.status !== 'completed') {
      return;
    }
    setAestheticBusy(true);
    try {
      const imageResponse = await fetch(previewUrl);
      if (!imageResponse.ok) {
        throw new Error('Could not load preview for vision scoring.');
      }
      const blob = await imageResponse.blob();
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('Could not encode preview.'));
        reader.readAsDataURL(blob);
      });
      const response = await fetch('/api/aesthetic/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'vision',
          imageDataUrl,
          prompt: entry.prompt,
          model: entry.model,
          tool: entry.tool,
          status: entry.status,
          favorite: entry.favorite,
          reviewRating: entry.reviewRating,
          images: entry.images,
          comfyUrl: entry.comfyUrl,
          promptId: entry.promptId,
          id: entry.id,
        }),
      });
      const data = (await response.json()) as AestheticScoreResult & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? 'Aesthetic score failed.');
      }
      const nextScore: AestheticScoreResult = {
        score: data.score,
        method: data.method,
        notes: data.notes ?? [],
      };
      setAestheticScore(nextScore);
      updateComfyGalleryEntryById(entry.id, {
        aestheticScore: nextScore.score,
        aestheticScoreMethod: nextScore.method,
      });
    } catch {
      setAestheticScore(heuristicScore);
    } finally {
      setAestheticBusy(false);
    }
  };

  useLayoutEffect(() => {
    if (!menuOpen) {
      return;
    }

    const updatePosition = () => {
      const button = menuButtonRef.current;
      if (!button) {
        return;
      }

      const rect = button.getBoundingClientRect();
      const padding = 8;
      const menuWidth = 208;
      const estimatedHeight = 360;
      const spaceBelow = window.innerHeight - rect.bottom - padding;
      const spaceAbove = rect.top - padding;
      const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        160,
        Math.min(estimatedHeight, openUp ? spaceAbove - 4 : spaceBelow - 4)
      );
      const left = Math.min(
        Math.max(padding, rect.right - menuWidth),
        window.innerWidth - menuWidth - padding
      );
      const top = openUp
        ? Math.max(padding, rect.top - maxHeight - 6)
        : Math.min(rect.bottom + 6, window.innerHeight - maxHeight - padding);

      setMenuPosition({ top, left, maxHeight });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuButtonRef.current?.contains(target) || menuPanelRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const derivedLabel = galleryDerivedKindLabel(entry.derivedKind);

  const comfyHostLabel = formatComfyHostLabel(entry.comfyUrl);
  const renderDurationLabel = formatRenderDuration(resolveGalleryRenderDurationMs(entry));
  const metaLine = [
    entry.tool,
    entry.model,
    entry.parentGalleryEntryId ? undefined : derivedLabel,
    comfyHostLabel ? `host ${comfyHostLabel}` : undefined,
    renderDurationLabel ? `render ${renderDurationLabel}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  const progressPercent = comfyUiJobProgressPercent(entry);

  const cardTone =
    selected || reviewFocus ? 'ui-selected-frame' : 'border-[var(--border-subtle)]/80';

  const imageBlock = (
    <GalleryCardImageBlock
      entry={entry}
      layout={layout}
      selectable={selectable}
      selected={selected}
      onToggleSelected={onToggleSelected}
      previewUrl={previewUrl}
      onToggleFavorite={onToggleFavorite}
      onDownloadError={onDownloadError}
      onRequeue={onRequeue}
      onCancel={onCancel}
      onFaceDetail={onFaceDetail}
      showFaceDetailAction={showFaceDetailAction}
      onOpenImage={onOpenImage}
      onPrefetchImage={onPrefetchImage}
      onCustomGroupClick={onCustomGroupClick}
      pickMode={pickMode}
      pickable={pickable}
      pickLabel={pickLabel}
      onPick={onPick}
      leanHoverActions={leanHoverActions}
      isRendering={isRendering}
      playbackIndex={playbackIndex}
      primaryMediaKind={primaryMediaKind}
      lqipUrl={lqipUrl}
      showHtmlVideo={showHtmlVideo}
      isVideoHero={isVideoHero}
      heroSrcSet={heroSrcSet}
      heroLoaded={heroLoaded}
      setHeroLoaded={setHeroLoaded}
      setHeroVideoFailed={setHeroVideoFailed}
      comfyHostLabel={comfyHostLabel}
      progressPercent={progressPercent}
      aestheticScore={aestheticScore}
      aestheticBusy={aestheticBusy}
      scoreWithVision={() => {
        void scoreWithVision();
      }}
    />
  );

  const bodyBlock = (
    <GalleryCardBodyBlock
      entry={entry}
      compact={compact}
      layout={layout}
      selectable={selectable}
      selected={selected}
      reviewFocus={reviewFocus}
      onToggleSelected={onToggleSelected}
      previewUrl={previewUrl}
      imageUrls={imageUrls}
      onToggleFavorite={onToggleFavorite}
      onDownloadError={onDownloadError}
      onRequeue={onRequeue}
      onCancel={onCancel}
      onUpscale={onUpscale}
      onRefine={onRefine}
      onSoftSecondPass={onSoftSecondPass}
      onSkinRefine={onSkinRefine}
      onFaceDetail={onFaceDetail}
      onAnatomyRepair={onAnatomyRepair}
      onMoireClean={onMoireClean}
      showUpscaleActions={showUpscaleActions}
      showUpscaleFinal={showUpscaleFinal}
      showUpscaleMax={showUpscaleMax}
      showForceUpscaleMax={showForceUpscaleMax}
      showRefineAction={showRefineAction}
      showSoftSecondPassAction={showSoftSecondPassAction}
      showSkinRefineAction={showSkinRefineAction}
      showFaceDetailAction={showFaceDetailAction}
      showAnatomyRepairAction={showAnatomyRepairAction}
      showMoireCleanActions={showMoireCleanActions}
      showMoireCleanFinal={showMoireCleanFinal}
      showMoireCleanMax={showMoireCleanMax}
      showForceMoireCleanMax={showForceMoireCleanMax}
      onShowParent={onShowParent}
      onShowDerivatives={onShowDerivatives}
      hasDerivatives={hasDerivatives}
      onOpenImage={onOpenImage}
      onPrefetchImage={onPrefetchImage}
      reviewMode={reviewMode}
      onReviewRating={onReviewRating}
      reviewMutationHints={reviewMutationHints}
      onVisionTagClick={onVisionTagClick}
      onUserTagClick={onUserTagClick}
      onCustomGroupClick={onCustomGroupClick}
      onViewWorkflow={onViewWorkflow}
      onRestoreExactGraph={onRestoreExactGraph}
      onRemove={onRemove}
      pickMode={pickMode}
      pickable={pickable}
      pickLabel={pickLabel}
      onPick={onPick}
      promptExpanded={promptExpanded}
      setPromptExpanded={setPromptExpanded}
      metaLine={metaLine}
      derivedLabel={derivedLabel}
      primaryMediaKind={primaryMediaKind}
      stripMediaKinds={stripMediaKinds}
      isVideoHero={isVideoHero}
      comfyHostLabel={comfyHostLabel}
      menuOpen={menuOpen}
      menuPosition={menuPosition}
      menuButtonRef={menuButtonRef}
      menuPanelRef={menuPanelRef}
      setMenuOpen={setMenuOpen}
      setMenuPosition={setMenuPosition}
    />
  );

  return (
    <article
      ref={cardRef}
      data-gallery-entry={entry.id}
      data-review-focus={reviewFocus ? 'true' : undefined}
      className={`group/card ui-gallery-card ui-media-reveal relative min-w-0 transition hover:border-[var(--border-default)]/80 ${
        layout === 'dense' ? 'rounded-xl' : 'rounded-2xl'
      } ${
        menuOpen
          ? 'z-30'
          : layout === 'dense'
            ? 'z-0 [content-visibility:auto] [contain-intrinsic-size:auto_220px]'
            : 'z-0 [content-visibility:auto] [contain-intrinsic-size:auto_320px]'
      } ${cardTone}`}
    >
      {layout === 'list' ? (
        <div className="flex gap-4 p-3">
          {imageBlock}
          {bodyBlock}
        </div>
      ) : (
        <>
          {imageBlock}
          {bodyBlock}
        </>
      )}
    </article>
  );
}
