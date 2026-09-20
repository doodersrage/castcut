'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Button } from '@/components/ui/Button';
import UiIcon from '@/components/ui/UiIcon';
import {
  daySlotBoardCaption,
  daySlotClipProgressState,
  daySlotPlanLabel,
  daySlotProgressState,
  type DaySlot,
  type DaySlotId,
  type DaySlotStill,
} from '@/lib/day-planner';
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from '@/lib/comfyui-live-preview-store';
import { ROLEPLAY_OVERLAY_BTN_CLASS } from '@/components/roleplay/roleplay-story-helpers';
import { slotQualityBadge, type SlotQualityLedger } from '@/lib/play-slot-quality';

export type DaySlotBoardProps = {
  slots: DaySlot[];
  stills: DaySlotStill[];
  activeSlotId: DaySlotId;
  busy?: boolean;
  queueBlocked?: boolean;
  compact?: boolean;
  onSelectSlot: (slotId: DaySlotId) => void;
  onOpenStill?: (slotId: DaySlotId) => void;
  onRetrySlot?: (slot: DaySlot) => void;
  onAnimateSlot?: (slot: DaySlot) => void;
  onRerollSlot?: (slot: DaySlot) => void;
  /** Quality-gate outcomes per slot — drives the review badge on each card. */
  qualityLedger?: SlotQualityLedger;
};

/**
 * Morning → night board: primary way to pick which Day slot you are editing.
 * Completed thumbs stay tappable for a larger view via View / second select.
 * Done frames get Story-style requeue (top-right) and left/right still paging.
 * In-flight Comfy stills show the live render preview in that time-of-day card.
 */
