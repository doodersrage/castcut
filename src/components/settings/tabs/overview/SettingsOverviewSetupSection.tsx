'use client';

import { APP_HAS_PLAY } from '@/lib/app-profile';
import Link from 'next/link';
import { useState } from 'react';
import AppSlot from '@/components/AppSlot';
import BackupRestoreFlow from '@/components/BackupRestoreFlow';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { ComfyUiSettingsSectionId } from '@/lib/settings-comfyui-nav';
import type { HealthResponse } from '@/components/settings/tabs/settings-tool-shared';
import {
  ESSENTIAL_TASKS,
  settingsComfyUiSectionHref,
  settingsTabHref,
} from '@/components/settings/tabs/overview/settings-overview-constants';
import { summarizePoolQueueDepth } from '@/lib/comfyui-host-ready';

type Props = {
  health: HealthResponse | null;
  healBusy: boolean;
  healProgress?: string | null;
  handleHealAndReady: () => void | Promise<void>;
  slimSettings?: boolean;
  onOpenComfyUiSection?: (section: ComfyUiSettingsSectionId) => void;
  onShowAllSettings?: () => void;
  /** Unused since the guided restore (BackupRestoreFlow); kept for callers. */
  handleImport?: (file: File) => void | Promise<void>;
  handleExportBackup: () => void;
};

