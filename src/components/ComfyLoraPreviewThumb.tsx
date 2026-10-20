'use client';

import { useState } from 'react';
import { comfyLoraPreviewSrc } from '@/lib/comfyui/object-info-cache';

const missingPreviewSrcs = new Set<string>();

type ComfyLoraPreviewThumbProps = {
  filename: string;
  pathIndex?: number;
  comfyUrl?: string;
  className?: string;
};

/** Hides after a miss so LoRAs without Comfy previews are not re-requested. */
export default function ComfyLoraPreviewThumb({
  filename,
  pathIndex = 0,
  comfyUrl,
  className = 'h-8 w-8 shrink-0 rounded object-cover',
}: ComfyLoraPreviewThumbProps) {
  const trimmed = filename.trim();
  const src = trimmed ? comfyLoraPreviewSrc(trimmed, pathIndex, comfyUrl) : '';
  const [hidden, setHidden] = useState(() => !src || missingPreviewSrcs.has(src));

  if (!src || hidden) {
    return null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- ComfyUI preview is a remote binary
    <img
      src={src}
      alt=""
      width={32}
      height={32}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => {
        missingPreviewSrcs.add(src);
        setHidden(true);
      }}
    />
  );
}
