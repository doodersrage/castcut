'use client';

import type { SettingsComfyConnectionPanelProps } from '@/components/settings/panels/settings-comfy-connection-types';

/** {{POSITIVE}} / {{NEGATIVE}} names the fallback and library workflows are filled through. */
export function SettingsComfyPlaceholderTokens({
  settings,
  updateSettings,
}: Pick<SettingsComfyConnectionPanelProps, 'settings' | 'updateSettings'>) {
  return (
    <>
      <div className="space-y-1">
        <label htmlFor="positive-token" className="text-xs text-[var(--text-secondary)]">
          Positive placeholder token
        </label>
        <input
          id="positive-token"
          value={settings.positiveToken ?? ''}
          onChange={event => updateSettings({ positiveToken: event.target.value })}
          placeholder="{{POSITIVE}}"
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="negative-token" className="text-xs text-[var(--text-secondary)]">
          Negative placeholder token (optional)
        </label>
        <input
          id="negative-token"
          value={settings.negativeToken ?? ''}
          onChange={event => updateSettings({ negativeToken: event.target.value })}
          placeholder="{{NEGATIVE}}"
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
        />
      </div>
    </>
  );
}
