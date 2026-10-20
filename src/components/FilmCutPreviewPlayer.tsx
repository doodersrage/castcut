'use client';

import { Button } from '@/components/ui/Button';
import type { FilmCutOptionsValue } from '@/components/FilmCutOptionsControls';
import { formatCutTime, useCutPreview } from '@/hooks/useCutPreview';
import { normalizeMusicLevel, normalizeVoiceLevel } from '@/lib/audio-mix-levels';
import type { KeyedShot } from '@/lib/film/cut-plan';
import type { FilmTitleCard } from '@/lib/video-polish';

/**
 * Preview the cut (useCutPreview): the shots as the encode will put them together, with the
 * music, the lines and the narration — built once per opening; reopen it to pick up changes.
 */
export default function FilmCutPreviewPlayer({
  shots,
  value,
  titleCard,
  testIdPrefix,
  onClose,
}: {
  shots: KeyedShot[];
  value: FilmCutOptionsValue;
  titleCard?: FilmTitleCard | null;
  testIdPrefix: string;
  onClose: () => void;
}) {
  const { canvasRef, loaded, error, playing, time, total, size, shape, play, pause, seek } =
    useCutPreview({ shots, value, titleCard });
  const over100 =
    normalizeMusicLevel(value.musicLevel) > 1 || normalizeVoiceLevel(value.voiceLevel) > 1;
  return (
    <div
      className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-2"
      data-testid={`${testIdPrefix}-preview`}
    >
      <div className="flex justify-center bg-black">
        <canvas
          ref={canvasRef}
          width={size.width}
          height={size.height}
          className="h-auto max-h-[60vh] w-auto max-w-full"
          aria-label="Preview of the cut"
          data-testid={`${testIdPrefix}-preview-canvas`}
          data-shape={shape}
        />
      </div>
      {error ? (
        <p className="type-caption text-[var(--tint-danger-text)]" role="alert">
          {error}
        </p>
      ) : !loaded ? (
        <p className="type-caption text-[var(--text-muted)]" role="status">
          Building the preview…
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              data-testid={`${testIdPrefix}-preview-play`}
              onClick={playing ? pause : play}
            >
              {playing ? 'Pause' : 'Play'}
            </Button>
            <input
              type="range"
              min={0}
              max={total}
              step={0.05}
              value={Math.min(time, total)}
              aria-label="Preview position"
              aria-valuetext={`${formatCutTime(time)} of ${formatCutTime(total)}`}
              className="flex-1 accent-[var(--accent)]"
              data-testid={`${testIdPrefix}-preview-scrub`}
              onChange={event => seek(Number(event.target.value))}
            />
            <span
              className="type-caption tabular-nums text-[var(--text-muted)]"
              data-testid={`${testIdPrefix}-preview-time`}
            >
              {formatCutTime(time)} / {formatCutTime(total)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              data-testid={`${testIdPrefix}-preview-close`}
            >
              Close
            </Button>
          </div>
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid={`${testIdPrefix}-preview-notes`}
          >
            {loaded.timeline.items.filter(item => item.kind !== 'title').length} shots ·{' '}
            {formatCutTime(total)}
            {loaded.notes.length ? ` · ${loaded.notes.join(' · ')}` : ''}
            {over100 ? ' · levels above 100% play at 100% here' : ''}
          </p>
        </>
      )}
    </div>
  );
}
