'use client';

import { useEffect } from 'react';
import { pushSystemTrayMessage } from '@/lib/system-tray-messages';
import { readBrowserString, writeBrowserString } from '@/lib/browser-storage';
import type { AppVersionCheckResult } from '@/lib/app-version';

/** Only alert once per release — remembers the newest version already surfaced. */
const SEEN_VERSION_KEY = 'comfy-update-seen-version-v1';

export default function AppUpdateWatcher() {
  useEffect(() => {
    let cancelled = false;

    void fetch('/api/version')
      .then(response => (response.ok ? (response.json() as Promise<AppVersionCheckResult>) : null))
      .then(result => {
        if (cancelled || !result?.updateAvailable || !result.latestVersion) {
          return;
        }
        if (readBrowserString(SEEN_VERSION_KEY) === result.latestVersion) {
          return;
        }
        pushSystemTrayMessage({
          text: `Castcut ${result.latestVersion} is available — you're on ${result.currentVersion}.`,
          tone: 'info',
          href: result.releaseUrl ?? undefined,
          ttlMs: 0,
        });
        writeBrowserString(SEEN_VERSION_KEY, result.latestVersion);
      })
      .catch(() => {
        // Best-effort — offline / air-gapped installs shouldn't error loudly.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
