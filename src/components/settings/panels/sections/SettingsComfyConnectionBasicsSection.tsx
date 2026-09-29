'use client';

import ComfyClusterSettingsPanel from '@/components/settings/ComfyClusterSettingsPanel';
import { WORKFLOW_PARAM_TOKEN_HELP } from '@/lib/comfyui-config';
import { globalQueueParamOverrides } from '@/lib/comfyui-settings';
import { SettingsComfyPlaceholderTokens } from '@/components/settings/panels/sections/SettingsComfyPlaceholderTokens';
import type { SettingsComfyConnectionPanelProps } from '@/components/settings/panels/settings-comfy-connection-types';

type Props = Pick<
  SettingsComfyConnectionPanelProps,
  | 'settings'
  | 'updateSettings'
  | 'sharedSettings'
  | 'sharedMounted'
  | 'updateSharedSettings'
  | 'health'
  | 'refreshHealth'
  | 'updateQueueParam'
>;

export function SettingsComfyConnectionBasicsSection({
  settings,
  updateSettings,
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  health,
  refreshHealth,
  updateQueueParam,
  showPlaceholderTokens = true,
}: Props & {
  /** False while system workflows are on — the tokens live in the Manual injection group. */
  showPlaceholderTokens?: boolean;
}) {
  return (
    <>
      <p className="text-sm text-[var(--text-secondary)]">
        Where this browser reaches ComfyUI, and overrides the queue applies to every model.
      </p>

      <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.useServerDefaults}
          onChange={event => updateSettings({ useServerDefaults: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        <span>
          Use the server&apos;s ComfyUI URL and injection settings
          <span className="block text-xs text-[var(--text-muted)]">
            The server&apos;s <code className="ui-inline-code">COMFYUI_*</code> env sets the URL,
            placeholder tokens and fallback workflow. Global overrides below and custom tokens still
            apply.
          </span>
        </span>
      </label>

      <div
        className={`grid gap-4 ${settings.useServerDefaults ? 'pointer-events-none opacity-50' : ''}`}
      >
        <div className="space-y-1">
          <label htmlFor="comfy-url" className="text-xs text-[var(--text-secondary)]">
            ComfyUI API URL
          </label>
          <input
            id="comfy-url"
            value={settings.apiUrl ?? ''}
            onChange={event => updateSettings({ apiUrl: event.target.value })}
            placeholder="http://127.0.0.1:8188"
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </div>

        {showPlaceholderTokens ? (
          <SettingsComfyPlaceholderTokens settings={settings} updateSettings={updateSettings} />
        ) : null}
      </div>

      <div className="grid gap-4">
        <ComfyClusterSettingsPanel
          sharedSettings={sharedSettings}
          sharedMounted={sharedMounted}
          updateSharedSettings={updateSharedSettings}
          health={health}
          onRefreshHealth={refreshHealth}
        />
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-secondary)]">Global queue overrides</p>
          <p className="text-xs text-[var(--text-muted)]">
            Leave blank to use each model&apos;s own size and sampler settings. A value here
            overrides every model.
          </p>
          {globalQueueParamOverrides(settings.queueParams).filter(
            entry => !entry.startsWith('seed')
          ).length > 0 ? (
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2 text-xs text-[var(--tint-warning-text)]"
              data-testid="global-queue-override-warning"
            >
              <span>
                Overriding every model:{' '}
                {globalQueueParamOverrides(settings.queueParams)
                  .filter(entry => !entry.startsWith('seed'))
                  .join(' · ')}
                . CFG-1 models like Rapid AIO burn at higher CFG.
              </span>
              <button
                type="button"
                className="ui-text-link"
                onClick={() =>
                  // One update: updateQueueParam reads a stale copy, so four calls cleared one.
                  updateSettings({
                    queueParams: {
                      ...settings.queueParams,
                      width: '',
                      height: '',
                      cfg: '',
                      steps: '',
                    },
                  })
                }
              >
                Clear
              </button>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ['seed', 'Seed (empty = random per job)'],
                ['width', 'Width'],
                ['height', 'Height'],
                ['cfg', 'CFG'],
                ['steps', 'Steps'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs text-[var(--text-secondary)]">
                {label}
                <input
                  value={settings.queueParams?.[key]?.toString() ?? ''}
                  onChange={event => updateQueueParam(key, event.target.value)}
                  placeholder={key === 'seed' ? 'random' : 'model default'}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
                />
              </label>
            ))}
          </div>
          {showPlaceholderTokens ? (
            <p className="text-xs text-[var(--text-muted)]">
              Use tokens in workflow JSON:{' '}
              {WORKFLOW_PARAM_TOKEN_HELP.map(token => (
                <code key={token} className="mr-1 ui-inline-code">
                  {token}
                </code>
              ))}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
