'use client';

import { useState } from 'react';

/**
 * Two pictures under one handle: the "after" over the "before", cut where the handle is — drag
 * (or arrow keys on the slider) to see what changed. Both are drawn at the same box and fit.
 */
export default function BeforeAfterSlider({
  before,
  after,
  beforeLabel = 'Before',
  afterLabel = 'After',
  className = '',
  testId = 'before-after',
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  testId?: string;
}) {
  const [at, setAt] = useState(50);
  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius-md)] bg-black select-none ${className}`.trim()}
      data-testid={testId}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a ComfyUI view URL */}
      <img
        src={before}
        alt={beforeLabel}
        className="block h-full max-h-[60vh] w-full object-contain"
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- a ComfyUI view URL */}
      <img
        src={after}
        alt={afterLabel}
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ clipPath: `inset(0 0 0 ${at}%)` }}
      />
      <span
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
        style={{ left: `${at}%` }}
      />
      <span className="type-caption pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 text-white">
        {beforeLabel}
      </span>
      <span className="type-caption pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-1.5 text-white">
        {afterLabel}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={at}
        aria-label={`${beforeLabel} and ${afterLabel}: drag to compare`}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        data-testid={`${testId}-handle`}
        onChange={event => setAt(Number(event.target.value))}
      />
    </div>
  );
}
