'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { toastQueueOutcome } from '@/lib/app-toast';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { RETRY_LAST_FAILED_QUEUE_EVENT, retryLastFailedQueue } from '@/lib/last-failed-queue';
import {
  clearSystemTrayMessages,
  dismissSystemTrayMessage,
  type SystemTrayMessage,
} from '@/lib/system-tray-messages';
import { useSystemTrayState } from '@/hooks/useSystemTrayState';
import { COMFY_ASSET_JOBS_UPDATED_EVENT } from '@/lib/comfy-asset-events';
import { cancelComfyGalleryJob } from '@/lib/comfyui-queue-cancel';
import { TrayNotice } from '@/components/system-tray/TrayNotice';
import { SystemTrayActivityCard } from '@/components/system-tray/SystemTrayActivityCard';

/** Space the floating Engine button keeps above this tray. Published on <html>. */
export const SYSTEM_TRAY_HEIGHT_VAR = '--system-tray-height';
const SYSTEM_TRAY_CLEARANCE_PX = 12;

export default function SystemTray() {
  const pathname = usePathname();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [showAllNotices, setShowAllNotices] = useState(false);
  const [cancellingGalleryIds, setCancellingGalleryIds] = useState<Set<string>>(() => new Set());
  const {
    activeGalleryJobs,
    heldJobs,
    assetJobs,
    queueHealth,
    primary,
    totalActiveCount,
    hasActivity,
    trayMessages,
    refresh,
  } = useSystemTrayState();

  const cancelAssetJob = (jobId: string) => {
    void fetch('/api/comfyui/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', jobId }),
    })
      .then(() => {
        window.dispatchEvent(new CustomEvent(COMFY_ASSET_JOBS_UPDATED_EVENT));
        refresh();
      })
      .catch(() => {
        // tray cancel is best-effort
      });
  };

  const cancelGalleryJob = (entry: ComfyGalleryEntry) => {
    if (!entry.promptId?.trim() || cancellingGalleryIds.has(entry.id)) {
      return;
    }
    setCancellingGalleryIds(prev => new Set(prev).add(entry.id));
    void cancelComfyGalleryJob(entry)
      .then(result => {
        if (!result.ok) {
          toastQueueOutcome({ ok: false, text: result.error ?? 'Cancel failed.' });
          return;
        }
        toastQueueOutcome({ ok: true, text: 'Job cancelled' });
        refresh();
      })
      .catch(() => {
        toastQueueOutcome({ ok: false, text: 'Cancel failed.' });
      })
      .finally(() => {
        setCancellingGalleryIds(prev => {
          const next = new Set(prev);
          next.delete(entry.id);
          return next;
        });
      });
  };

  useEffect(() => {
    const onRetryLastFailed = () => {
      void retryLastFailedQueue().then(result => {
        toastQueueOutcome({
          ok: result.ok,
          text: result.message,
          href: result.ok ? '/gallery' : '/queue',
        });
      });
    };
    window.addEventListener(RETRY_LAST_FAILED_QUEUE_EVENT, onRetryLastFailed);
    return () => window.removeEventListener(RETRY_LAST_FAILED_QUEUE_EVENT, onRetryLastFailed);
  }, []);

  useEffect(() => {
    if (!expanded) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded]);

  const trayVisible = hasActivity || trayMessages.length > 0;

  // The Engine dock is portaled to <body> (above this shell's stacking context) and shares
  // this corner. Publish the tray's height so that button sits above the cards.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) {
      document.documentElement.style.setProperty(SYSTEM_TRAY_HEIGHT_VAR, '0px');
      return;
    }
    const publish = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty(
        SYSTEM_TRAY_HEIGHT_VAR,
        height > 0 ? `${height + SYSTEM_TRAY_CLEARANCE_PX}px` : '0px'
      );
    };
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      document.documentElement.style.setProperty(SYSTEM_TRAY_HEIGHT_VAR, '0px');
    };
  }, [trayVisible]);

  if (!trayVisible) {
    return null;
  }

  // One notice at a time (newest first) with a count, not a stack of cards over the activity
  // card; "+N more" opens the rest. Failures are sticky, so they surface once others fade.
  const visibleNotices = showAllNotices ? trayMessages : trayMessages.slice(0, 1);
  const hiddenNoticeCount = trayMessages.length - visibleNotices.length;

  // The Queue page lists every job itself — the floating card only covered its row buttons.
  const onQueuePage = pathname === '/queue' || pathname === '/m/queue';
  const showActivityCard = hasActivity && primary && !onQueuePage;

  // Floats just above whatever bar is pinned to the bottom (see useBottomDockRef) — the old
  // fixed 5.5rem lift covered the mobile Queue button when a tool's bar grew, and the Play
  // kiosk nav on desktop.
  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed bottom-[calc(max(var(--bottom-dock-height,0px),env(safe-area-inset-bottom),0.25rem)+0.75rem)] right-4 z-[90] flex w-[min(24rem,calc(100vw-2rem))] flex-col ui-tray-stack transition-[bottom] duration-200"
      data-testid="system-tray"
      aria-live="polite"
    >
      {visibleNotices.map((message: SystemTrayMessage, index) => (
        <TrayNotice
          key={message.id}
          text={message.text}
          tone={message.tone}
          href={message.href}
          actionLabel={message.actionLabel}
          actionEvent={message.actionEvent}
          moreCount={index === 0 ? hiddenNoticeCount : 0}
          onShowMore={() => setShowAllNotices(true)}
          onDismiss={() => {
            dismissSystemTrayMessage(message.id);
            if (trayMessages.length <= 2) {
              setShowAllNotices(false);
            }
          }}
        />
      ))}
      {showAllNotices && trayMessages.length > 1 ? (
        <button
          type="button"
          className="pointer-events-auto self-end type-caption text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          onClick={() => {
            clearSystemTrayMessages();
            setShowAllNotices(false);
          }}
        >
          Clear all
        </button>
      ) : null}

      {showActivityCard ? (
        <SystemTrayActivityCard
          panelId={panelId}
          expanded={expanded}
          setExpanded={setExpanded}
          primary={primary}
          totalActiveCount={totalActiveCount}
          assetJobs={assetJobs}
          activeGalleryJobs={activeGalleryJobs}
          heldJobs={heldJobs}
          queueHealth={queueHealth}
          cancellingGalleryIds={cancellingGalleryIds}
          cancelGalleryJob={cancelGalleryJob}
          cancelAssetJob={cancelAssetJob}
        />
      ) : null}
    </div>
  );
}