export function SettingsOverviewSetupSection({
  health,
  healBusy,
  healProgress,
  handleHealAndReady,
  slimSettings = false,
  onOpenComfyUiSection,
  onShowAllSettings,
  handleExportBackup,
}: Props) {
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  return (
    <ToolSection title="Get set up" data-testid="settings-get-set-up">
      <div className="mb-4 rounded-[var(--radius-xl)] border border-[var(--accent-border)] bg-[var(--accent-muted)] p-4 shadow-[var(--shadow-surface)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-[var(--accent-text)]">Heal & ready</p>
            <p
              className="type-caption text-[var(--text-secondary)]"
              title="Turns on the built-in workflows, matches them to the models your ComfyUI has, installs any missing ComfyUI add-ons (ComfyUI restarts once), then checks everything again. Using a cloud engine instead? Add its API key under Settings → Inference engine."
            >
              Gets a new install working in one click. ComfyUI may restart once.
            </p>
          </div>
          <Button
            size="sm"
            loading={healBusy}
            loadingLabel="Healing…"
            data-testid="heal-and-ready"
            onClick={() => void handleHealAndReady()}
          >
            Heal & ready
          </Button>
        </div>
        {healBusy || healProgress ? (
          <p className="mt-2 type-caption text-[var(--accent-text)]" data-testid="heal-status">
            {healProgress || 'Healing…'}
          </p>
        ) : null}
        {health ? (
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {(
              [
                {
                  ok: health.llm.ok && !health.llm.modelMissing,
                  label: 'LLM',
                  detail: !health.llm.enabled
                    ? 'disabled'
                    : health.llm.modelMissing
                      ? `${health.llm.model} is not on the LLM server — load it, or pick one in Settings → LLM`
                      : (health.llm.model ?? 'connected'),
                  // Switched off on purpose is not a fault (grey, not red).
                  optional: !health.llm.enabled,
                },
                {
                  ok: health.comfyui.ok,
                  label: 'ComfyUI',
                  detail: health.comfyui.error ?? health.comfyui.url,
                },
                ...(health.comfyuiPool?.enabled
                  ? [
                      {
                        ok: health.comfyuiPool.endpoints.some(endpoint => endpoint.ok),
                        label: 'Cluster',
                        detail: (() => {
                          const pool = summarizePoolQueueDepth(health.comfyuiPool.endpoints);
                          return `${health.comfyuiPool.endpoints.filter(endpoint => endpoint.ok).length}/${health.comfyuiPool.endpoints.length} hosts up · ${pool.totalRunning} running · ${pool.totalPending} pending`;
                        })(),
                      },
                    ]
                  : []),
                {
                  ok: Boolean(health.config?.visionModel?.trim()),
                  label: 'Vision model',
                  detail:
                    health.config?.visionModel?.trim() ||
                    (health.llm.enabled ? 'unset — vision tools will fail' : 'off with the LLM'),
                  optional: !health.llm.enabled,
                },
                {
                  ok: Boolean(health.storage?.enabled),
                  // Plain names; the env var is in Settings → Data (UI review 2026-10-15).
                  label: 'Server storage',
                  detail: health.storage?.enabled
                    ? 'on — synced across devices'
                    : 'browser only (set PROMPT_DATA_DIR)',
                },
                {
                  ok: Boolean(health.auth?.enabled),
                  label: 'Auth',
                  detail: health.auth?.enabled ? 'accounts on' : 'off',
                  optional: true,
                },
                {
                  ok: Boolean(health.email?.configured),
                  label: 'Email',
                  detail: health.email?.configured
                    ? 'mail configured'
                    : 'not set up — only needed for password-reset emails',
                  optional: true,
                },
              ] as Array<{ ok: boolean; label: string; detail: string; optional?: boolean }>
            ).map(item => (
              <li
                key={item.label}
                className="flex items-start gap-2 text-xs text-[var(--text-secondary)]"
              >
                <span
                  className="ui-health-dot mt-0.5"
                  // Optional services that are off are not a problem (SMTP read red on every
                  // local install — UI audit 2026-10-11).
                  data-status={item.ok ? 'ok' : item.optional ? 'off' : 'error'}
                  aria-hidden
                />
                <span>
                  <span className="font-medium text-[var(--text-primary)]">{item.label}</span>
                  {' · '}
                  {item.detail}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {/* Film's own checks (pose, face, cut, still review…) — moved here from the ComfyUI tab's
            "First run" panel, which repeated this card's Heal & ready. */}
        {APP_HAS_PLAY ? (
          <details className="mt-3" data-testid="setup-film-checks">
            <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
              Film checks
            </summary>
            <AppSlot
              name="settings.firstRunChecks"
              refreshKey={`${health?.comfyui?.ok === true}:${healBusy ? 1 : 0}`}
            />
          </details>
        ) : null}
      </div>

      <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">Move to a new machine</p>
            <p className="type-caption text-[var(--text-secondary)]">
              Export backup carries settings, the Cast, history and the gallery list; the pictures
              travel in Settings → Data → Pictures backup. Import both on the other machine.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={handleExportBackup}>
              Export backup
            </Button>
            <BackupRestoreFlow
              label="Import backup"
              testId="settings-overview-backup-restore"
              className="ui-btn ui-btn-ghost ui-btn-sm cursor-pointer"
              onRestored={setRestoreStatus}
              onError={setRestoreStatus}
            />
          </div>
        </div>
        {restoreStatus ? (
          <p className="type-caption mt-2 text-[var(--text-secondary)]" role="status">
            {restoreStatus}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ESSENTIAL_TASKS.map(task => {
          const content = (
            <>
              <p className="text-sm font-medium text-[var(--text-primary)]">{task.title}</p>
              <p className="mt-1 type-caption text-[var(--text-muted)]">{task.description}</p>
            </>
          );
          const className =
            'block rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] px-4 py-3.5 text-left shadow-[inset_0_1px_0_rgb(255_255_255_/0.03)] transition hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]';

          if (task.section && onOpenComfyUiSection) {
            return (
              <button
                key={task.title}
                type="button"
                className={className}
                onClick={() => onOpenComfyUiSection(task.section!)}
              >
                {content}
              </button>
            );
          }

          const href =
            task.href ??
            (task.section ? settingsComfyUiSectionHref(task.section) : settingsTabHref('overview'));
          return (
            <Link
              key={task.title}
              href={href}
              className={className}
              onClick={() => {
                if (
                  slimSettings &&
                  (href === settingsTabHref('llm') || href === settingsTabHref('data'))
                ) {
                  onShowAllSettings?.();
                }
              }}
            >
              {content}
            </Link>
          );
        })}
      </div>

      {slimSettings && onShowAllSettings ? (
        <p className="mt-3 type-caption text-[var(--text-muted)]">
          Looking for automation, users, or sync?{' '}
          <button
            type="button"
            onClick={onShowAllSettings}
            className="text-[var(--accent-text)] underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Show all settings
          </button>
          .
        </p>
      ) : null}
    </ToolSection>
  );
}
