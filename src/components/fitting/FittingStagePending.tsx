'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from '@/lib/comfyui-live-preview-store';
import { COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/comfyui-gallery-storage-meta';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery-entry';
import { daySlotJobProgress } from '@/lib/day-slot-progress';
import { getGalleryCache } from '@/lib/gallery-db-store';

const NO_GALLERY: ComfyGalleryEntry[] = [];

function subscribeGallery(onChange: () => void): () => void {
  window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onChange);
  return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onChange);
}

/** Live preview + queue / render progress for one ComfyUI job (as Day's cards show theirs). */
function useStageJob(promptId: string | null | undefined) {
  const id = promptId?.trim() || '';
  const [live, setLive] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    const refresh = () => setLive(getComfyLivePreviewUrl(id));
    refresh();
    window.addEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, refresh);
  }, [id]);
  const gallery = useSyncExternalStore(subscribeGallery, getGalleryCache, () => NO_GALLERY);
  const entry = useMemo(
    () => (id ? (gallery.find(item => item.promptId === id) ?? null) : null),
    [gallery, id]
  );
  if (!id) return null;
  const job = daySlotJobProgress({ stillStatus: 'queued', entry, livePreview: Boolean(live) });
  return {
    live: id ? live : null,
    label: job?.label ?? 'Queueing…',
    percent: job?.percent ?? null,
  };
}

/**
 * One fixed square frame on Outfit's stage (try-ons render square): the finished picture, or the
 * live preview while its job renders, or a quiet placeholder — the same box throughout, so the
 * stage does not jump when the picture lands.
 */
export function StageFrame({
  job,
  imageUrl,
  alt,
  label,
  testId,
  waitingLabel,
  onOpen,
}: {
  /** The prompt rendering into this frame now, if any. */
  job: string | null | undefined;
  imageUrl: string | null;
  alt: string;
  /** Accessible name when the frame opens the picture. */
  label: string;
  testId: string;
  /** Shown in an empty frame that waits for a later render (the back view). */
  waitingLabel?: string;
  onOpen?: () => void;
}) {
  const progress = useStageJob(job);
  const box =
    'relative block aspect-square w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]';
  const inner = progress ? (
    <>
      {progress.live ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={progress.live} alt="" className="h-full w-full object-contain" />
      ) : (
        <span className="block h-full w-full animate-pulse bg-[var(--bg-muted)] motion-reduce:animate-none" />
      )}
      <span
        className="absolute left-2 top-2 rounded-full bg-[var(--bg-base)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] shadow-sm"
        data-testid={`${testId}-progress`}
      >
        {progress.label}
      </span>
      {progress.percent !== null ? (
        <span
          className="absolute bottom-0 left-0 h-1 bg-[var(--accent)] transition-[width]"
          style={{ width: `${progress.percent}%` }}
          aria-hidden
        />
      ) : null}
    </>
  ) : imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageUrl} alt={alt} className="h-full w-full object-contain" />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-xs text-[var(--text-muted)]">
      {waitingLabel ?? ''}
    </span>
  );
  return onOpen && !progress ? (
    <button
      type="button"
      className={`${box} cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]`}
      aria-label={label}
      data-testid={testId}
      onClick={onOpen}
    >
      {inner}
    </button>
  ) : (
    <div className={box} data-testid={testId} aria-busy={progress ? true : undefined}>
      {inner}
    </div>
  );
}
