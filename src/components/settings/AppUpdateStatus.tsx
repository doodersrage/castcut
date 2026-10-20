'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { AppVersionCheckResult } from '@/lib/app/version';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';

export default function AppUpdateStatus() {
  const [state, setState] = useState<AppVersionCheckResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function check(force = false) {
    setLoading(true);
    try {
      const response = await fetch(`/api/version${force ? '?force=1' : ''}`);
      const data = (await response.json()) as AppVersionCheckResult;
      setState(data);
    } catch {
      setState(
        prev => prev ?? ({ error: 'Could not reach the update check.' } as AppVersionCheckResult)
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Deferred to the next microtask so the initial setState doesn't fire
    // synchronously inside the effect (avoids cascading renders).
    scheduleAfterCommit(() => {
      void check();
    });
    // Only on mount — the tray watcher (AppUpdateWatcher) covers unattended alerts.
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-secondary)]">
          Version {state?.currentVersion ?? '…'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          loading={loading}
          loadingLabel="Checking for updates"
          onClick={() => void check(true)}
          className="type-caption"
        >
          Check for updates
        </Button>
      </div>

      {state?.enabled === false ? (
        <p className="type-caption text-[var(--text-muted)]">
          Update checks are disabled (
          <code className="ui-inline-code">UPDATE_CHECK_ENABLED=false</code>).
        </p>
      ) : state?.updateAvailable && state.latestVersion ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-4 py-3">
          <p className="text-sm font-medium text-[var(--tint-info-text)]">
            {state.latestVersion} is available
          </p>
          <p className="mt-1 type-caption text-[var(--tint-info-text)]/80">
            {state.releaseName ?? `Release ${state.latestVersion}`}
            {state.publishedAt ? ` · ${new Date(state.publishedAt).toLocaleDateString()}` : ''}
          </p>
          {state.releaseUrl ? (
            <a
              href={state.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block type-caption text-[var(--accent-text)] underline-offset-2 hover:underline"
            >
              View release
            </a>
          ) : null}
          <p className="mt-2 type-caption text-[var(--tint-info-text)]/80">
            Linux: prefer the <code className="ui-inline-code">.deb</code> and{' '}
            <code className="ui-inline-code">desktop/scripts/install-from-deb.sh</code> on Arch so
            system Node is not overwritten.
          </p>
        </div>
      ) : state && !state.error ? (
        <p className="type-caption text-[var(--text-muted)]">You&rsquo;re on the latest version.</p>
      ) : null}

      {state?.error ? (
        <p className="type-caption text-[var(--text-muted)]">
          Could not check for updates: {state.error}
        </p>
      ) : null}
    </div>
  );
}
