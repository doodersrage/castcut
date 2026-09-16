'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  daySlotBoardCaption,
  daySlotClipProgressState,
  daySlotProgressState,
  type DaySlot,
  type DaySlotId,
  type DaySlotStill,
} from '@/lib/day-planner';
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from '@/lib/comfyui-live-preview-store';

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
};

/**
 * Morning → night board: primary way to pick which Day slot you are editing.
 * Completed thumbs stay tappable for a larger view via View / second select.
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
        const label = showStillLive
          ? baseCaption === 'Queueing…'
            ? 'Rendering…'
            : baseCaption.replace('Queueing…', 'Rendering…')
          : baseCaption;
        const selected = activeSlotId === slot.id;
        const canAnimate =
          state === 'done' && clipState === 'idle' && Boolean(onAnimateSlot) && !queueBlocked;
        const openable = Boolean(doneThumb);
        return (
          <li key={slot.id} className="min-w-0">
            <div
              data-testid={`day-progress-${slot.id}`}
              data-state={state}
              data-clip={clipState}
              data-live={showStillLive || showClipLive ? 'true' : 'false'}
              data-selected={selected ? 'true' : 'false'}
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
                        : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]',
              ].join(' ')}
            >
              <button
                type="button"
                className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]"
                aria-pressed={selected}
                aria-label={
                  selected
                    ? `${slot.label}, selected — ${label}`
                    : `Select ${slot.label} — ${label}`
                }
                data-testid={`day-slot-select-${slot.id}`}
                onClick={() => {
                  if (selected && openable && onOpenStill) {
                    onOpenStill(slot.id);
                    return;
                  }
                  onSelectSlot(slot.id);
                }}
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
                      <span className="type-overline absolute bottom-1.5 left-1.5 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)]/85 px-1.5 py-0.5 text-[var(--accent-text)]">
                        Live
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div
                    className={[
                      'flex items-center justify-center bg-[var(--bg-muted)]/40 text-[var(--text-muted)]',
                      compact ? 'aspect-video' : 'aspect-[4/3]',
                    ].join(' ')}
                    aria-hidden
                  >
                    <span className="type-caption">{label}</span>
                  </div>
                )}
                <div className={compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="type-heading text-sm sm:text-base">{slot.label}</p>
                    {selected ? (
                      <span className="type-overline text-[var(--accent-text)]">Editing</span>
                    ) : null}
                  </div>
                  <p className="type-caption text-[var(--text-muted)]">{label}</p>
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
                </div>
              </button>
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
