'use client';

/**
 * Cut's sound lane, under the shots: the music's waveform over the cut's length (where it runs
 * out, or runs on past the end), and where lines are spoken and narration plays.
 */

import { useEffect, useRef, useState } from 'react';
import type { CutPreviewLoaded } from '@/hooks/useCutPreview';
import { audioPeaks } from '@/lib/audio/peaks-client';

export default function CutSoundLane({
  loaded,
  pps,
  width,
  bedUrl,
  bedLabel,
}: {
  loaded: CutPreviewLoaded | null;
  /** Pixels per second (the timeline's scale). */
  pps: number;
  width: number;
  bedUrl?: string;
  bedLabel?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The waveform of the track it was read from (a changed track shows nothing until read).
  const [read, setRead] = useState<{
    url: string;
    data: { peaks: Float32Array; seconds: number } | null;
  } | null>(null);
  useEffect(() => {
    if (!bedUrl) return;
    let cancelled = false;
    void audioPeaks(bedUrl).then(data => {
      if (!cancelled) setRead({ url: bedUrl, data });
    });
    return () => {
      cancelled = true;
    };
  }, [bedUrl]);
  const bed = bedUrl && read?.url === bedUrl ? read.data : null;

  const total = loaded?.timeline.totalSec ?? 0;
  // Draw the waveform: the part that plays in the cut bright, the rest faint.
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!bed) return;
    const drawn = Math.min(canvas.width, Math.round(bed.seconds * pps));
    const mid = canvas.height / 2;
    for (let x = 0; x < drawn; x += 2) {
      const at = Math.floor((x / pps / bed.seconds) * bed.peaks.length);
      const peak = bed.peaks[Math.min(bed.peaks.length - 1, at)] ?? 0;
      const h = Math.max(1, peak * (canvas.height - 4));
      context.fillStyle = x / pps <= total ? 'rgba(124,92,255,0.75)' : 'rgba(124,92,255,0.25)';
      context.fillRect(x, mid - h / 2, 1.5, h);
    }
  }, [bed, pps, total]);

  const items = loaded?.timeline.items ?? [];
  const lines = items.filter(item => item.shot >= 0 && loaded?.shots[item.shot]?.spoken?.trim());
  const narrated = items.filter(
    item => item.shot >= 0 && loaded?.shots[item.shot]?.narrationText?.trim()
  );
  const note = bed
    ? bed.seconds + 0.5 < total
      ? `${bedLabel ? `${bedLabel} — ` : ''}the music ends ${Math.round(total - bed.seconds)} s before the cut`
      : bed.seconds > total + 1
        ? `${bedLabel ? `${bedLabel} — ` : ''}fades out at the cut's end (${Math.round(bed.seconds - total)} s left over)`
        : bedLabel || 'Music'
    : bedUrl
      ? 'Reading the music…'
      : 'No music — add a track or Score this film in Options';
  return (
    <div
      className="absolute inset-x-0"
      style={{ top: 118, height: 52 }}
      data-testid="cut-sound-lane"
    >
      <canvas
        ref={canvasRef}
        width={Math.max(1, Math.round(width))}
        height={30}
        className="absolute left-0 top-0 h-[30px]"
        style={{ width: Math.round(width) }}
        aria-hidden
      />
      {lines.map(item => (
        <span
          key={`l${item.shot}`}
          className="absolute top-0 h-[30px] rounded-sm border border-[var(--accent)] bg-[var(--accent)]/20"
          style={{ left: item.startSec * pps, width: Math.max(4, item.durSec * pps - 2) }}
          title={`Line: “${loaded?.shots[item.shot]?.spoken}”`}
        />
      ))}
      {narrated.map(item => (
        <span
          key={`n${item.shot}`}
          className="absolute top-[18px] h-[12px] truncate rounded-sm bg-amber-400/70 px-1 text-[9px] leading-[12px] text-black"
          style={{ left: item.startSec * pps, width: Math.max(24, item.durSec * pps - 2) }}
          title={`Narration: ${loaded?.shots[item.shot]?.narrationText}`}
        >
          {loaded?.shots[item.shot]?.narrationText}
        </span>
      ))}
      <span
        className="absolute left-1 top-[32px] truncate text-[10px] text-[var(--text-muted)]"
        data-testid="cut-sound-note"
      >
        ♪ {note}
        {lines.length ? ` · ${lines.length} line${lines.length === 1 ? '' : 's'}` : ''}
        {narrated.length ? ` · ${narrated.length} narrated` : ''}
      </span>
    </div>
  );
}
