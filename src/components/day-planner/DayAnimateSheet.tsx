'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import ModalPortal from '@/components/ui/ModalPortal';
import { SegmentedControl } from '@/components/ui/ToolPageShell';
import {
  DAY_CLIP_EXTRA_SECONDS,
  normalizeDayClipExtraSeconds,
  type DayClipExtraSeconds,
} from '@/lib/day/clip-length';
import type { DaySlot } from '@/lib/day/planner';

export type DayClipPreview = {
  engineLabel: string;
  talking: boolean;
  /** A longer clip comes out silent on this engine (MiniMax-H3 with no spoken line). */
  silentWhenLong?: boolean;
  prompt: string;
  defaultDirection: string;
  /** Clip length in seconds for each DAY_CLIP_EXTRA_SECONDS choice, on this engine. */
  lengthSeconds: number[];
};

/**
 * Animate, with a say in it: the engine the clip runs on and its direction — what happens in
 * the clip, the slot's beat by default — editable. Whatever is typed is built into the prompt the
 * same way the default is (day-clip-direction.ts), so it is formatted for the engine; "What gets
 * sent" shows the result. Talking slots speak their line instead. Length adds seconds to the
 * clip's default (remembered for the next Animate).
 */
export default function DayAnimateSheet({
  slot,
  preview,
  initialExtraSeconds,
  busy,
  onAnimate,
  onClose,
}: {
  slot: DaySlot | null;
  preview: (slot: DaySlot, direction?: string, extraSeconds?: number) => DayClipPreview;
  initialExtraSeconds?: number;
  busy?: boolean;
  onAnimate: (
    slot: DaySlot,
    direction: string | undefined,
    extraSeconds: DayClipExtraSeconds
  ) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const initial = slot ? preview(slot) : null;
  const [direction, setDirection] = useState(initial?.defaultDirection ?? '');
  const [extraSeconds, setExtraSeconds] = useState<DayClipExtraSeconds>(() =>
    normalizeDayClipExtraSeconds(initialExtraSeconds)
  );
  if (!slot || !initial) return null;
  const edited = direction.trim() && direction.trim() !== initial.defaultDirection.trim();
  const current = preview(slot, edited ? direction : undefined, extraSeconds);
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[80] flex items-end justify-center bg-[var(--bg-base)]/70 p-4 backdrop-blur-sm sm:items-center"
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="day-animate-sheet"
          className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          onClick={event => event.stopPropagation()}
          onKeyDown={event => {
            if (event.key === 'Escape') onClose();
          }}
        >
          <div>
            <h2 id={titleId} className="type-heading">
              Animate {slot.label}
            </h2>
            <p className="type-caption text-[var(--text-muted)]" data-testid="day-animate-engine">
              Runs on {current.engineLabel}
              {current.talking ? ' · a talking clip' : ''}
            </p>
          </div>
          {current.talking ? (
            <p
              className="type-caption text-[var(--text-secondary)]"
              data-testid="day-animate-talking"
            >
              This slot has a line, so the clip is her saying it: “{slot.line?.trim()}”. The
              direction doesn&apos;t apply to talking clips — clear the line for a motion clip.
            </p>
          ) : (
            <label className="block space-y-1">
              <span className="type-caption text-[var(--text-muted)]">
                What happens in the clip
              </span>
              <textarea
                rows={3}
                maxLength={300}
                autoFocus
                className="w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 type-body text-[var(--text-primary)]"
                value={direction}
                onChange={event => setDirection(event.target.value)}
                data-testid="day-animate-direction"
              />
              <span className="flex items-center justify-between type-caption text-[var(--text-muted)]">
                <span>
                  {edited
                    ? 'Your direction — formatted for the engine when you Animate.'
                    : 'The slot’s beat. Write what should happen instead, in plain words.'}
                </span>
                {edited ? (
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => setDirection(initial.defaultDirection)}
                    data-testid="day-animate-reset"
                  >
                    Back to the beat
                  </button>
                ) : null}
              </span>
            </label>
          )}
          <div className="space-y-1" data-testid="day-animate-length">
            <span className="type-caption block text-[var(--text-muted)]">Length</span>
            <SegmentedControl
              aria-label="Clip length"
              value={String(extraSeconds)}
              onChange={value => setExtraSeconds(normalizeDayClipExtraSeconds(value))}
              options={DAY_CLIP_EXTRA_SECONDS.map((extra, index) => ({
                value: String(extra),
                label: `${formatSeconds(current.lengthSeconds[index] ?? 0)}${extra === 0 ? ' (default)' : ''}`,
                testId: `day-animate-length-${extra}`,
              }))}
            />
            {extraSeconds > 0 ? (
              <p className="type-caption text-[var(--text-muted)]">
                Longer clips take longer to render, and motion past ~6 s can drift or repeat.
                {current.silentWhenLong
                  ? ' On MiniMax-H3 a longer clip with no line comes out silent — Add sound gives it the place’s sound.'
                  : ''}
              </p>
            ) : null}
          </div>
          <details className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-2 py-1">
            <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
              What gets sent
            </summary>
            <p
              className="type-caption mt-1 whitespace-pre-wrap text-[var(--text-secondary)]"
              data-testid="day-animate-prompt"
            >
              {current.prompt}
            </p>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              data-testid="day-animate-submit"
              onClick={() =>
                onAnimate(slot, edited && !current.talking ? direction : undefined, extraSeconds)
              }
            >
              Animate
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} data-testid="day-animate-cancel">
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** 4 → "4 s", 5.875 → "5.9 s". */
function formatSeconds(seconds: number): string {
  const rounded = Math.round(seconds * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} s`;
}
