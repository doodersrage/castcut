'use client';

import { type MouseEvent } from 'react';
import { Spinner } from '@/components/ui/Button';
import UiIcon from '@/components/ui/UiIcon';
import MotionMedia from '@/components/ui/MotionMedia';
import { isHtmlVideoViewUrl } from '@/lib/comfyui-outputs';
import { looksLikeMotionUrl } from '@/lib/roleplay-film';
import {
  canRetryRoleplayClip,
  canRetryRoleplayStill,
  lastCompletedRoleplayStillUrl,
  roleplayClipTakes,
  roleplayClipTakeIndex,
  roleplayStillTakes,
  roleplayStillTakeIndex,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import {
  beatMotionUrl,
  beatPreviewUrl,
  clipLabel,
  isBusyStatus,
  ROLEPLAY_OVERLAY_BTN_CLASS,
  stillLabel,
} from '@/components/roleplay/roleplay-story-helpers';
import { useGalleryJobEntry } from '@/hooks/useGalleryJobEntry';
import { daySlotJobProgress } from '@/lib/day-slot-progress';

export function RoleplayStillFrame({
  beat,
  liveUrl,
  onOpen,
  onRetry,
  onRetryClip,
  onSelectTake,
  onSelectClipTake,
}: {
  beat: RoleplayStoryBeat;
  liveUrl: string | null;
  onOpen?: () => void;
  onRetry?: () => void;
  onRetryClip?: () => void;
  onSelectTake?: (index: number) => void;
  onSelectClipTake?: (index: number) => void;
}) {
  const takes = roleplayStillTakes(beat);
  const takeIndex = roleplayStillTakeIndex(beat);
  const clipTakes = roleplayClipTakes(beat);
  const clipTakeIndex = roleplayClipTakeIndex(beat);
  const completedUrl = beat.stillStatus === 'completed' ? beat.imageUrl : undefined;
  const clipUrl = beatMotionUrl(beat) ?? '';
  const motionClip = Boolean(clipUrl && looksLikeMotionUrl(clipUrl));
  const playHtmlVideo = Boolean(clipUrl && isHtmlVideoViewUrl(clipUrl));
  const openableUrl = beatPreviewUrl(beat, liveUrl);
  const displayUrl = beatPreviewUrl(beat, liveUrl) || lastCompletedRoleplayStillUrl(beat);
  const frameUrl = displayUrl;
  const ghost = Boolean(displayUrl && !openableUrl);
  const clipBusy = isBusyStatus(beat.clipStatus);
  const busy = isBusyStatus(beat.stillStatus) || clipBusy || Boolean(liveUrl && !completedUrl);
  // Queue position / render % from the job's gallery entry (clip first while it's the busy one).
  const jobEntry = useGalleryJobEntry(clipBusy ? beat.clipPromptId : beat.promptId);
  const job = daySlotJobProgress({
    stillStatus: clipBusy ? beat.clipStatus : beat.stillStatus,
    entry: jobEntry,
    livePreview: Boolean(liveUrl),
  });
  const jobLabel = job
    ? clipBusy && job.phase === 'rendering'
      ? job.percent === null
        ? 'Animating…'
        : `Animating · ${job.percent}%`
      : job.label
    : null;
  const motionLabel = clipLabel(beat);
  const label = jobLabel || motionLabel || stillLabel(beat, liveUrl);
  const clickable = Boolean(openableUrl && onOpen);
  const canRetry = Boolean(!motionClip && onRetry && canRetryRoleplayStill(beat));
  const canRetryClip = Boolean(onRetryClip && canRetryRoleplayClip(beat));
  const canPageClips = Boolean(motionClip && onSelectClipTake && clipTakes.length > 1);
  const canPageStills = Boolean(!motionClip && onSelectTake && takes.length > 1);
  const pageIndex = canPageClips ? clipTakeIndex : takeIndex;
  const pageCount = canPageClips ? clipTakes.length : takes.length;
  const canPage = canPageClips || canPageStills;

  const frameClass =
    'relative aspect-[4/5] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40';

  const stop = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className={frameClass} role="status" aria-live="polite" aria-busy={busy || undefined}>
      {motionClip && clipUrl ? (
        <MotionMedia
          src={clipUrl}
          alt={beat.title}
          className="h-full w-full object-cover"
          autoPlay
          loop
          muted
          controls={playHtmlVideo}
          poster={completedUrl ?? displayUrl ?? undefined}
        />
      ) : frameUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={frameUrl}
          alt={beat.title}
          className={`h-full w-full object-cover ${completedUrl && !ghost ? '' : 'opacity-80'}`}
        />
      ) : null}

      {clickable && !playHtmlVideo ? (
        <button
          type="button"
          onClick={onOpen}
          className="absolute inset-0 z-10 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]"
          aria-label={`Open ${beat.title} full size`}
        />
      ) : null}

      {busy && !displayUrl ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-4 text-center">
          <Spinner size="lg" />
          <p className="type-caption text-[var(--accent-text)]">{label}</p>
          {job?.percent != null ? (
            <div
              className="h-1 w-24 overflow-hidden rounded-full bg-[var(--bg-muted)]"
              role="progressbar"
              aria-label={`Beat ${beat.title} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={job.percent}
            >
              <div
                className="h-full bg-[var(--accent-active)] transition-[width]"
                style={{ width: `${job.percent}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {busy && displayUrl ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 bg-[var(--bg-base)]/70 px-3 py-2 backdrop-blur-sm">
          <Spinner size="sm" />
          <p className="type-caption text-[var(--accent-text)]">{label}</p>
          {job?.percent != null ? (
            <div
              className="h-1 w-24 overflow-hidden rounded-full bg-[var(--bg-muted)]"
              role="progressbar"
              aria-label={`Beat ${beat.title} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={job.percent}
            >
              <div
                className="h-full bg-[var(--accent-active)] transition-[width]"
                style={{ width: `${job.percent}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {beat.stillStatus === 'error' && !displayUrl ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4 text-center">
          <p className="type-caption text-[var(--tint-danger-text)]">{label}</p>
        </div>
      ) : null}

      {!busy && !displayUrl && beat.stillStatus !== 'error' ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4 text-center">
          <p className="type-caption text-[var(--text-muted)]">{label}</p>
        </div>
      ) : null}

      {canPage ? (
        <>
          <button
            type="button"
            className={`${ROLEPLAY_OVERLAY_BTN_CLASS} absolute left-1.5 top-1/2 z-20 -translate-y-1/2`}
            aria-label={canPageClips ? 'Previous clip version' : 'Previous still version'}
            disabled={pageIndex <= 0}
            onClick={event => {
              stop(event);
              if (canPageClips) {
                onSelectClipTake?.(pageIndex - 1);
              } else {
                onSelectTake?.(pageIndex - 1);
              }
            }}
          >
            <UiIcon name="chevronLeft" size={14} />
          </button>
          <button
            type="button"
            className={`${ROLEPLAY_OVERLAY_BTN_CLASS} absolute right-1.5 top-1/2 z-20 -translate-y-1/2`}
            aria-label={canPageClips ? 'Next clip version' : 'Next still version'}
            disabled={pageIndex >= pageCount - 1}
            onClick={event => {
              stop(event);
              if (canPageClips) {
                onSelectClipTake?.(pageIndex + 1);
              } else {
                onSelectTake?.(pageIndex + 1);
              }
            }}
          >
            <UiIcon name="chevronRight" size={14} />
          </button>
          <p className="pointer-events-none absolute left-1.5 top-1.5 z-20 rounded-full bg-[var(--bg-base)]/75 px-2 py-0.5 type-caption text-[var(--text-secondary)] backdrop-blur-sm">
            {pageIndex + 1} / {pageCount}
          </p>
        </>
      ) : null}

      {canRetry ? (
        <button
          type="button"
          className={`${ROLEPLAY_OVERLAY_BTN_CLASS} absolute right-1.5 top-1.5 z-20`}
          aria-label="Play another still with a new seed"
          title="Play another still"
          onClick={event => {
            stop(event);
            onRetry?.();
          }}
        >
          <UiIcon name="retry" size={14} />
        </button>
      ) : null}

      {motionClip && canRetryClip ? (
        <button
          type="button"
          className={`${ROLEPLAY_OVERLAY_BTN_CLASS} absolute right-1.5 top-1.5 z-20`}
          aria-label="Play another clip with a new seed"
          title="Play another clip"
          onClick={event => {
            stop(event);
            onRetryClip?.();
          }}
        >
          <UiIcon name="retry" size={14} />
        </button>
      ) : null}
    </div>
  );
}
