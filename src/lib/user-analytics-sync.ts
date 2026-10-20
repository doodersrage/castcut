'use client';

import { buildUserAnalyticsSnapshot } from './user-analytics';
import { loadComfyGallery } from './gallery/comfyui-gallery';
import { loadPromptHistoryStore } from './prompt-history';
import { getActiveUserId, getActiveUsername } from './user-scope';

let syncTimer: number | null = null;

export function scheduleUserAnalyticsSync(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const userId = getActiveUserId();
  const username = getActiveUsername();
  if (!userId || !username) {
    return;
  }

  if (syncTimer != null) {
    window.clearTimeout(syncTimer);
  }

  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    const snapshot = buildUserAnalyticsSnapshot({
      userId,
      username,
      history: loadPromptHistoryStore(),
      gallery: loadComfyGallery(),
    });
    void fetch('/api/auth/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
  }, 1500);
}
