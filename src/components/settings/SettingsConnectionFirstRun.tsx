'use client';

import Link from 'next/link';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FIRST_RUN_GENERATE_HREF, FIRST_RUN_QUEUE_HREF } from '@/lib/empty-cta';
import type { HealthResponse } from '@/components/settings/tabs/settings-tool-shared';
import PlayChecksReadinessRows from '@/components/settings/PlayChecksReadinessRows';
import { usePlayChecksReadiness } from '@/hooks/usePlayChecksReadiness';

export default function SettingsConnectionFirstRun({
  health,
  systemWorkflowsEnabled,
  healBusy,
  healProgress,
  onHealAndReady,
}: {
  health: HealthResponse | null;
  systemWorkflowsEnabled: boolean;
  healBusy: boolean;
  healProgress?: string | null;
  onHealAndReady: () => void | Promise<void>;
}) {
  const comfyOk = health?.comfyui?.ok === true;
  // Re-probe when the connection flips or a Heal finishes.
  const { readiness, checking, recheck } = usePlayChecksReadiness(`${comfyOk}:${healBusy}`);
  const comfyFail = health != null && health.comfyui?.ok !== true;
  const ready = comfyOk && systemWorkflowsEnabled;

  return (
    <div className="mb-4 rounded-[var(--radius-xl)] border border-[var(--accent-border)] bg-[var(--accent-muted)] p-4 shadow-[var(--shadow-surface)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-[var(--accent-text)]">First run</p>
          <p className="type-caption text-[var(--text-secondary)]">
            Test ComfyUI, then Heal & ready. That turns on system workflows and maps checkpoints
            from inventory. After that, open Generate and queue a random scene.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            loading={healBusy}
            loadingLabel="Healing…"
            data-testid="heal-and-ready"
            onClick={() => void onHealAndReady()}
          >
            Heal & ready
          </Button>
          <ButtonLink
            href={FIRST_RUN_GENERATE_HREF}
            size="sm"
            variant={ready ? 'primary' : 'secondary'}
          >
            Open Generate
          </ButtonLink>
        </div>
      </div>
      {healBusy || healProgress ? (
        <p className="mt-2 type-caption text-[var(--accent-text)]" data-testid="heal-status">
          {healProgress || 'Healing…'}
        </p>
      ) : null}
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        <li className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
          <span
            className="ui-health-dot mt-0.5"
            data-status={comfyOk ? 'ok' : comfyFail ? 'error' : undefined}
            aria-hidden
          />
          <span>
            <span className="font-medium text-[var(--text-primary)]">ComfyUI</span>
            {' · '}
            {comfyOk
              ? (health?.comfyui.url ?? 'connected')
              : comfyFail
                ? (health?.comfyui.error ?? 'unreachable')
                : 'not checked yet — use Test connection'}
          </span>
        </li>
        <li className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
          <span
            className="ui-health-dot mt-0.5"
            data-status={systemWorkflowsEnabled ? 'ok' : undefined}
            aria-hidden
          />
          <span>
            <span className="font-medium text-[var(--text-primary)]">System workflows</span>
            {' · '}
            {systemWorkflowsEnabled ? 'on' : 'off until Heal & ready'}
          </span>
        </li>
      </ul>
      <PlayChecksReadinessRows readiness={readiness} checking={checking} onRecheck={recheck} />
      {ready ? (
        <div className="mt-3 space-y-2" data-testid="post-heal-checklist">
          <p className="text-sm font-medium text-[var(--accent-text)]">
            Ready — next steps (advanced settings below stay optional)
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--text-secondary)]">
            <li>
              <Link
                href={FIRST_RUN_QUEUE_HREF}
                className="font-medium text-[var(--accent-text)] underline-offset-2 hover:underline"
              >
                Generate & queue first scene
              </Link>
              {' — '}
              Random surprise, auto-queued to ComfyUI
            </li>
            <li>
              Or{' '}
              <Link
                href={FIRST_RUN_GENERATE_HREF}
                className="font-medium text-[var(--accent-text)] underline-offset-2 hover:underline"
              >
                open Generate
              </Link>{' '}
              to review the prompt before queueing
            </li>
            <li>Watch progress on Queue</li>
            <li>
              Rate the still in{' '}
              <Link
                href="/gallery?review=1"
                className="font-medium text-[var(--accent-text)] underline-offset-2 hover:underline"
              >
                Gallery review
              </Link>
            </li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}
