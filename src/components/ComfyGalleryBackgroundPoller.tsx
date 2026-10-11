'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/comfyui-gallery';
import { initBrowserStorage } from '@/lib/browser-storage';
import { hasPendingGalleryPollMeta } from '@/lib/gallery-pending-polls';

function scheduleIdle(callback: () => void, timeoutMs: number): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: timeoutMs });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, Math.min(timeoutMs, 1500));
  return () => window.clearTimeout(id);
}

export default function ComfyGalleryBackgroundPoller() {
  const auth = useAuth();

  useEffect(() => {
    if (!auth || auth.loading) {
      return;
    }
    // Auth off → single-user mode. Auth on without user → login/guest shell.
    if (auth.authEnabled && !auth.user) {
      return;
    }
    if (process.env.NEXT_PUBLIC_PLAYWRIGHT === '1') {
      return;
    }

    void initBrowserStorage();

    let cancelled = false;

    const resumeIfNeeded = () => {
      if (cancelled) {
        return;
      }
      void import('@/lib/gallery-db-store').then(({ warmGalleryStore }) =>
        warmGalleryStore().then(() => {
          if (cancelled) {
            return;
          }
          void import('@/lib/comfyui-gallery-poller').then(({ resumePendingGalleryPolls }) => {
            if (!cancelled) {
              resumePendingGalleryPolls();
            }
          });
        })
      );
    };

    // Defer first resume so first paint / tool JS isn't competing with poller work.
    const cancelIdle = scheduleIdle(resumeIfNeeded, 2500);

    const onGalleryUpdated = () => {
      // Only resume when something is actually waiting — avoids re-entry loops
      // when a poll marks a job error and saves the gallery. Jobs that arrived by server sync
      // count too (they have no resume note of their own).
      if (hasPendingGalleryPollMeta()) {
        resumeIfNeeded();
        return;
      }
      void import('@/lib/comfyui-gallery-poller').then(({ galleryHasUnpolledJobs }) => {
        if (!cancelled && galleryHasUnpolledJobs()) resumeIfNeeded();
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resumeIfNeeded();
      }
    };

    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGalleryUpdated);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      cancelIdle();
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGalleryUpdated);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [auth?.authEnabled, auth?.loading, auth?.user?.id]);

  return null;
}
