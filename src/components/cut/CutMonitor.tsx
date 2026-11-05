'use client';

/**
 * Cut's monitor: the cut as it will come out (useCutPreview, rebuilt after each edit), the
 * transport, and the timeline under it.
 */

import { useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { SubtitleStyle } from '@/lib/video/subtitle-style';
import { Button } from '@/components/ui/Button';
import { formatCutTime, type CutPreviewLoaded } from '@/hooks/useCutPreview';

/** The monitor's subtitle in each look (server-encode draws the film's the same way). */
const SUBTITLE_LOOK_CLASS: Record<SubtitleStyle, string> = {
  classic: 'bottom-[6%] rounded bg-black/70 px-2 py-0.5 text-sm text-white sm:text-base',
  bold: 'bottom-[16%] text-base font-bold text-white sm:text-xl',
  pop: 'bottom-[16%] text-base font-bold text-[#FFE14D] sm:text-xl',
  words: 'bottom-[22%] text-xl font-extrabold text-white sm:text-3xl',
};
const OUTLINE = {
  textShadow: '0 0 3px #000, 0 0 3px #000, 0 2px 4px rgb(0 0 0 / 0.6)',
  WebkitTextStroke: '0.5px #000',
};
const SUBTITLE_LOOK_STYLE: Record<SubtitleStyle, CSSProperties | undefined> = {
  classic: undefined,
  bold: OUTLINE,
  pop: OUTLINE,
  words: OUTLINE,
};

/**
 * Safe areas over the picture. Vertical: the bands Shorts, Reels and TikTok cover with their own
 * buttons, name and caption (top ~10 %, bottom ~25 %, right ~15 %); square: a feed's top and bottom
 * bars; widescreen: the title-safe (90 %) and action-safe (95 %) frames.
 */
function SafeAreaGuides({ shape }: { shape: string }) {
  const band = 'absolute bg-[rgb(255_80_80/0.22)]';
  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-testid="cut-preview-safe-guides"
      data-shape={shape}
    >
      {shape === 'vertical' ? (
        <>
          <div className={`${band} inset-x-0 top-0 h-[10%]`} />
          <div className={`${band} inset-x-0 bottom-0 h-[25%]`} />
          <div className={`${band} bottom-[25%] right-0 top-[10%] w-[15%]`} />
        </>
      ) : shape === 'square' ? (
        <>
          <div className={`${band} inset-x-0 top-0 h-[8%]`} />
          <div className={`${band} inset-x-0 bottom-0 h-[14%]`} />
        </>
      ) : null}
      <div className="absolute inset-[5%] rounded-sm border border-dashed border-white/50" />
      <div className="absolute inset-[2.5%] rounded-sm border border-dashed border-white/25" />
    </div>
  );
}

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
  subtitle,
  subtitleStyle = 'classic',
  rate,
  onRate,
  looping,
  onLoop,
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
  /** The subtitle cue at the playhead (M10 T3): shown over the picture while CC is on. */
  subtitle?: string | null;
  /** How the film draws its subtitles (subtitle-style.ts): the monitor shows the same look. */
  subtitleStyle?: SubtitleStyle;
  /** Playback speed (1 = as it plays) and its picker. */
  rate?: number;
  onRate?: (rate: number) => void;
  /** Looping the shot under the playhead, and the switch. */
  looping?: boolean;
  onLoop?: () => void;
}) {
  const [captionsOn, setCaptionsOn] = useState(true);
  // Safe areas: where a phone's own buttons and captions sit (vertical / square), or the title-safe
  // frame (widescreen) — so a subtitle or a face isn't put under them.
  const [safeOn, setSafeOn] = useState(false);
  const pictureRef = useRef<HTMLDivElement>(null);
  const transportButton =
    'inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40';
  return (
    <div className="space-y-2" data-testid="cut-preview">
      <div
        ref={pictureRef}
        className="relative flex items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-black"
        data-testid="cut-preview-picture"
      >
        <div className="relative max-w-full">
          <canvas
            ref={canvasRef}
            width={size.width}
            height={size.height}
            className="block h-auto max-h-[52vh] w-auto max-w-full [:fullscreen_&]:max-h-screen"
            aria-label="The cut"
            data-testid="cut-preview-canvas"
            data-shape={shape}
          />
          {safeOn ? <SafeAreaGuides shape={shape} /> : null}
        </div>
        {captionsOn && subtitle ? (
          <p
            className={`pointer-events-none absolute inset-x-4 mx-auto w-fit max-w-[90%] whitespace-pre-line text-center ${SUBTITLE_LOOK_CLASS[subtitleStyle]}`}
            style={SUBTITLE_LOOK_STYLE[subtitleStyle]}
            data-testid="cut-preview-subtitle"
            data-style={subtitleStyle}
          >
            {subtitle}
          </p>
        ) : null}
        {building ? (
          <span
            className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 text-2xs text-white"
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
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={captionsOn}
          title={
            captionsOn ? 'Hide the subtitles on the monitor' : 'Show the subtitles on the monitor'
          }
          data-testid="cut-preview-cc"
          onClick={() => setCaptionsOn(value => !value)}
        >
          CC
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={safeOn}
          title={
            shape === 'wide'
              ? 'Show the title-safe frame'
              : 'Show where Shorts, Reels and TikTok put their own buttons and captions'
          }
          data-testid="cut-preview-safe"
          onClick={() => setSafeOn(value => !value)}
        >
          Safe
        </Button>
        {onLoop ? (
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={looping === true}
            disabled={!loaded}
            title="Loop the shot under the playhead"
            data-testid="cut-preview-loop"
            onClick={onLoop}
          >
            Loop
          </Button>
        ) : null}
        {onRate ? (
          <select
            value={String(rate ?? 1)}
            aria-label="Playback speed"
            className="ui-select h-8 w-16 text-xs"
            data-testid="cut-preview-rate"
            onChange={event => onRate(Number(event.target.value))}
          >
            {[0.5, 1, 1.5, 2].map(value => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          className={transportButton}
          disabled={!loaded}
          aria-label="Full screen"
          title="Full screen"
          data-testid="cut-preview-fullscreen"
          onClick={() => {
            const element = pictureRef.current;
            if (!element) return;
            if (document.fullscreenElement) void document.exitFullscreen();
            else void element.requestFullscreen?.().catch(() => undefined);
          }}
        >
          ⛶
        </button>
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
