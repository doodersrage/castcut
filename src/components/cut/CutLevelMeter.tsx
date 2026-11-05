'use client';

import { Button } from '@/components/ui/Button';
import { useEffect, useRef, useState } from 'react';
import { METER_CLIP_DB, METER_FLOOR_DB, meterFraction, readCutMeter } from '@/lib/film/cut-meter';

/** How long a peak mark holds before it falls (ms). */
const PEAK_HOLD_MS = 1200;

/**
 * The monitor's live level meter: left and right bars (RMS filled, a peak mark that holds), the
 * loudest peak in dBFS, and a clip light that stays on until clicked. Drawn straight to the DOM
 * each frame while playing — no re-render per frame.
 */
export default function CutLevelMeter({ playing }: { playing: boolean }) {
  const barRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const peakRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const readoutRef = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const held: Array<{ db: number; at: number }> = [
      { db: -Infinity, at: 0 },
      { db: -Infinity, at: 0 },
    ];
    let frame = 0;
    let seen = false;
    const tick = () => {
      const reading = readCutMeter();
      const now = performance.now();
      if (reading) {
        if (!seen) {
          seen = true;
          setLive(true);
        }
        for (const channel of [0, 1] as const) {
          const peak = reading.peakDb[channel];
          if (peak >= held[channel]!.db || now - held[channel]!.at > PEAK_HOLD_MS) {
            held[channel] = { db: peak, at: now };
          }
          const bar = barRefs[channel]!.current;
          const mark = peakRefs[channel]!.current;
          if (bar) bar.style.width = `${meterFraction(reading.rmsDb[channel]) * 100}%`;
          if (mark) mark.style.left = `calc(${meterFraction(held[channel]!.db) * 100}% - 1px)`;
          if (peak >= METER_CLIP_DB) setClipped(true);
        }
        const loudest = Math.max(held[0]!.db, held[1]!.db);
        if (readoutRef.current) {
          readoutRef.current.textContent = Number.isFinite(loudest)
            ? `${loudest.toFixed(1)} dB`
            : '−∞ dB';
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      // Paused: the bars empty, the peak marks go back off the left.
      for (const ref of barRefs) if (ref.current) ref.current.style.width = '0%';
      for (const ref of peakRefs) if (ref.current) ref.current.style.left = '-2px';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  return (
    <div
      className="flex items-center gap-1.5"
      role="group"
      aria-label="Audio level"
      title={`Live level while it plays: bars are loudness (RMS), the mark is the peak; ${METER_FLOOR_DB} to 0 dBFS. Keep peaks under −1 dB.`}
      data-testid="cut-level-meter"
      data-live={live ? 'true' : 'false'}
    >
      <div className="flex w-20 flex-col gap-0.5">
        {[0, 1].map(channel => (
          <div
            key={channel}
            className="relative h-1.5 overflow-hidden rounded-full bg-[var(--bg-muted)]"
            aria-hidden="true"
          >
            <div
              ref={barRefs[channel]}
              className="h-full w-0 bg-[linear-gradient(to_right,var(--tint-success-text)_0%,var(--tint-success-text)_75%,var(--tint-warning-text)_88%,var(--tint-danger-text)_100%)] bg-[length:5rem_100%]"
            />
            <div
              ref={peakRefs[channel]}
              className="absolute top-0 h-full w-0.5 bg-[var(--text-primary)]"
              style={{ left: '-2px' }}
            />
          </div>
        ))}
      </div>
      <span
        ref={readoutRef}
        className="w-14 type-caption tabular-nums text-[var(--text-muted)]"
        data-testid="cut-level-readout"
      >
        −∞ dB
      </span>
      <Button
        variant="icon"
        aria-label={clipped ? 'The sound clipped — click to clear' : 'No clipping'}
        title={
          clipped
            ? 'The sound went over 0 dB (clipped). Click to clear.'
            : 'Lights up if the sound clips'
        }
        data-testid="cut-level-clip"
        data-clipped={clipped ? 'true' : 'false'}
        onClick={() => setClipped(false)}
      >
        <span
          aria-hidden="true"
          className={`block h-2.5 w-2.5 rounded-full ${clipped ? 'bg-[var(--tint-danger-text)]' : 'bg-[var(--bg-muted)]'}`}
        />
      </Button>
    </div>
  );
}
