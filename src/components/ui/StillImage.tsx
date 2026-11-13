'use client';

import { useState } from 'react';

type StillImageProps = {
  src: string;
  alt?: string;
  className?: string;
  /** A small thumb: the fallback says only "Unavailable". */
  compact?: boolean;
};

/** "Still unavailable" asks again on its own after one failed load: usually a reload hiccup. */
const RETRY_MS = 800;

/**
 * A still that can fail to load (ComfyUI offline, a file moved): one quiet retry, then a muted
 * "Still unavailable" panel the size of the image, instead of the browser's broken-image icon and
 * alt text (UI audit 2026-11-12, Story's stills with ComfyUI off). Clips have MotionMedia.
 */
export default function StillImage({ src, alt = '', className = '', compact }: StillImageProps) {
  const [failed, setFailed] = useState<{ src: string; count: number }>({ src, count: 0 });
  const count = failed.src === src ? failed.count : 0;
  if (count > 1) {
    return (
      <span
        role="img"
        aria-label={alt ? `${alt} (unavailable)` : 'Still unavailable'}
        data-testid="still-image-missing"
        className={`flex flex-col items-center justify-center gap-0.5 bg-[var(--bg-muted)] px-2 text-center ${className}`}
      >
        <span className="text-3xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {compact ? 'Unavailable' : 'Still unavailable'}
        </span>
        {compact ? null : (
          <span className="type-caption text-[var(--text-muted)]">
            Can&rsquo;t load it — is ComfyUI running?
          </span>
        )}
      </span>
    );
  }
  const loadUrl = count === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}_retry=1`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={loadUrl}
      src={loadUrl}
      alt={alt}
      className={className}
      onError={() =>
        window.setTimeout(
          () =>
            setFailed(previous => ({
              src,
              count: (previous.src === src ? previous.count : 0) + 1,
            })),
          count === 0 ? RETRY_MS : 0
        )
      }
    />
  );
}
