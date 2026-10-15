'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryHeroPreviewUrl,
  galleryEntryPrimaryThumbUrl,
  initGalleryStore,
  loadComfyGallery,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import GalleryEntryPreview from '@/components/ui/GalleryEntryPreview';
import { scheduleComfyGalleryPoll } from '@/lib/comfyui-gallery-poller';
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from '@/lib/comfyui-live-preview-store';
import { useStudioEmptyCta } from '@/hooks/useEmptyCta';
import { toMobileStudioHref } from '@/lib/mobile-studio';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { subscribeSharedHealth, type RawHealthResponse } from '@/lib/shared-health-poll';

type ComfyHealth = {
  ok: boolean;
  queuePending?: number;
  queueRunning?: number;
  error?: string;
};

function statusLabel(entry: ComfyGalleryEntry): string {
  if (entry.status === 'running') {
    return 'Running';
  }
  if (entry.status === 'pending') {
    return 'Queued';
  }
  if (entry.status === 'error') {
    return 'Failed';
  }
  return 'Done';
}

export default function MobileQueueTool() {
  const [health, setHealth] = useState<ComfyHealth | null>(null);
  const [entries, setEntries] = useState<ComfyGalleryEntry[]>([]);
  const [previews, setPreviews] = useState(0);
  const [polling, setPolling] = useState(false);

  const refresh = useCallback(() => {
    setEntries(loadComfyGallery());
  }, []);

  useEffect(() => {
    void initGalleryStore().then(refresh);
    const onGallery = () => refresh();
    const onPreview = () => setPreviews(value => value + 1);
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGallery);
    window.addEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, onPreview);
    return () => {
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGallery);
      window.removeEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, onPreview);
    };
  }, [refresh]);

  // Shared with ConnectionHealthChip/SystemTray/QueueTool/QueueOrchestrationPanel — see
  // shared-health-poll.ts. This used to run its own independent fetch + 8s interval.
  useEffect(() => {
    return subscribeSharedHealth((data: RawHealthResponse) => {
      // `data === null` means the shared fetch itself failed (unreachable server) — distinct
      // from a successful fetch whose response just doesn't include a `comfyui` field.
      if (data === null) {
        scheduleAfterCommit(() => setHealth({ ok: false, error: 'Unreachable' }));
        return;
      }
      const typed = data as { comfyui?: ComfyHealth };
      scheduleAfterCommit(() => setHealth(typed.comfyui ?? null));
    }, 8000);
  }, []);

  const active = useMemo(
    () =>
      entries
        .filter(entry => entry.status === 'pending' || entry.status === 'running')
        .slice(0, 12),
    [entries]
  );
  const recent = useMemo(
    () => entries.filter(entry => entry.status === 'completed').slice(0, 8),
    [entries]
  );

  const pollActive = useCallback(async () => {
    setPolling(true);
    try {
      await Promise.all(
        active.map(entry => scheduleComfyGalleryPoll(entry.promptId, { comfyUrl: entry.comfyUrl }))
      );
      refresh();
    } finally {
      setPolling(false);
    }
  }, [active, refresh]);

  const filmCta = useStudioEmptyCta();

  return (
    <div className="space-y-4" data-testid="mobile-queue">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Queue</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {health?.ok
            ? // The whole ComfyUI queue (other apps' jobs too), so say so — the card below is yours.
              `ComfyUI ready · ${health.queueRunning ?? 0} running, ${health.queuePending ?? 0} waiting in all`
            : health?.error
              ? `ComfyUI: ${health.error}`
              : 'What’s rendering now.'}
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" loading={polling} onClick={() => void pollActive()}>
          Refresh jobs
        </Button>
        <Link href="/queue" className="ui-btn-ghost px-3 py-2 text-sm">
          Full queue
        </Link>
      </div>

      {active.length === 0 ? (
        <div
          className="space-y-3 rounded-2xl border border-[var(--border-subtle)] px-4 py-8 text-center"
          data-testid="mobile-queue-empty"
        >
          <p className="text-sm text-[var(--text-muted)]">
            None of your jobs are rendering. Carry on with your film on Day.
          </p>
          <ButtonLink
            href={toMobileStudioHref(filmCta.href)}
            size="sm"
            variant="primary"
            className="justify-center"
            data-testid="mobile-queue-empty-cta"
          >
            {filmCta.label}
          </ButtonLink>
          <ButtonLink
            href="/m/day"
            size="sm"
            variant="secondary"
            className="justify-center"
            data-testid="mobile-queue-open-day"
          >
            Open Day
          </ButtonLink>
        </div>
      ) : (
        <ul className="space-y-2">
          {active.map(entry => {
            const live = getComfyLivePreviewUrl(entry.promptId);
            const thumb = live || galleryEntryPrimaryThumbUrl(entry);
            return (
              <li
                key={entry.id}
                className="flex gap-3 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-2"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--bg-subtle)]">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.model || 'Job'}</p>
                  <p className="type-caption text-[var(--text-muted)]">{statusLabel(entry)}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">
                    {entry.prompt}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {recent.length > 0 ? (
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">Recent outputs</p>
          <div className="grid grid-cols-4 gap-1.5">
            {recent.map(entry => {
              const preview = galleryEntryHeroPreviewUrl(entry);
              return (
                <Link
                  key={entry.id}
                  href="/m/gallery"
                  className="relative aspect-square overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]"
                >
                  {preview ? (
                    <GalleryEntryPreview
                      entry={entry}
                      className="pointer-events-none h-full w-full object-cover"
                    />
                  ) : null}
                  <span className="sr-only">Open gallery</span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
      <span className="sr-only">{previews} preview ticks</span>
    </div>
  );
}
