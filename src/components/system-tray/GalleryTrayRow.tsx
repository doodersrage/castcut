'use client';

import { useEffect, useState } from 'react';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from '@/lib/comfyui-live-preview-store';
import { galleryCardCaption } from '@/lib/gallery-card-caption';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import UiIcon from '@/components/ui/UiIcon';
import { TrayProgressBar } from '@/components/system-tray/TrayProgressBar';
import {
  galleryJobPercent,
  galleryJobProgressLabel,
  galleryJobStatusLabel,
} from '@/components/system-tray/system-tray-helpers';

export function GalleryTrayRow({
  entry,
  onCancel,
  cancelling,
}: {
  entry: ComfyGalleryEntry;
  onCancel: (entry: ComfyGalleryEntry) => void;
  cancelling?: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    getComfyLivePreviewUrl(entry.promptId, [entry.clientId])
  );
  const percent = galleryJobPercent(entry);
  const progressLabel = galleryJobProgressLabel(entry);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setPreviewUrl(getComfyLivePreviewUrl(entry.promptId, [entry.clientId]));
    });
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<{ promptId?: string; keys?: string[] }>).detail;
      const keys = detail?.keys ?? (detail?.promptId ? [detail.promptId] : []);
      const ours = [entry.promptId, entry.clientId].filter(Boolean) as string[];
      if (keys.length > 0 && ours.length > 0 && !keys.some(key => ours.includes(key))) {
        return;
      }
      setPreviewUrl(getComfyLivePreviewUrl(entry.promptId, [entry.clientId]));
    };
    window.addEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, onPreview);
    return () => window.removeEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, onPreview);
  }, [entry.promptId, entry.clientId]);

  return (
    <li className="flex items-start gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/80 px-3 py-2.5">
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt=""
          className="h-11 w-11 shrink-0 rounded-lg border border-[var(--border-default)]/60 object-cover"
        />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]">
          <span className="inline-flex text-[var(--accent-text)]">
            <UiIcon name={entry.status === 'running' ? 'play' : 'pending'} size={14} />
          </span>
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-[var(--text-primary)]">
            {galleryCardCaption(entry.prompt) || entry.model || 'Generation job'}
          </p>
          <button
            type="button"
            disabled={cancelling}
            onClick={() => onCancel(entry)}
            className="shrink-0 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        </div>
        <p className="type-caption text-[var(--text-tertiary)]">
          {galleryJobStatusLabel({
            promptId: entry.promptId,
            status: entry.status,
            statusMessage: entry.statusMessage,
            queuePosition: entry.queuePosition,
            progressValue: entry.progressValue,
            progressMax: entry.progressMax,
            progressNode: entry.progressNode,
          })}
          {entry.model ? ` · ${entry.model}` : ''}
        </p>
        {percent != null ? (
          <TrayProgressBar percent={percent} label={progressLabel ?? undefined} />
        ) : null}
      </div>
    </li>
  );
}
