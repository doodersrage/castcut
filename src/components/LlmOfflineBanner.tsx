'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { llmOfflineNotice, type LlmOfflineNotice } from '@/lib/llm/offline-notice';
import { loadSettingsCache, SETTINGS_CACHE_UPDATED_EVENT } from '@/lib/settings/cache';
import { settingsTabHref } from '@/lib/settings/nav';
import {
  refreshSharedHealth,
  subscribeSharedHealth,
  type RawHealthResponse,
} from '@/lib/storage/shared-health-poll';

const POLL_MS = 60_000;
const DISMISS_KEY = 'castcut-llm-offline-dismissed-v1';

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(value: boolean): void {
  try {
    if (value) window.sessionStorage.setItem(DISMISS_KEY, '1');
    else window.sessionStorage.removeItem(DISMISS_KEY);
  } catch {
    // Private window / blocked storage: the notice just comes back on reload.
  }
}

function readShared() {
  try {
    return loadSettingsCache().shared;
  } catch {
    return null;
  }
}

/**
 * Small notice while the language model (LM Studio / Ollama) is on in Settings but not answering:
 * rendering still works, the writing and checking helpers don't. Sits under RenderOfflineBanner,
 * amber not red (nothing stops), and can be dismissed for this tab session; it comes back after
 * the LLM has answered once and dropped again.
 */
export default function LlmOfflineBanner() {
  const [health, setHealth] = useState<RawHealthResponse>(null);
  const [shared, setShared] = useState<ReturnType<typeof readShared>>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setShared(readShared());
      setDismissed(readDismissed());
    });
    const unsubscribe = subscribeSharedHealth(data => {
      scheduleAfterCommit(() => setHealth(data));
    }, POLL_MS);
    const onSettings = () => setShared(readShared());
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, onSettings);
    return () => {
      unsubscribe();
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, onSettings);
    };
  }, []);

  const notice: LlmOfflineNotice | null = llmOfflineNotice(health, shared);

  // Back online: forget the dismissal so the next outage is announced.
  useEffect(() => {
    const llm = (health as { llm?: { ok?: boolean } } | null)?.llm;
    if (llm?.ok === true && dismissed) {
      writeDismissed(false);
      scheduleAfterCommit(() => setDismissed(false));
    }
  }, [health, dismissed]);

  if (!notice || dismissed) return null;

  return (
    <div
      role="status"
      data-testid="llm-offline-banner"
      className="mx-auto mb-3 mt-2 flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-md)] border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-4 py-3"
    >
      <div className="min-w-0 flex-1 basis-64">
        <p className="type-body font-medium text-[var(--tint-warning-text)]">
          The language model isn’t answering
        </p>
        <p className="type-caption text-[var(--text-secondary)]">
          Rendering still works. Written prompts, suggested lines, story beats, image reviews and
          auto-tags are off until it’s back. Start LM Studio and load a model, or turn the LLM off
          in Settings → LLM.
        </p>
        {notice.baseUrl ? (
          <p className="type-caption text-[var(--text-muted)]" data-testid="llm-offline-detail">
            The server tried <code>{notice.baseUrl}</code>
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="ui-btn-secondary px-3 py-1.5 text-xs"
          data-testid="llm-offline-retry"
          onClick={() => void refreshSharedHealth({ force: true })}
        >
          Check again
        </button>
        <Link href={settingsTabHref('llm')} className="ui-btn-ghost px-3 py-1.5 text-xs">
          LLM settings
        </Link>
        <button
          type="button"
          className="ui-btn-ghost px-3 py-1.5 text-xs"
          data-testid="llm-offline-dismiss"
          aria-label="Dismiss the language model notice"
          onClick={() => {
            writeDismissed(true);
            setDismissed(true);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
