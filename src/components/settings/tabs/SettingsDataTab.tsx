'use client';

import BackupRestoreFlow from '@/components/BackupRestoreFlow';
import Link from 'next/link';
import ComfyUiGalleryPanel from '@/components/ComfyUiGalleryPanel';
import SettingsBundlePanel from '@/components/settings/SettingsBundlePanel';
import PicturesBackupPanel from '@/components/settings/PicturesBackupPanel';
import GalleryMediaCleanupPanel from '@/components/settings/GalleryMediaCleanupPanel';
import ChangedSettingsPanel from '@/components/settings/ChangedSettingsPanel';
import { clearAllLocalPromptData, localDataKeys } from '@/lib/storage/local-data-reset';
import { DEFAULT_COMFYUI_SETTINGS, resetComfyUiSettings } from '@/lib/comfyui/settings';
import type { SharedToolSettings } from '@/lib/settings/cache';
import type { ComfyUiSettings } from '@/lib/comfyui/settings';
import { CollapsibleSection, ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { TextArea, FieldLabel, TextInput } from '@/components/ui/Field';
import {
  normalizeGalleryWorkflowMaxBytes,
  normalizeGalleryWorkflowRetentionDays,
} from '@/lib/gallery/workflow-hygiene';
import {
  clearLocalObservability,
  downloadLocalObservabilityExport,
  failureSparklineSeries,
  loadLocalObservability,
  summarizeLocalReliability,
  summarizePlayFunnel,
} from '@/lib/server/local-observability';
import { resetFirstQueueSetupModal } from '@/lib/app/first-queue-setup';
import { Button, ButtonLink } from '@/components/ui/Button';
import { APP_HAS_PLAY } from '@/lib/app/profile';
import { confirmAction } from '@/components/ui/ConfirmDialog';

function FailureSparkline({ series }: { series: number[] }) {
  const max = Math.max(1, ...series);
  const width = 168;
  const height = 36;
  const step = series.length > 1 ? width / (series.length - 1) : width;
  const points = series
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="mt-1 overflow-visible text-[var(--tint-danger-text)]"
      role="img"
      aria-label="Queue failures over the last seven days"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

export type SettingsDataTabProps = {
  sharedSettings: SharedToolSettings;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  backupReminder: string | null;
  reloadBrowserSettingsState: () => void;
  /** Unused since the guided restore (BackupRestoreFlow); kept for callers. */
  handleImport?: (file: File) => void | Promise<void>;
  handleExportBackup: () => void;
  updateSettings: (patch: Partial<ComfyUiSettings>) => void;
  setStatus: (status: string | null) => void;
};

function formatRate(value: number | null): string {
  if (value == null) {
    return '—';
  }
  return `${Math.round(value * 100)}%`;
}

export default function SettingsDataTab({
  sharedSettings,
  updateSharedSettings,
  backupReminder,
  reloadBrowserSettingsState,
  handleExportBackup,
  updateSettings,
  setStatus,
}: SettingsDataTabProps) {
  const metrics = loadLocalObservability();
  const reliability = summarizeLocalReliability(metrics);
  const playFunnel = summarizePlayFunnel(metrics);
  const maxBytes = normalizeGalleryWorkflowMaxBytes(sharedSettings.galleryWorkflowMaxBytes);
  const maxMb = maxBytes <= 0 ? 0 : Math.round((maxBytes / (1024 * 1024)) * 10) / 10;

  return (
    <>
      {/* Backup & move first, disk space next, the rest folded (fresh-install walk 2026-10-13:
          eleven sections, the backups at the bottom). */}

      <ToolSection title="Backup & move">
        <p className="text-sm text-[var(--text-secondary)]">
          Everything but the pictures: your Cast, settings, history, the gallery list and workflows.
          On a new machine, import it and reload.
        </p>
        {backupReminder ? (
          <p className="mb-3 text-sm text-[var(--tint-warning-text)]">{backupReminder}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 text-sm">
          <Button
            variant="outline"
            type="button"
            onClick={handleExportBackup}
            className="rounded-lg px-4 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Export backup
          </Button>
          <BackupRestoreFlow
            label="Import backup"
            testId="settings-backup-restore"
            className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-[var(--text-primary)] transition hover:border-[var(--border-strong)] focus-within:ring-2 focus-within:ring-[var(--accent-ring)]"
            onRestored={setStatus}
            onError={setStatus}
          />
          <Button
            variant="outline"
            tone="danger"
            type="button"
            onClick={async () => {
              if (
                await confirmAction({
                  title: 'Clear all local data?',
                  body: 'Prompt history, settings, presets and templates in this browser are cleared.',
                  confirmLabel: 'Clear local data',
                  tone: 'danger',
                })
              ) {
                clearAllLocalPromptData();
                resetComfyUiSettings();
                updateSettings(DEFAULT_COMFYUI_SETTINGS);
                setStatus('Local data cleared. Reload the page.');
              }
            }}
            className="rounded-lg px-4 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Reset local data
          </Button>
        </div>
        {/* The storage key names are for support, not for reading — folded away. */}
        <details className="text-xs text-[var(--text-muted)]">
          <summary className="cursor-pointer">What this clears (storage keys)</summary>
          <p className="mt-1 break-words font-mono">{localDataKeys().join(', ')}</p>
        </details>
      </ToolSection>

      <ToolSection title="Pictures backup">
        <PicturesBackupPanel />
      </ToolSection>

      <SettingsBundlePanel onImported={reloadBrowserSettingsState} onStatus={setStatus} />

      <ToolSection title="Gallery backups">
        <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
            checked={sharedSettings.galleryBackupCopies !== false}
            data-testid="settings-gallery-backups"
            onChange={event => updateSharedSettings({ galleryBackupCopies: event.target.checked })}
          />
          <span>
            <span className="block font-medium text-[var(--text-primary)]">
              Keep a backup copy of each render
            </span>
            <span className="type-caption mt-0.5 block text-[var(--text-muted)]">
              The Gallery saves its own copy of every still and clip when it finishes, so your
              renders survive ComfyUI purging old outputs or a disk clean-up. Turn it off to save
              disk space: new renders then live only in ComfyUI&apos;s output folder and are gone
              from the Gallery if that file is deleted. Copies already kept stay.
            </span>
          </span>
        </label>
      </ToolSection>

      <ToolSection title="Gallery disk space">
        <GalleryMediaCleanupPanel />
      </ToolSection>

      <ToolSection title="Gallery exact-replay graphs">
        <p className="text-sm text-[var(--text-secondary)]">
          Each render keeps its exact graph so Replay exact can run it again. Old graphs are dropped
          after the days or size below (0 = keep all).
        </p>
        <FieldLabel htmlFor="gallery-workflow-retention" hint="How long a graph is kept">
          Retention (days)
        </FieldLabel>
        <TextInput
          id="gallery-workflow-retention"
          type="number"
          min={0}
          max={365}
          value={normalizeGalleryWorkflowRetentionDays(sharedSettings.galleryWorkflowRetentionDays)}
          onChange={event =>
            updateSharedSettings({
              galleryWorkflowRetentionDays: normalizeGalleryWorkflowRetentionDays(
                Number(event.target.value)
              ),
            })
          }
          className={accentFocusClass()}
        />
        <div className="mt-4">
          <FieldLabel
            htmlFor="gallery-workflow-max-mb"
            hint="Past this, the oldest graphs go first (favourites are kept)"
          >
            Max stored graphs (MiB)
          </FieldLabel>
          <TextInput
            id="gallery-workflow-max-mb"
            type="number"
            min={0}
            max={64}
            step={0.5}
            value={maxMb}
            onChange={event =>
              updateSharedSettings({
                galleryWorkflowMaxBytes: normalizeGalleryWorkflowMaxBytes(
                  Number(event.target.value) * 1024 * 1024
                ),
              })
            }
            className={accentFocusClass()}
          />
        </div>
      </ToolSection>

      <CollapsibleSection
        title="More"
        summary="Gallery preview, reliability, the active character descriptor, settings changed from defaults"
        defaultOpen={false}
        persistKey="settings-data-more"
      >
        <ToolSection>
          <ComfyUiGalleryPanel limit={6} compact showHeader />
        </ToolSection>

        <ToolSection title="Reliability">
          <div id="settings-data-reliability" className="scroll-mt-24 space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">{reliability.headline}</p>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] p-3">
                <dt className="text-xs text-[var(--text-muted)]">Exact-replay share</dt>
                <dd className="mt-1 text-lg text-[var(--text-primary)]">
                  {formatRate(reliability.replayHitRate)}
                </dd>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {metrics.exactReplay} replays · {metrics.firstQueueSuccess} first successes
                </p>
              </div>
              {APP_HAS_PLAY ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] p-3">
                  <dt className="text-xs text-[var(--text-muted)]">Film loop funnel</dt>
                  <dd
                    className="mt-1 text-lg text-[var(--text-primary)]"
                    data-testid="settings-play-funnel"
                  >
                    {formatRate(playFunnel.cutRate)} cut · {formatRate(playFunnel.saveRate)} save
                  </dd>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {metrics.firstFilmCut}/{metrics.firstPlayCampaign || 0} cuts/starts · keep{' '}
                    {metrics.keepTryOn} · save-to-cast {metrics.saveToCast}
                    {playFunnel.maxStep > 0 || playFunnel.dayShare != null
                      ? ` · Day ${formatRate(playFunnel.dayShare)} / Story ${formatRate(playFunnel.roleplayShare)} · max step ${playFunnel.maxStep}`
                      : ''}
                  </p>
                </div>
              ) : null}
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] p-3">
                <dt className="text-xs text-[var(--text-muted)]">Playbook CTA rate</dt>
                <dd className="mt-1 text-lg text-[var(--text-primary)]">
                  {formatRate(reliability.playbookClickRate)}
                </dd>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {metrics.playbookCtaClick} opens · {metrics.queueFailures} failures
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] p-3">
                <dt className="text-xs text-[var(--text-muted)]">Setup completion</dt>
                <dd className="mt-1 text-lg text-[var(--text-primary)]">
                  {formatRate(reliability.setupCompletionRate)}
                </dd>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {metrics.firstQueueSetupCompleted}/{metrics.firstQueueSetupShown} · dismissals{' '}
                  {metrics.firstQueueSetupDismissed}
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] p-3">
                <dt className="text-xs text-[var(--text-muted)]">Failures · 7 days</dt>
                <dd className="mt-1 text-lg text-[var(--text-primary)]">{metrics.queueFailures}</dd>
                <FailureSparkline series={failureSparklineSeries(metrics)} />
              </div>
            </dl>
            {metrics.lastFailureMessage ? (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Last failure
                {metrics.lastFailureAt
                  ? ` · ${new Date(metrics.lastFailureAt).toLocaleString()}`
                  : ''}
                : {metrics.lastFailureMessage}
                {metrics.lastFailureHref ? (
                  <>
                    {' '}
                    <Link
                      href={metrics.lastFailureHref}
                      className="text-[var(--accent-text)] underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    >
                      Open fix
                    </Link>
                  </>
                ) : null}
              </p>
            ) : null}
            {metrics.lastBlockedSetupStep ? (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                First-queue funnel often blocked on{' '}
                <span className="text-[var(--text-secondary)]">{metrics.lastBlockedSetupStep}</span>
                {metrics.firstQueueSetupStepFails[metrics.lastBlockedSetupStep]
                  ? ` (${metrics.firstQueueSetupStepFails[metrics.lastBlockedSetupStep]}×)`
                  : ''}
                .
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {metrics.lastFailureHref ? (
                <ButtonLink href={metrics.lastFailureHref} size="sm" variant="secondary">
                  Open last failure
                </ButtonLink>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  resetFirstQueueSetupModal();
                  setStatus(
                    'First-queue setup reset — queue again or reload to reopen the checklist.'
                  );
                }}
              >
                Re-run first-queue setup
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  downloadLocalObservabilityExport();
                  setStatus('Reliability export downloaded.');
                }}
              >
                Export metrics
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  clearLocalObservability();
                  setStatus('Local reliability metrics cleared.');
                  reloadBrowserSettingsState();
                }}
              >
                Clear metrics
              </Button>
            </div>
          </div>
        </ToolSection>

        <ToolSection title="Active character descriptor">
          <p className="text-sm text-[var(--text-secondary)]">
            Shared mandatory descriptor injected into Character generation requests.
          </p>
          <TextArea
            rows={3}
            value={sharedSettings.activeCharacterDescriptor ?? ''}
            onChange={event =>
              updateSharedSettings({
                activeCharacterDescriptor: event.target.value || undefined,
              })
            }
            placeholder="e.g. athletic woman, mid-20s, short copper hair, green eyes"
            className={accentFocusClass()}
          />
        </ToolSection>

        <ChangedSettingsPanel
          sharedSettings={sharedSettings}
          updateSharedSettings={updateSharedSettings}
        />
      </CollapsibleSection>
    </>
  );
}
