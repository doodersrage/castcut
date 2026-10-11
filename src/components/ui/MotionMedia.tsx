'use client';

import { useEffect, useState } from 'react';
import { isHtmlVideoViewUrl, stripGalleryViewWidthParam } from '@/lib/comfyui-outputs';

type MotionMediaProps = {
  src: string;
  alt?: string;
  className?: string;
  poster?: string;
  autoPlay?: boolean;
  controls?: boolean;
  loop?: boolean;
  muted?: boolean;
};

/** Retries of the preferred element before trying the other one (a reload hiccup, not a bad file). */
const PREFERRED_RETRIES = 2;
/** "Clip unavailable" tries once more on its own after this long. */
const MISSING_RETRY_MS = 4_000;

/** The url with a retry marker, so the browser asks again instead of reusing the failed load. */
function withRetry(url: string, attempt: number): string {
  if (attempt <= 0) return url;
  return `${url}${url.includes('?') ? '&' : '?'}_retry=${attempt}`;
}

/**
 * Play a clip in-place: `<video>` for mp4/webm, `<img>` for animated webp/gif.
 *
 * A failed load is retried before anything else (twice for the preferred element, then the other
 * element once), and "Clip unavailable" retries once on its own and offers Try again. Before,
 * one failed load right after a page reload — the dev server compiling the route, a busy
 * ComfyUI, the session not ready yet — left the Day card on "Clip unavailable" for good while
 * the same clip played in the lightbox (2026-10-11).
 */
export default function MotionMedia({
  src,
  alt = '',
  className,
  poster,
  autoPlay = true,
  controls = false,
  loop = true,
  muted = true,
}: MotionMediaProps) {
  const url = stripGalleryViewWidthParam(src);
  const preferred = isHtmlVideoViewUrl(url) ? 'video' : 'image';
  const other = preferred === 'video' ? 'image' : 'video';
  // Failures for the current url, and how many times "missing" has been retried.
  const [failures, setFailures] = useState<{ url: string; count: number; rounds: number }>({
    url,
    count: 0,
    rounds: 0,
  });
  const current = failures.url === url ? failures : { url, count: 0, rounds: 0 };
  const failed = current.count;
  const mode =
    failed <= PREFERRED_RETRIES ? preferred : failed === PREFERRED_RETRIES + 1 ? other : 'missing';
  // Each try (and each round after Try again) asks the server afresh.
  const attempt = current.rounds * (PREFERRED_RETRIES + 2) + failed;
  const loadUrl = withRetry(url, attempt);

  const swap = () => {
    // Back off a little between tries: the hiccup is usually gone a second later.
    window.setTimeout(
      () =>
        setFailures(previous => {
          const base = previous.url === url ? previous : { url, count: 0, rounds: 0 };
          return { ...base, count: base.count + 1 };
        }),
      failed < PREFERRED_RETRIES ? 600 * (failed + 1) : 0
    );
  };
  const retry = () =>
    setFailures(previous => {
      const base = previous.url === url ? previous : { url, count: 0, rounds: 0 };
      return { url, count: 0, rounds: base.rounds + 1 };
    });

  // One automatic retry from "missing".
  useEffect(() => {
    if (mode !== 'missing' || current.rounds > 0) return;
    const timer = window.setTimeout(retry, MISSING_RETRY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, current.rounds, url]);

  if (mode === 'missing') {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-[var(--bg-muted)] px-2 text-center ${className ?? ''}`}
        role="img"
        aria-label={alt || 'Clip unavailable'}
        data-testid="motion-media-missing"
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Clip unavailable
        </span>
        <span className="type-caption text-[var(--text-muted)]">
          Can&rsquo;t load it — is ComfyUI running?
        </span>
        <button
          type="button"
          className="type-caption mt-1 rounded border border-[var(--border-subtle)] px-2 py-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          onClick={event => {
            // The card around it opens the clip on click — this is only a retry.
            event.stopPropagation();
            retry();
          }}
          data-testid="motion-media-retry"
        >
          Try again
        </button>
      </div>
    );
  }

  if (mode === 'video') {
    return (
      <video
        key={loadUrl}
        src={loadUrl}
        className={className}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        playsInline
        controls={controls}
        poster={poster}
        onError={swap}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={loadUrl} src={loadUrl} alt={alt} className={className} onError={swap} />
  );
}