export default function DaySlotBoard({
  slots,
  stills,
  activeSlotId,
  busy = false,
  queueBlocked = false,
  compact = false,
  onSelectSlot,
  onOpenStill,
  onRetrySlot,
  onAnimateSlot,
  onRerollSlot,
  qualityLedger,
}: DaySlotBoardProps) {
  const promptKey = useMemo(
    () =>
      stills
        .flatMap(entry => [entry.promptId, entry.clipPromptId])
        .map(id => id?.trim())
        .filter((id): id is string => Boolean(id))
        .join('|'),
    [stills]
  );
  const [liveByPrompt, setLiveByPrompt] = useState<Record<string, string | null>>({});

  const completedSlotIds = useMemo(
    () =>
      slots
        .filter(slot => {
          const still = stills.find(entry => entry.slotId === slot.id);
          return daySlotProgressState(still) === 'done' && Boolean(still?.imageUrl?.trim());
        })
        .map(slot => slot.id),
    [slots, stills]
  );

  useEffect(() => {
    const refresh = () => {
      const next: Record<string, string | null> = {};
      for (const id of promptKey.split('|').filter(Boolean)) {
        next[id] = getComfyLivePreviewUrl(id);
      }
      setLiveByPrompt(next);
    };
    refresh();
    if (typeof window === 'undefined') {
      return;
    }
    window.addEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, refresh);
  }, [promptKey]);

  const stop = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <ol
      className={compact ? 'grid grid-cols-2 gap-2' : 'grid gap-2 sm:grid-cols-4'}
      data-testid="day-progress"
      aria-label="Day slots"
    >
      {slots.map(slot => {
        const still = stills.find(entry => entry.slotId === slot.id);
        const state = daySlotProgressState(still);
        const clipState = daySlotClipProgressState(still);
        const stillPromptId = still?.promptId?.trim() || '';
        const clipPromptId = still?.clipPromptId?.trim() || '';
        const stillLive =
          stillPromptId && state === 'queued' ? liveByPrompt[stillPromptId]?.trim() || '' : '';
        const clipLive =
          clipPromptId && clipState === 'queued' ? liveByPrompt[clipPromptId]?.trim() || '' : '';
        const doneThumb = state === 'done' ? still?.imageUrl?.trim() || '' : '';
        const showStillLive = Boolean(stillLive);
        const showClipLive = Boolean(clipLive);
        const thumb = doneThumb || stillLive || (!doneThumb && clipLive) || '';
        const baseCaption = daySlotBoardCaption(still);
        const planLabel = daySlotPlanLabel(slot, compact ? 72 : 96);
        const planEmpty = !slot.location?.trim() || !slot.sceneHints?.trim();
        const label = showStillLive
          ? baseCaption === 'Queueing…'
            ? 'Rendering…'
            : baseCaption.replace('Queueing…', 'Rendering…')
          : baseCaption;
        const selected = activeSlotId === slot.id;
        const canAnimate =
          state === 'done' && clipState === 'idle' && Boolean(onAnimateSlot) && !queueBlocked;
        const openable = Boolean(doneThumb);
        const completedIndex = openable ? completedSlotIds.indexOf(slot.id) : -1;
        const canPage = openable && Boolean(onOpenStill) && completedSlotIds.length > 1;
        const prevCompletedId =
          canPage && completedIndex > 0 ? completedSlotIds[completedIndex - 1] : null;
        const nextCompletedId =
          canPage && completedIndex >= 0 && completedIndex < completedSlotIds.length - 1
            ? completedSlotIds[completedIndex + 1]
            : null;
        const canRequeue = openable && Boolean(onRetrySlot) && !queueBlocked && state === 'done';
        const reviewBadge = qualityLedger ? slotQualityBadge(qualityLedger, slot.id) : null;

        const openAdjacent = (adjacentId: DaySlotId) => {
          onSelectSlot(adjacentId);
          onOpenStill?.(adjacentId);
        };

        return (
          <li key={slot.id} className="min-w-0">
            <div
              data-testid={`day-progress-${slot.id}`}
              data-state={state}
              data-clip={clipState}
              data-live={showStillLive || showClipLive ? 'true' : 'false'}
              data-selected={selected ? 'true' : 'false'}
              data-plan-empty={planEmpty ? 'true' : 'false'}
              className={[
                'overflow-hidden rounded-[var(--radius-md)] border transition-[box-shadow,border-color,transform]',
                selected
                  ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] shadow-[var(--shadow-card)] ring-2 ring-[var(--accent-ring)]'
                  : state === 'done'
                    ? 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)]'
                    : state === 'failed'
                      ? 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)]'
                      : state === 'queued'
                        ? 'border-[var(--accent-border)]/60 bg-[var(--accent-muted)]/50'
                        : planEmpty
                          ? 'border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]',
              ].join(' ')}
            >
              {thumb ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumb}
                    alt=""
                    data-testid={
                      showStillLive || (showClipLive && !doneThumb)
                        ? `day-progress-live-${slot.id}`
                        : undefined
                    }
                    className={[
                      compact
                        ? 'aspect-video w-full object-cover'
                        : 'aspect-[4/3] w-full object-cover',
                      showStillLive || (showClipLive && !doneThumb) ? 'opacity-80' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                  {doneThumb && showClipLive ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={clipLive}
                      alt=""
                      data-testid={`day-progress-live-${slot.id}`}
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70"
                    />
                  ) : null}
                  {showStillLive || showClipLive ? (
                    <span className="type-overline pointer-events-none absolute bottom-1.5 left-1.5 z-10 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)]/85 px-1.5 py-0.5 text-[var(--accent-text)]">
                      Live
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="absolute inset-0 z-10 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]"
                    aria-pressed={selected}
                    aria-label={
                      openable
                        ? `Open ${slot.label} full size`
                        : selected
                          ? `${slot.label}, selected — ${planLabel || label}`
                          : `Select ${slot.label} — ${planLabel || label}`
                    }
                    data-testid={`day-slot-select-${slot.id}`}
                    onClick={() => {
                      if (openable && onOpenStill) {
                        onSelectSlot(slot.id);
                        onOpenStill(slot.id);
                        return;
                      }
                      onSelectSlot(slot.id);
                    }}
                  />
                  {canPage ? (
                    <>
                      <button
                        type="button"
                        className={`${ROLEPLAY_OVERLAY_BTN_CLASS} absolute left-1.5 top-1/2 z-20 -translate-y-1/2`}
                        aria-label="Previous Day still"
                        data-testid={`day-progress-prev-${slot.id}`}
                        disabled={!prevCompletedId}
                        onClick={event => {
                          stop(event);
                          if (prevCompletedId) {
                            openAdjacent(prevCompletedId);
                          }
                        }}
                      >
                        <UiIcon name="chevronLeft" size={14} />
                      </button>
                      <button
                        type="button"
                        className={`${ROLEPLAY_OVERLAY_BTN_CLASS} absolute right-1.5 top-1/2 z-20 -translate-y-1/2`}
                        aria-label="Next Day still"
                        data-testid={`day-progress-next-${slot.id}`}
                        disabled={!nextCompletedId}
                        onClick={event => {
                          stop(event);
                          if (nextCompletedId) {
                            openAdjacent(nextCompletedId);
                          }
                        }}
                      >
                        <UiIcon name="chevronRight" size={14} />
                      </button>
                      <p className="pointer-events-none absolute left-1.5 top-1.5 z-20 rounded-full bg-[var(--bg-base)]/75 px-2 py-0.5 type-caption text-[var(--text-secondary)] backdrop-blur-sm">
                        {completedIndex + 1} / {completedSlotIds.length}
                      </p>
                    </>
                  ) : null}
                  {canRequeue ? (
                    <button
                      type="button"
                      className={`${ROLEPLAY_OVERLAY_BTN_CLASS} absolute right-1.5 top-1.5 z-20`}
                      aria-label={`Requeue ${slot.label}`}
                      title="Requeue this still"
                      data-testid={`day-progress-requeue-${slot.id}`}
                      disabled={busy}
                      onClick={event => {
                        stop(event);
                        onSelectSlot(slot.id);
                        onRetrySlot?.(slot);
                      }}
                    >
                      <UiIcon name="retry" size={14} />
                    </button>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  className={[
                    'flex w-full items-center justify-center bg-[var(--bg-muted)]/40 text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]',
                    compact ? 'aspect-video' : 'aspect-[4/3]',
                  ].join(' ')}
                  aria-pressed={selected}
                  aria-label={
                    selected
                      ? `${slot.label}, selected — ${planLabel || label}`
                      : `Select ${slot.label} — ${planLabel || label}`
                  }
                  data-testid={`day-slot-select-${slot.id}`}
                  onClick={() => onSelectSlot(slot.id)}
                >
                  <span className="type-caption">{label}</span>
                </button>
              )}
              <button
                type="button"
                className={[
                  'block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]',
                  compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
                ].join(' ')}
                aria-pressed={selected}
                onClick={() => onSelectSlot(slot.id)}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="type-heading text-sm sm:text-base">{slot.label}</p>
                  {selected ? (
                    <span className="type-overline text-[var(--accent-text)]">Editing</span>
                  ) : null}
                </div>
                <p className="type-caption text-[var(--text-muted)]">{label}</p>
                {planLabel ? (
                  <p
                    className={[
                      'type-caption mt-1 line-clamp-2',
                      planEmpty ? 'text-[var(--accent-text)]' : 'text-[var(--text-secondary)]',
                    ].join(' ')}
                    data-testid={`day-progress-scene-${slot.id}`}
                  >
                    {planLabel}
                  </p>
                ) : null}
                {reviewBadge ? (
                  <p
                    className={[
                      'type-overline mt-1',
                      reviewBadge.tone === 'warn'
                        ? 'text-[var(--tint-danger-text)]'
                        : 'text-[var(--text-muted)]',
                    ].join(' ')}
                    title={reviewBadge.detail || undefined}
                    data-testid={`day-progress-review-${slot.id}`}
                  >
                    {reviewBadge.label}
                    {reviewBadge.detail ? ` · ${reviewBadge.detail}` : ''}
                  </p>
                ) : null}
                {clipState === 'done' ? (
                  <p
                    className="type-overline mt-1 text-[var(--tint-success-text)]"
                    data-testid={`day-progress-clip-${slot.id}`}
                  >
                    Motion
                  </p>
                ) : clipState === 'queued' ? (
                  <p
                    className="type-overline mt-1 text-[var(--accent-text)]"
                    data-testid={`day-progress-clip-${slot.id}`}
                  >
                    Animating…
                  </p>
                ) : clipState === 'failed' ? (
                  <p
                    className="type-overline mt-1 text-[var(--tint-danger-text)]"
                    data-testid={`day-progress-clip-${slot.id}`}
                  >
                    Clip failed
                  </p>
                ) : null}
              </button>
              {onRerollSlot && state === 'idle' ? (
                <div className={compact ? 'px-2.5 pb-2' : 'px-3 pb-2.5'}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-center"
                    disabled={busy}
                    data-testid={`day-progress-reroll-${slot.id}`}
                    onClick={() => {
                      onSelectSlot(slot.id);
                      onRerollSlot(slot);
                    }}
                  >
                    Reroll plan
                  </Button>
                </div>
              ) : null}
              {openable && onOpenStill ? (
                <div className={compact ? 'px-2.5 pb-2' : 'px-3 pb-2.5'}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-center"
                    data-testid={`day-progress-open-${slot.id}`}
                    onClick={() => onOpenStill(slot.id)}
                  >
                    View larger
                  </Button>
                </div>
              ) : null}
              {canAnimate ? (
                <div className={compact ? 'px-2.5 pb-2' : 'px-3 pb-2.5'}>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full justify-center"
                    disabled={busy}
                    data-testid={`day-progress-animate-${slot.id}`}
                    onClick={() => onAnimateSlot?.(slot)}
                  >
                    Animate
                  </Button>
                </div>
              ) : null}
              {state === 'failed' && onRetrySlot ? (
                <div className={compact ? 'px-2.5 pb-2' : 'px-3 pb-2.5'}>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full justify-center"
                    disabled={busy || queueBlocked}
                    data-testid={`day-progress-retry-${slot.id}`}
                    onClick={() => onRetrySlot(slot)}
                  >
                    Retry {slot.label}
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
