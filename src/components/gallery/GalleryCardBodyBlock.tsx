'use client';

import GalleryPlayChecksBadge from '@/components/gallery/GalleryPlayChecksBadge';
import type { RefObject } from 'react';
import GalleryCardMenu from '@/components/gallery/GalleryCardMenu';
import { CustomGroupBadge, statusLabel, statusTone } from '@/components/gallery/galleryCardStatus';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/comfyui-gallery';
import { isHtmlVideoViewUrl } from '@/lib/comfyui-outputs';

export type GalleryCardBodyBlockProps = {
  entry: ComfyGalleryEntry;
  compact: boolean;
  layout: GalleryLayoutMode;
  selectable?: boolean;
  selected?: boolean;
  reviewFocus?: boolean;
  onToggleSelected?: (event?: { shiftKey?: boolean }) => void;
  previewUrl: string | null;
  imageUrls: string[];
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
  onPrefetchImage?: (index: number) => void;
  reviewMode?: boolean;
  onReviewRating?: (rating: ComfyGalleryEntry['reviewRating']) => void;
  reviewMutationHints?: string[];
  onVisionTagClick?: (tag: string) => void;
  onUserTagClick?: (tag: string) => void;
  onCustomGroupClick?: (group: string) => void;
  onViewWorkflow?: () => void;
  onRestoreExactGraph?: () => void;
  onRemove: () => void;
  pickMode?: boolean;
  pickable?: boolean;
  pickLabel?: string;
  onPick?: () => void;
  promptExpanded: boolean;
  setPromptExpanded: (value: boolean | ((previous: boolean) => boolean)) => void;
  metaLine: string;
  derivedLabel: string | null | undefined;
  primaryMediaKind: ReturnType<typeof import('@/lib/comfyui-gallery').galleryEntryPrimaryMediaKind>;
  stripMediaKinds: ReturnType<typeof import('@/lib/comfyui-gallery').galleryEntryMediaKinds>;
  isVideoHero: boolean;
  comfyHostLabel: string | null;
  menuOpen: boolean;
  menuPosition: { top: number; left: number; maxHeight: number } | null;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  menuPanelRef: RefObject<HTMLDivElement | null>;
  setMenuOpen: (open: boolean) => void;
  setMenuPosition: (position: { top: number; left: number; maxHeight: number } | null) => void;
};

