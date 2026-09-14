'use client';

/**
 * First-run / empty-state banner when Comfy is down or system workflows are off.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { loadSettingsCache, SETTINGS_CACHE_UPDATED_EVENT } from '@/lib/settings-cache';
import { loadOnboardingState } from '@/lib/onboarding-store';
import { runHealAndReady } from '@/lib/first-run-setup';
import { settingsTabHref } from '@/lib/settings-nav';
import { settingsComfyUiSectionHref } from '@/lib/settings-comfyui-nav';
import {
  cloudEngineOption,
  engineDisplayName,
  isCloudEngine,
  normalizeEngineId,
} from '@/lib/engine/capabilities';
import { Button } from '@/components/ui/Button';
import { COMFY_QUEUE_INTENT_EVENT, hasComfyQueueIntent } from '@/lib/comfy-setup-intent';
import {
  readBrowserValue,
  whenBrowserStorageReady,
  writeBrowserValue,
} from '@/lib/browser-storage';
import { SETUP_READINESS_DISMISS_KEY } from '@/lib/first-run-dismiss';

const DISMISS_KEY = SETUP_READINESS_DISMISS_KEY;

type Readiness = {
  comfyOk: boolean | null;
  systemWorkflows: boolean;
};

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
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [queueIntent, setQueueIntent] = useState(false);

  const refreshSystemWorkflows = useCallback((comfyOk?: boolean | null) => {
    const shared = loadSettingsCache().shared;
    const onboardingEnabled = loadOnboardingState().some(
      step => step.id === 'system-workflows' && step.done
    );
    setReadiness(prev => ({
      comfyOk: comfyOk !== undefined ? comfyOk : (prev?.comfyOk ?? null),
      systemWorkflows: shared.useSystemWorkflows === true || onboardingEnabled,
    }));
  }, []);

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
      if (cancelled) {
        return;
      }
      setDismissed(Boolean(readBrowserValue<boolean>(DISMISS_KEY)));
      refreshSystemWorkflows(null);
    });

    void fetch('/api/health')
      .then(response => response.json())
      .then((data: { comfyui?: { ok?: boolean } }) => {
        if (cancelled) {
          return;
        }
        return whenBrowserStorageReady().then(() => {
          if (cancelled) {
            return;
          }
          refreshSystemWorkflows(Boolean(data.comfyui?.ok));
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        return whenBrowserStorageReady().then(() => {
          if (cancelled) {
            return;
          }
          refreshSystemWorkflows(false);
        });
      });

    const onSettingsUpdated = () => {
      if (!cancelled) {
        scheduleAfterCommit(() => refreshSystemWorkflows());
      }
    };
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, onSettingsUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, onSettingsUpdated);
    };
  }, [refreshSystemWorkflows]);

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
                writeBrowserValue(DISMISS_KEY, true);
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

  if (!readiness) {
    return null;
  }

  const comfyDown = readiness.comfyOk === false;
  const needsSystemWf = !readiness.systemWorkflows;
  if (!comfyDown && !needsSystemWf) {
    return null;
  }

  return (
    <div className="ui-setup-banner mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-[var(--accent-text)]">
            {needsSystemWf
              ? `Finish setup before ${toolLabel}`
              : `ComfyUI connection needed for ${toolLabel}`}
          </p>
          <ul className="type-caption space-y-1 text-[var(--text-secondary)]">
            {comfyDown ? (
              <li>
                ComfyUI is unreachable — check the URL in{' '}
                <Link
                  href={settingsComfyUiSectionHref('connection')}
                  className="text-[var(--accent-text)] transition hover:text-[var(--text-primary)]"
                >
                  Settings → Connection
                </Link>
                .
              </li>
            ) : null}
            {needsSystemWf ? (
              <li>
                System workflows are off — enable them for scaffolds without importing a pack first.
              </li>
            ) : null}
          </ul>
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
                refreshSystemWorkflows(result.comfyOk ? true : false);
              });
            }}
          >
            Heal & ready
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              writeBrowserValue(DISMISS_KEY, true);
              setDismissed(true);
            }}
          >
            Dismiss
          </Button>
          <Link
            href={settingsTabHref('overview')}
            className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)]"
          >
            Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
