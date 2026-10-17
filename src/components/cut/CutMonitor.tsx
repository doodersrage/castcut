'use client';

/**
 * Cut's monitor: the cut as it will come out (useCutPreview, rebuilt after each edit), the
 * transport, and the timeline under it.
 */

import type { ReactNode, RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { formatCutTime, type CutPreviewLoaded } from '@/hooks/useCutPreview';

export default function CutMonitor({
  canvasRef,
  size,
  shape,
  loaded,
  building,
  error,
  playing,
  time,
  total,
  onPlay,
  onPause,
  onSeek,
  onPrev,
  onNext,
  extra,
  timeline,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  size: { width: number; height: number };
  shape: string;
  loaded: CutPreviewLoaded | null;
  building: boolean;
  error: string | null;
  playing: boolean;
  time: number;
  total: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (t: number) => void;
  onPrev: () => void;
  onNext: () => void;
  /** Beside the transport (Record narration, undo / redo). */
  extra?: ReactNode;
  timeline: ReactNode;
}) {
  const transportButton =
    'inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40';
  return (
    <div className="space-y-2" data-testid="cut-preview">
      <div className="relative flex justify-center overflow-hidden rounded-[var(--radius-md)] bg-black">
        <canvas
          ref={canvasRef}
          width={size.width}
          height={size.height}
          className="h-auto max-h-[52vh] w-auto max-w-full"
          aria-label="The cut"
          data-testid="cut-preview-canvas"
          data-shape={shape}
        />
        {building ? (
          <span
            className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[11px] text-white"
            role="status"
            data-testid="cut-preview-building"
          >
            {loaded ? 'Updating…' : 'Building the cut…'}
          </span>
        ) : null}
      </div>
      {error && !loaded ? (
        <p className="type-caption text-[var(--tint-danger-text)]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={transportButton}
          disabled={!loaded}
          aria-label="Previous shot (←)"
          title="Previous shot (←)"
          onClick={onPrev}
        >
          ⏮
        </button>
        <Button
          size="sm"
          variant="primary"
          disabled={!loaded}
          data-testid="cut-preview-play"
          title="Play / pause (Space)"
          onClick={playing ? onPause : onPlay}
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <button
          type="button"
          className={transportButton}
          disabled={!loaded}
          aria-label="Next shot (→)"
          title="Next shot (→)"
          onClick={onNext}
        >
          ⏭
        </button>
        <input
          type="range"
          min={0}
          max={total}
          step={0.05}
          value={Math.min(time, total)}
          disabled={!loaded}
          aria-label="Position in the cut"
          aria-valuetext={`${formatCutTime(time)} of ${formatCutTime(total)}`}
          className="min-w-[6rem] flex-1 accent-[var(--accent)]"
          data-testid="cut-preview-scrub"
          onChange={event => onSeek(Number(event.target.value))}
        />
        <span
          className="type-caption tabular-nums text-[var(--text-muted)]"
          data-testid="cut-preview-time"
        >
          {formatCutTime(time)} / {formatCutTime(total)}
        </span>
        {extra}
      </div>
      {loaded ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="cut-preview-notes">
          {loaded.timeline.items.filter(item => item.kind !== 'title').length} shots ·{' '}
          {formatCutTime(total)}
          {loaded.notes.length ? ` · ${loaded.notes.join(' · ')}` : ''}
        </p>
      ) : null}
      {timeline}
    </div>
  );
}