export default function GalleryCardBodyBlock({
  entry,
  compact,
  layout,
  selectable,
  selected,
  reviewFocus = false,
  onToggleSelected,
  previewUrl,
  imageUrls,
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
  onRemove,
  pickMode = false,
  pickable = false,
  pickLabel = 'Use this image',
  onPick,
  promptExpanded,
  setPromptExpanded,
  metaLine,
  derivedLabel,
  primaryMediaKind,
  stripMediaKinds,
  isVideoHero,
  comfyHostLabel,
  menuOpen,
  menuPosition,
  menuButtonRef,
  menuPanelRef,
  setMenuOpen,
  setMenuPosition,
}: GalleryCardBodyBlockProps) {
  return (
    <div
      className={`min-w-0 flex-1 ${
        layout === 'list'
          ? 'space-y-2.5 py-1'
          : layout === 'dense'
            ? 'space-y-1.5 p-2'
            : 'space-y-2.5 p-3.5'
      }`}
    >
      {pickMode && pickable && onPick ? (
        <button
          type="button"
          onClick={onPick}
          className="w-full rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          {pickLabel}
        </button>
      ) : pickMode && !pickable ? (
        <p className="type-caption text-[var(--text-muted)]">
          Only completed still images can be selected here.
        </p>
      ) : null}
      {layout === 'list' ? (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusTone(entry.status)}`}
          >
            {statusLabel(entry.status, entry)}
          </span>
          {entry.reviewRating ? (
            <span className="text-[10px] text-[var(--accent-text)]">{entry.reviewRating}★</span>
          ) : null}
          <GalleryPlayChecksBadge entry={entry} />
          {entry.customGroup?.trim() ? (
            <CustomGroupBadge name={entry.customGroup.trim()} onClick={onCustomGroupClick} />
          ) : null}
          {entry.reviewNote?.trim() ? (
            <span
              className="max-w-[12rem] truncate rounded-full border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-warning-text)]"
              title={entry.reviewNote.trim()}
              data-testid="gallery-card-review-note"
            >
              Note · {entry.reviewNote.trim()}
            </span>
          ) : null}
          {entry.hasStoredWorkflow || entry.workflowJson ? (
            <span className="rounded-full border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-info-text)]">
              Exact graph
            </span>
          ) : entry.workflowJsonOmitted ? (
            <span className="rounded-full border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-warning-text)]">
              Graph pruned
            </span>
          ) : null}
          {reviewFocus ? (
            <span className="ui-badge" data-tone="accent">
              Review focus
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {promptExpanded ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-muted)]/50 p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
              {entry.prompt}
            </pre>
          ) : (
            <p
              className={`leading-snug text-[var(--text-secondary)] ${
                layout === 'list'
                  ? 'line-clamp-3 text-sm'
                  : layout === 'dense'
                    ? 'line-clamp-1 text-xs'
                    : 'line-clamp-2 text-sm'
              }`}
            >
              {entry.prompt}
            </p>
          )}
          {metaLine ? (
            <p className="ui-gallery-caption mt-1.5 truncate">
              {entry.parentGalleryEntryId && onShowParent ? (
                <>
                  <button
                    type="button"
                    onClick={onShowParent}
                    className="text-[var(--accent-text)] underline decoration-[var(--accent-border)] underline-offset-2 transition hover:text-[var(--accent-text)]"
                  >
                    {derivedLabel ?? 'View source'}
                  </button>
                  {' · '}
                </>
              ) : null}
              {metaLine}
              {entry.queueParams?.seed != null ? ` · seed ${entry.queueParams.seed}` : ''}
              {entry.queueParams?.videoFrames != null ? ` · ${entry.queueParams.videoFrames}f` : ''}
              {entry.queueParams?.videoFps != null ? ` @ ${entry.queueParams.videoFps}fps` : ''}
              {entry.queuedAt ? ` · ${new Date(entry.queuedAt).toLocaleDateString()}` : ''}
            </p>
          ) : null}
          {entry.visionTags && entry.visionTags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.visionTags.slice(0, 8).map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onVisionTagClick?.(tag)}
                  className="rounded-full border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-info-text)] transition hover:border-[var(--tint-info-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  {tag}
                </button>
              ))}
            </div>
          ) : null}
          {entry.userTags && entry.userTags.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {entry.userTags.slice(0, 8).map(tag => (
                <button
                  key={`user-${tag}`}
                  type="button"
                  onClick={() => onUserTagClick?.(tag)}
                  className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] text-[var(--accent-text)] transition hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  #{tag}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {layout === 'list' && selectable ? (
          <label
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border backdrop-blur transition ${
              selected
                ? 'border-[var(--accent-border)] bg-[var(--accent-muted)]'
                : 'border-[var(--border-default)]/70 bg-[var(--bg-base)]/80'
            }`}
            onClick={event => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={event => {
                onToggleSelected?.({
                  shiftKey:
                    'shiftKey' in event.nativeEvent &&
                    Boolean((event.nativeEvent as MouseEvent).shiftKey),
                });
              }}
              aria-label="Select entry"
              className="h-3.5 w-3.5 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
            />
          </label>
        ) : null}
      </div>

      {!compact && layout !== 'list' && imageUrls.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {imageUrls.slice(1, 5).map((url, thumbIndex) =>
            stripMediaKinds[thumbIndex + 1] === 'video' && isHtmlVideoViewUrl(url) ? (
              <button
                key={url}
                type="button"
                onClick={() => onOpenImage(thumbIndex + 1)}
                onPointerEnter={() => onPrefetchImage?.(thumbIndex + 1)}
                onFocus={() => onPrefetchImage?.(thumbIndex + 1)}
                onPointerDown={() => onPrefetchImage?.(thumbIndex + 1)}
                className="shrink-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] transition hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                aria-label={`Open video ${thumbIndex + 2} preview`}
              >
                <video
                  src={url}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="h-9 w-9 object-cover"
                />
              </button>
            ) : stripMediaKinds[thumbIndex + 1] === 'audio' ||
              stripMediaKinds[thumbIndex + 1] === 'mesh' ? (
              <button
                key={url}
                type="button"
                onClick={() => onOpenImage(thumbIndex + 1)}
                className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[8px] font-medium uppercase tracking-wide text-[var(--text-muted)] transition hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                aria-label={`Open ${stripMediaKinds[thumbIndex + 1] === 'audio' ? 'audio' : '3D'} ${thumbIndex + 2}`}
              >
                {stripMediaKinds[thumbIndex + 1] === 'audio' ? 'Audio' : '3D'}
              </button>
            ) : (
              <button
                key={url}
                type="button"
                onClick={() => onOpenImage(thumbIndex + 1)}
                onPointerEnter={() => onPrefetchImage?.(thumbIndex + 1)}
                onFocus={() => onPrefetchImage?.(thumbIndex + 1)}
                onPointerDown={() => onPrefetchImage?.(thumbIndex + 1)}
                className="shrink-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] transition hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                aria-label={`Open image ${thumbIndex + 2} preview`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-9 w-9 object-cover"
                />
              </button>
            )
          )}
        </div>
      ) : null}

      {reviewMode && reviewMutationHints && reviewMutationHints.length > 0 ? (
        <ul className="space-y-1 rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2 text-[11px] text-[var(--tint-warning-text)]">
          {reviewMutationHints.map(hint => (
            <li key={hint}>· {hint}</li>
          ))}
        </ul>
      ) : null}

      {reviewMode && entry.status === 'completed' && onReviewRating ? (
        <div
          className={`flex flex-wrap items-center gap-1.5 ${
            layout === 'dense'
              ? 'opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100'
              : ''
          }`}
        >
          <span className="text-[11px] text-[var(--text-muted)]">Rate</span>
          {[1, 2, 3, 4, 5].map(rating => (
            <button
              key={rating}
              type="button"
              onClick={() => onReviewRating(rating as ComfyGalleryEntry['reviewRating'])}
              className={`min-h-8 min-w-8 rounded-lg border text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                entry.reviewRating === rating
                  ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
              }`}
            >
              {rating}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={`flex flex-wrap items-center gap-2 pt-0.5 ${
          layout === 'dense'
            ? 'opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100'
            : ''
        }`}
      >
        <button
          type="button"
          onClick={() => setPromptExpanded(previous => !previous)}
          className="ui-btn-ghost ui-btn-sm text-xs"
        >
          {promptExpanded ? 'Less' : 'Prompt'}
        </button>
        {layout === 'list' ? (
          <button
            type="button"
            onClick={onToggleFavorite}
            className="ui-btn-ghost ui-btn-sm text-xs"
          >
            {entry.favorite ? 'Unfavorite' : 'Favorite'}
          </button>
        ) : null}

        <GalleryCardMenu
          entry={entry}
          layout={layout}
          previewUrl={previewUrl}
          primaryMediaKind={primaryMediaKind}
          isVideoHero={isVideoHero}
          comfyHostLabel={comfyHostLabel}
          menuOpen={menuOpen}
          menuPosition={menuPosition}
          menuButtonRef={menuButtonRef}
          menuPanelRef={menuPanelRef}
          setMenuOpen={setMenuOpen}
          setMenuPosition={setMenuPosition}
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
          onShowDerivatives={onShowDerivatives}
          hasDerivatives={hasDerivatives}
          onViewWorkflow={onViewWorkflow}
          onRestoreExactGraph={onRestoreExactGraph}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
}
