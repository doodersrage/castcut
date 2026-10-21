'use client';

/**
 * A tool page's own setup gap: ComfyUI unreachable, or the cloud engine's key. First-run setup as
 * a whole (Heal & ready, system workflows) is the dashboard checklist's and, on a first queue,
 * the first-queue modal's — this banner no longer repeats it on every tool page.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { loadSettingsCache } from '@/lib/settings/cache';
import { runHealAndReady } from '@/lib/app/first-run-setup';
import { settingsComfyUiSectionHref } from '@/lib/settings/comfyui-nav';
import {
  cloudEngineOption,
  engineDisplayName,
  isCloudEngine,
  normalizeEngineId,
} from '@/lib/engine/capabilities';
import { Button } from '@/components/ui/Button';
import { COMFY_QUEUE_INTENT_EVENT, hasComfyQueueIntent } from '@/lib/comfyui/comfy-setup-intent';
import { whenBrowserStorageReady } from '@/lib/storage/browser-storage';
import {
  dismissFirstRunSetupSurfaces,
  FIRST_QUEUE_SETUP_RESET_EVENT,
  FIRST_RUN_SETUP_DISMISSED_EVENT,
  isFirstRunSetupDismissed,
} from '@/lib/app/first-run-dismiss';
import {
  COMFY_CONNECTION_HREF,
  COMFY_CONNECTION_LINK_TEXT,
  HEAL_READY_DOES,
  HEAL_READY_HREF,
  HEAL_READY_LABEL,
} from '@/lib/app/setup-copy';

export default function SetupReadinessBanner({
  toolLabel = 'Generate',
  deferUntilQueueIntent: deferUntilQueueIntentProp,
}: {
  toolLabel?: string;
  /** Hide until the user tries to queue. Auto on in Simple workspace. */
  deferUntilQueueIntent?: boolean;
}) {
  const workspaceMode = useWorkspaceMode();
  const deferUntilQueueIntent =
    deferUntilQueueIntentProp ?? (workspaceMode === 'simple' || workspaceMode === 'play');
  const [comfyOk, setComfyOk] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [queueIntent, setQueueIntent] = useState(false);

  const refreshDismissed = useCallback(() => setDismissed(isFirstRunSetupDismissed()), []);

  useEffect(() => {
    if (!deferUntilQueueIntent) {
      return;
    }
    scheduleAfterCommit(() => {
      setQueueIntent(hasComfyQueueIntent());
    });
    const onIntent = () => setQueueIntent(true);
    window.addEventListener(COMFY_QUEUE_INTENT_EVENT, onIntent);
    return () => window.removeEventListener(COMFY_QUEUE_INTENT_EVENT, onIntent);
  }, [deferUntilQueueIntent]);

  useEffect(() => {
    let cancelled = false;

    void whenBrowserStorageReady().then(() => {
      if (!cancelled) {
        refreshDismissed();
      }
    });

    void fetch('/api/health')
      .then(response => response.json())
      .then((data: { comfyui?: { ok?: boolean } }) => {
        if (!cancelled) {
          setComfyOk(Boolean(data.comfyui?.ok));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setComfyOk(false);
        }
      });

    // One dismiss for every setup surface: the checklist, the first-queue modal or another page.
    const onDismissChange = () => {
      if (!cancelled) {
        scheduleAfterCommit(refreshDismissed);
      }
    };
    window.addEventListener(FIRST_RUN_SETUP_DISMISSED_EVENT, onDismissChange);
    window.addEventListener(FIRST_QUEUE_SETUP_RESET_EVENT, onDismissChange);

    return () => {
      cancelled = true;
      window.removeEventListener(FIRST_RUN_SETUP_DISMISSED_EVENT, onDismissChange);
      window.removeEventListener(FIRST_QUEUE_SETUP_RESET_EVENT, onDismissChange);
    };
  }, [refreshDismissed]);

  if (dismissed || (deferUntilQueueIntent && !queueIntent)) {
    return null;
  }

  const engine = normalizeEngineId(loadSettingsCache().shared.inferenceEngine);
  if (isCloudEngine(engine)) {
    const option = cloudEngineOption(engine);
    return (
      <div className="ui-setup-banner mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-[var(--accent-text)]">
              {engineDisplayName(engine)} key for {toolLabel}
            </p>
            <p className="type-caption text-[var(--text-secondary)]">
              This engine queues on the cloud — add a {option?.tokenLabel ?? 'API key'} in{' '}
              <Link
                href={settingsComfyUiSectionHref('inference-engine')}
                className="text-[var(--accent-text)] transition hover:text-[var(--text-primary)]"
              >
                Settings → Inference engine
              </Link>
              {option?.envTokenName ? ` if the server ${option.envTokenName} is empty` : ''}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                dismissFirstRunSetupSurfaces();
                setDismissed(true);
              }}
            >
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Only this page's gap: ComfyUI can't be reached, so nothing here renders.
  if (comfyOk !== false) {
    return null;
  }

  return (
    <div className="ui-setup-banner mb-4" data-testid="setup-readiness-banner">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-[var(--accent-text)]">
            ComfyUI connection needed for {toolLabel}
          </p>
          <p className="type-caption text-[var(--text-secondary)]">
            ComfyUI isn’t answering — check the address in{' '}
            <Link
              href={COMFY_CONNECTION_HREF}
              className="text-[var(--accent-text)] transition hover:text-[var(--text-primary)]"
            >
              {COMFY_CONNECTION_LINK_TEXT}
            </Link>
            , or run {HEAL_READY_LABEL}: it {HEAL_READY_DOES}.
          </p>
          {message ? <p className="type-caption text-[var(--text-muted)]">{message}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            loadingLabel="Healing…"
            onClick={() => {
              setBusy(true);
              setMessage(null);
              void runHealAndReady({
                onProgress: progress => setMessage(progress.message),
              }).then(result => {
                setBusy(false);
                setMessage(result.message);
                setComfyOk(result.comfyOk);
              });
            }}
          >
            {HEAL_READY_LABEL}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              dismissFirstRunSetupSurfaces();
              setDismissed(true);
            }}
          >
            Dismiss
          </Button>
          <Link
            href={HEAL_READY_HREF}
            className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)]"
          >
            Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
