'use client';

import MotionMedia from '@/components/ui/MotionMedia';
import {
  isMotionViewUrl,
  stripGalleryViewWidthParam,
  type ComfyOutputMediaKind,
} from '@/lib/comfyui/outputs';

type GalleryKindPreviewProps = {
  kind: ComfyOutputMediaKind;
  src: string;
  filename?: string;
  className?: string;
  alt?: string;
  controls?: boolean;
};

/**
 * In-place preview for a gallery output: clip, audio player, 3D placeholder, or still.
 */
export default function GalleryKindPreview({
  kind,
  src,
  filename,
  className,
  alt = '',
  controls = false,
}: GalleryKindPreviewProps) {
  const url = stripGalleryViewWidthParam(src);
  if (kind === 'video' || isMotionViewUrl(url)) {
    return (
      <MotionMedia
        src={url}
        alt={alt}
        className={className}
        autoPlay
        loop
        muted
        controls={controls}
      />
    );
  }
  if (kind === 'audio') {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-[var(--bg-muted)] px-3 py-4 ${className ?? ''}`}
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Audio
        </span>
        <audio src={url} controls className="w-full max-w-full" preload="metadata">
          <track kind="captions" />
        </audio>
      </div>
    );
  }
  if (kind === 'mesh') {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-[var(--bg-muted)] px-3 text-center ${className ?? ''}`}
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          3D mesh
        </span>
        <span className="max-w-full truncate text-xs text-[var(--text-secondary)]">
          {filename?.trim() || 'Download to open in a 3D app'}
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" decoding="async" className={className} />
  );
}
