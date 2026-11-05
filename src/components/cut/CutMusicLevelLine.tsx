'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { normalizeCutLevelKeys, withCutLevelKey, type CutLevelKey } from '@/lib/video/cut-sound';

/** The lane's height (px) the line is drawn in, and the margin top and bottom. */
const PAD = 3;

/**
 * The music's level points on its lane (cut-sound.ts musicKeys): a line through them over the
 * waveform, 0 at the bottom, 1 in the middle, 2 at the top. Double-click the lane to add a point
 * there; drag a point to move it (sideways in time, up and down in level); a point is a slider —
 * ↑ / ↓ change its level, Delete removes it. Alt-click removes one too.
 */
export default function CutMusicLevelLine({
  keys: rawKeys,
  pps,
  totalSec,
  height,
  disabled,
  onChange,
  what = 'Music',
  testId = 'cut-music-keys',
}: {
  keys: CutLevelKey[] | undefined;
  pps: number;
  totalSec: number;
  height: number;
  disabled?: boolean;
  onChange: (keys: CutLevelKey[]) => void;
  /** What the line is the level of (its points' names): "Music", a clip's title. */
  what?: string;
  testId?: string;
}) {
  const keys = normalizeCutLevelKeys(rawKeys);
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const span = height - PAD * 2;
  const yOf = (level: number) => PAD + span * (1 - level / 2);
  const levelOf = (y: number) => Math.min(2, Math.max(0, 2 * (1 - (y - PAD) / span)));
  const width = Math.max(1, totalSec * pps);

  const pointAt = (event: { clientX: number; clientY: number }) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      atSec: Math.min(totalSec, Math.max(0, (event.clientX - box.left) / pps)),
      level: Math.round(levelOf(event.clientY - box.top) * 20) / 20,
    };
  };

  const line = keys.length
    ? [
        `0,${yOf(keys[0]!.level)}`,
        ...keys.map(key => `${key.atSec * pps},${yOf(key.level)}`),
        `${width},${yOf(keys[keys.length - 1]!.level)}`,
      ].join(' ')
    : '';

  const move = (index: number, next: CutLevelKey) => {
    const rest = keys.filter((_, i) => i !== index);
    onChange(withCutLevelKey(rest, next.atSec, next.level));
  };

  return (
    <div
      ref={ref}
      className="absolute left-0 top-0"
      style={{ width, height }}
      data-testid={testId}
      title={`${what} level points — double-click to add one; drag to move; Alt-click or Delete removes`}
      onDoubleClick={event => {
        if (disabled) return;
        const point = pointAt(event);
        if (point) onChange(withCutLevelKey(keys, point.atSec, point.level));
      }}
    >
      {line ? (
        <svg
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
          aria-hidden="true"
        >
          <polyline points={line} fill="none" stroke="var(--tint-warning-text)" strokeWidth={1.5} />
        </svg>
      ) : null}
      {keys.map((key, index) => (
        <span
          key={`${key.atSec}-${index}`}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={`${what} level at ${key.atSec.toFixed(1)} s`}
          aria-valuemin={0}
          aria-valuemax={200}
          aria-valuenow={Math.round(key.level * 100)}
          aria-valuetext={`${Math.round(key.level * 100)}%`}
          className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-[var(--bg-base)] bg-[var(--tint-warning-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${dragging === index ? 'cursor-grabbing' : ''}`}
          style={{ left: key.atSec * pps, top: yOf(key.level) }}
          data-testid={`${testId === 'cut-music-keys' ? 'cut-music-key' : `${testId}-key`}-${index}`}
          onPointerDown={(event: ReactPointerEvent<HTMLSpanElement>) => {
            if (disabled) return;
            event.stopPropagation();
            if (event.altKey) {
              onChange(keys.filter((_, i) => i !== index));
              return;
            }
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(index);
          }}
          onPointerMove={event => {
            if (dragging !== index) return;
            const point = pointAt(event);
            if (point) move(index, point);
          }}
          onPointerUp={event => {
            if (dragging !== index) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            setDragging(null);
          }}
          onDoubleClick={event => event.stopPropagation()}
          onKeyDown={event => {
            if (disabled) return;
            if (event.key === 'Delete' || event.key === 'Backspace') {
              event.preventDefault();
              event.stopPropagation();
              onChange(keys.filter((_, i) => i !== index));
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              event.stopPropagation();
              const step = event.key === 'ArrowUp' ? 0.05 : -0.05;
              move(index, { atSec: key.atSec, level: Math.min(2, Math.max(0, key.level + step)) });
            }
          }}
        />
      ))}
    </div>
  );
}
