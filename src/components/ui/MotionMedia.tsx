'use client';

import { useState } from 'react';
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

/**
 * Play a clip in-place: `<video>` for mp4/webm, `<img>` for animated webp/gif.
 * Falls back once if the first element cannot decode the bytes, then to a placeholder.
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
  // Failures for the current url: 1 → try the other element, 2 → neither decodes (file gone or
  // ComfyUI offline), show a placeholder instead of a broken-image icon.
  const [failures, setFailures] = useState<{ url: string; count: number }>({ url, count: 0 });
  const failed = failures.url === url ? failures.count : 0;
  const mode =
    failed >= 2
      ? 'missing'
      : failed === 1
        ? preferred === 'video'
          ? 'image'
          : 'video'
        : preferred;

  const swap = () => {
    setFailures(previous => ({
      url,
      count: (previous.url === url ? previous.count : 0) + 1,
    }));
  };

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
      </div>
    );
  }

  if (mode === 'video') {
    return (
      <video
        src={url}
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
    <img src={url} alt={alt} className={className} onError={swap} />
  );
}
