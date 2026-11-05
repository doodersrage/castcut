'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { clippedShares, SKIN_LINE_RAD, vectorPoint, waveformCounts } from '@/lib/film/cut-scopes';

/** The size the frame is read at (enough for a scope, cheap to read every few frames). */
const SAMPLE_W = 160;
const SAMPLE_H = 90;
const WAVE_ROWS = 100;
const VECTOR_SIZE = 100;
/** How often the scopes redraw while the cut plays (ms). */
const PLAYING_EVERY_MS = 200;

/**
 * The monitor's scopes (cut-scopes.ts): a luma waveform — each column's brightness, black at the
 * bottom, white at the top, the 0 / 100% lines marked — and a vectorscope with the skin-tone line,
 * from the frame on the monitor (look, LUT and shot colour included). Below them, how much of the
 * frame is crushed to black or blown to white.
 */
export default function CutScopes({
  canvasRef,
  time,
  playing,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  time: number;
  playing: boolean;
}) {
  const waveRef = useRef<HTMLCanvasElement>(null);
  const vectorRef = useRef<HTMLCanvasElement>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);
  const [clipped, setClipped] = useState<{ black: number; white: number } | null>(null);

  useEffect(() => {
    const draw = () => {
      const source = canvasRef.current;
      const wave = waveRef.current?.getContext('2d');
      const vector = vectorRef.current?.getContext('2d');
      if (!source || !wave || !vector || !source.width) return;
      sampleRef.current ??= document.createElement('canvas');
      const sample = sampleRef.current;
      sample.width = SAMPLE_W;
      sample.height = SAMPLE_H;
      const context = sample.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(source, 0, 0, SAMPLE_W, SAMPLE_H);
      let data: Uint8ClampedArray;
      try {
        data = context.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
      } catch {
        return;
      }
      // Waveform: brighter where more pixels share a level.
      const counts = waveformCounts(data, SAMPLE_W, SAMPLE_H, SAMPLE_W, WAVE_ROWS);
      const image = wave.createImageData(SAMPLE_W, WAVE_ROWS);
      for (let col = 0; col < SAMPLE_W; col += 1) {
        for (let row = 0; row < WAVE_ROWS; row += 1) {
          const n = counts[col * WAVE_ROWS + row]!;
          if (!n) continue;
          const i = ((WAVE_ROWS - 1 - row) * SAMPLE_W + col) * 4;
          const v = Math.min(255, 70 + n * 40);
          image.data[i] = v * 0.45;
          image.data[i + 1] = v;
          image.data[i + 2] = v * 0.45;
          image.data[i + 3] = 255;
        }
      }
      wave.fillStyle = '#000';
      wave.fillRect(0, 0, SAMPLE_W, WAVE_ROWS);
      wave.putImageData(image, 0, 0);
      wave.fillStyle = 'rgba(255,255,255,0.25)';
      wave.fillRect(0, 0, SAMPLE_W, 1);
      wave.fillRect(0, WAVE_ROWS - 1, SAMPLE_W, 1);
      wave.fillRect(0, Math.round(WAVE_ROWS / 2), SAMPLE_W, 1);
      // Vectorscope: each pixel at its hue / saturation, the skin line from the centre.
      const half = VECTOR_SIZE / 2;
      vector.fillStyle = '#000';
      vector.fillRect(0, 0, VECTOR_SIZE, VECTOR_SIZE);
      vector.strokeStyle = 'rgba(255,255,255,0.25)';
      vector.beginPath();
      vector.arc(half, half, half - 2, 0, Math.PI * 2);
      vector.moveTo(half, half);
      vector.lineTo(
        half + Math.cos(SKIN_LINE_RAD) * (half - 2),
        half - Math.sin(SKIN_LINE_RAD) * (half - 2)
      );
      vector.stroke();
      vector.fillStyle = 'rgba(140,255,140,0.35)';
      for (let i = 0; i < data.length; i += 8) {
        const point = vectorPoint(data[i]!, data[i + 1]!, data[i + 2]!);
        vector.fillRect(half + point.x * 2 * (half - 2), half - point.y * 2 * (half - 2), 1, 1);
      }
      setClipped(clippedShares(data));
    };
    draw();
    if (!playing) {
      // A clip's frame paints a moment after a seek.
      const timer = window.setTimeout(draw, 180);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setInterval(draw, PLAYING_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [canvasRef, playing, time]);

  const percent = (value: number) => `${Math.round(value * 100)}%`;
  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="cut-scopes">
      <figure className="space-y-0.5">
        <canvas
          ref={waveRef}
          width={SAMPLE_W}
          height={WAVE_ROWS}
          className="block h-[100px] w-[160px] rounded-[var(--radius-sm)]"
          aria-label="Waveform: brightness across the frame"
          data-testid="cut-scope-waveform"
        />
        <figcaption className="type-caption text-[var(--text-muted)]">Waveform</figcaption>
      </figure>
      <figure className="space-y-0.5">
        <canvas
          ref={vectorRef}
          width={VECTOR_SIZE}
          height={VECTOR_SIZE}
          className="block h-[100px] w-[100px] rounded-[var(--radius-sm)]"
          aria-label="Vectorscope: hue and saturation, with the skin-tone line"
          data-testid="cut-scope-vector"
        />
        <figcaption className="type-caption text-[var(--text-muted)]">Vectorscope</figcaption>
      </figure>
      {clipped ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="cut-scope-clipped">
          Crushed {percent(clipped.black)} · blown {percent(clipped.white)}
        </p>
      ) : null}
    </div>
  );
}
