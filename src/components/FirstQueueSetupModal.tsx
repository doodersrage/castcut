'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, PrimaryButton } from '@/components/ui/Button';
import BrandBars from '@/components/BrandBars';
import BrandMark from '@/components/BrandMark';
import { runHealAndReady } from '@/lib/app/first-run-setup';
import { COMFY_QUEUE_INTENT_EVENT, hasComfyQueueIntent } from '@/lib/comfyui/comfy-setup-intent';
import { loadSettingsCache, SETTINGS_CACHE_UPDATED_EVENT } from '@/lib/settings/cache';
import { isCloudEngine, normalizeEngineId } from '@/lib/engine/capabilities';
import {
  whenBrowserStorageReady,
  readBrowserValue,
  writeBrowserValue,
} from '@/lib/storage/browser-storage';
import { settingsComfyUiSectionHref } from '@/lib/settings/comfyui-nav';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { ONBOARDING_UPDATED_EVENT, loadOnboardingState } from '@/lib/app/onboarding-store';
import {
  dismissFirstQueueSetupModal,
  FIRST_QUEUE_SETUP_DISMISS_KEY,
  FIRST_QUEUE_SETUP_RESET_EVENT,
} from '@/lib/app/first-queue-setup';
import {
  noteFirstQueueSetupBlockedStep,
  noteFirstQueueSetupCompletedMetric,
  noteFirstQueueSetupDismissedMetric,
  noteFirstQueueSetupShownMetric,
  type FirstQueueSetupStepId,
} from '@/lib/server/local-observability';

const DISMISS_KEY = FIRST_QUEUE_SETUP_DISMISS_KEY;

type StepState = {
  storageReady: boolean;
  systemWorkflows: boolean;
  comfyOk: boolean | null;
};

function resolveBlockedSetupStep(steps: StepState): FirstQueueSetupStepId | null {
  if (!steps.storageReady) {
    return 'storage';
  }
  if (steps.comfyOk === false) {
    return 'comfy';
  }
  if (!steps.systemWorkflows) {
    return 'systemWorkflows';
  }
  return null;
}

