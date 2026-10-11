'use client';

import Link from 'next/link';
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
  handleImport: (file: File) => void | Promise<void>;
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
  handleImport,
  handleExportBackup,
}: Props) {
  return (
    <ToolSection title="Get set up">
      <div className="mb-4 rounded-[var(--radius-xl)] border border-[var(--accent-border)] bg-[var(--accent-muted)] p-4 shadow-[var(--shadow-surface)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-[var(--accent-text)]">Heal & ready</p>
            <p className="type-caption text-[var(--text-secondary)]">
              One click to get a new install working: it turns on the built-in workflows, matches
              them to the models your ComfyUI has, installs any missing ComfyUI add-ons (ComfyUI
              restarts once), then checks everything again. Using a cloud engine instead? Add its
              API key under Settings → Inference engine.
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
                  ok: health.llm.ok,
                  label: 'LLM',
                  detail: health.llm.enabled ? (health.llm.model ?? 'connected') : 'disabled',
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
                  ok: Boolean(health.config.visionModel?.trim()),
                  label: 'Vision model',
                  detail: health.config.visionModel?.trim() || 'unset — vision tools will fail',
                },
                {
                  ok: Boolean(health.storage?.enabled),
                  label: 'PROMPT_DATA_DIR',
                  detail: health.storage?.enabled ? 'server sync on' : 'browser-only',
                },
                {
                  ok: Boolean(health.auth?.enabled),
                  label: 'Auth',
                  detail: health.auth?.enabled ? 'accounts on' : 'off',
                  optional: true,
                },
                {
                  ok: Boolean(health.email?.configured),
                  label: 'SMTP',
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
      </div>

      <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">Move to a new machine</p>
            <p className="type-caption text-[var(--text-secondary)]">
              Export history, settings, gallery, and extras (including gallery ELO). Import the JSON
              on the other browser, then reload.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={handleExportBackup}>
              Export backup
            </Button>
            <label className="ui-btn ui-btn-ghost ui-btn-sm cursor-pointer">
              Import backup
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleImport(file);
                  }
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
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