export default function FirstQueueSetupModal() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepState>({
    storageReady: false,
    systemWorkflows: false,
    comfyOk: null,
  });
  const lastBlockedStepRef = useRef<FirstQueueSetupStepId | null>(null);

  const refresh = useCallback(() => {
    const shared = loadSettingsCache().shared;
    setSteps(previous => ({
      ...previous,
      storageReady: true,
      systemWorkflows: shared.useSystemWorkflows === true,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const maybeOpen = () => {
      if (cancelled) {
        return;
      }
      if (readBrowserValue<boolean>(DISMISS_KEY) === true) {
        return;
      }
      if (!hasComfyQueueIntent()) {
        return;
      }
      const shared = loadSettingsCache().shared;
      if (isCloudEngine(normalizeEngineId(shared.inferenceEngine))) {
        return;
      }
      if (shared.useSystemWorkflows === true) {
        return;
      }
      setOpen(previous => {
        if (!previous) {
          noteFirstQueueSetupShownMetric();
        }
        return true;
      });
      refresh();
    };

    void whenBrowserStorageReady().then(() => {
      if (cancelled) {
        return;
      }
      scheduleAfterCommit(maybeOpen);
    });

    const onIntent = () => scheduleAfterCommit(maybeOpen);
    const onSettings = () => scheduleAfterCommit(refresh);
    const onReset = () => {
      setOpen(true);
      noteFirstQueueSetupShownMetric();
      refresh();
    };
    const onOnboarding = () => {
      const success = loadOnboardingState().find(step => step.id === 'first-queue-success');
      if (success?.done) {
        writeBrowserValue(DISMISS_KEY, true);
        setOpen(false);
      }
    };
    window.addEventListener(COMFY_QUEUE_INTENT_EVENT, onIntent);
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, onSettings);
    window.addEventListener(ONBOARDING_UPDATED_EVENT, onOnboarding);
    window.addEventListener(FIRST_QUEUE_SETUP_RESET_EVENT, onReset);

    void fetch('/api/health')
      .then(response => response.json())
      .then((data: { comfyui?: { ok?: boolean } }) => {
        if (!cancelled) {
          setSteps(previous => ({ ...previous, comfyOk: Boolean(data.comfyui?.ok) }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSteps(previous => ({ ...previous, comfyOk: false }));
        }
      });

    return () => {
      cancelled = true;
      window.removeEventListener(COMFY_QUEUE_INTENT_EVENT, onIntent);
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, onSettings);
      window.removeEventListener(ONBOARDING_UPDATED_EVENT, onOnboarding);
      window.removeEventListener(FIRST_QUEUE_SETUP_RESET_EVENT, onReset);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) {
      lastBlockedStepRef.current = null;
      return;
    }
    const blocked = resolveBlockedSetupStep(steps);
    if (blocked && blocked !== lastBlockedStepRef.current) {
      lastBlockedStepRef.current = blocked;
      noteFirstQueueSetupBlockedStep(blocked);
    }
  }, [open, steps]);

  if (!open) {
    return null;
  }

  const dismiss = () => {
    noteFirstQueueSetupDismissedMetric();
    dismissFirstQueueSetupModal();
    setOpen(false);
  };

  return (
    <div
      className="ui-overlay fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-queue-setup-title"
    >
      <div className="page-enter ui-modal-card w-full max-w-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <BrandMark
            size={32}
            withWordmark
            wordmarkClassName="type-brand type-heading tracking-tight"
          />
          <p className="ui-meta flex items-center gap-1.5">
            <BrandBars />
            Setup
          </p>
        </div>
        <div className="space-y-1">
          <p id="first-queue-setup-title" className="type-display text-[1.5rem] sm:text-[1.65rem]">
            Finish setup before your first queue
          </p>
          <p className="type-body">
            Three quick checks so Generate can use system workflows and your ComfyUI inventory.
          </p>
        </div>

        <ol className="mt-5 space-y-3 text-sm">
          <li className="flex gap-3">
            <span className={steps.storageReady ? 'ui-status-success' : 'ui-status-warning'}>
              {steps.storageReady ? '●' : '○'}
            </span>
            <span>
              <span className="font-medium text-[var(--text-primary)]">Browser storage</span>
              <span className="block text-xs text-[var(--text-muted)]">
                Settings and LoRA picks hydrate from IndexedDB.
              </span>
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className={
                steps.comfyOk === true
                  ? 'ui-status-success'
                  : steps.comfyOk === false
                    ? 'ui-status-danger'
                    : 'ui-status-warning'
              }
            >
              {steps.comfyOk === true ? '●' : '○'}
            </span>
            <span>
              <span className="font-medium text-[var(--text-primary)]">ComfyUI reachable</span>
              <span className="block text-xs text-[var(--text-muted)]">
                {steps.comfyOk === false ? (
                  <>
                    Unreachable — check{' '}
                    <Link
                      href={settingsComfyUiSectionHref('connection')}
                      className="text-[var(--accent-text)] underline-offset-2 hover:underline"
                    >
                      Settings → Connection
                    </Link>
                    .
                  </>
                ) : (
                  'Health probe for object_info / queue.'
                )}
              </span>
            </span>
          </li>
          <li className="flex gap-3">
            <span className={steps.systemWorkflows ? 'ui-status-success' : 'ui-status-warning'}>
              {steps.systemWorkflows ? '●' : '○'}
            </span>
            <span>
              <span className="font-medium text-[var(--text-primary)]">System workflows</span>
              <span className="block text-xs text-[var(--text-muted)]">
                Built-in scaffolds when a library pack is not mapped yet.
              </span>
            </span>
          </li>
        </ol>

        {message ? (
          <p className="mt-4 text-xs text-[var(--text-muted)]" role="status">
            {message}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <PrimaryButton
            className="ui-btn-sm"
            loading={busy}
            loadingLabel="Enabling…"
            onClick={() => {
              setBusy(true);
              void runHealAndReady({
                onProgress: progress => setMessage(progress.message),
              }).then(result => {
                setBusy(false);
                setMessage(result.message);
                setSteps(previous => ({
                  ...previous,
                  systemWorkflows: result.systemWorkflowsEnabled,
                  comfyOk: result.comfyOk ? true : previous.comfyOk,
                }));
                if (result.systemWorkflowsEnabled) {
                  noteFirstQueueSetupCompletedMetric();
                  void import('@/lib/app/first-queue-setup').then(
                    ({ dismissFirstQueueSetupModal }) => {
                      dismissFirstQueueSetupModal();
                    }
                  );
                  window.setTimeout(() => setOpen(false), 900);
                }
              });
            }}
          >
            Enable & sync inventory
          </PrimaryButton>
          <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
