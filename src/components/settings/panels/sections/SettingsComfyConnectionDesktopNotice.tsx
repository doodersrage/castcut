'use client';

import { isDesktopShellClient } from '@/lib/server/desktop-shell';
import { serverEnvFieldValue } from '@/components/settings/tabs/settings-tool-shared';
import type { SettingsComfyConnectionPanelProps } from '@/components/settings/panels/settings-comfy-connection-types';

type Props = Pick<SettingsComfyConnectionPanelProps, 'health'>;

export function SettingsComfyConnectionDesktopNotice({ health }: Props) {
  if (
    !isDesktopShellClient() &&
    serverEnvFieldValue(health?.serverEnv, 'PROMPT_DESKTOP') !== 'true'
  ) {
    return null;
  }

  return (
    <div className="mb-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] px-4 py-3">
      <p className="text-sm font-medium text-[var(--text-primary)]">Desktop app</p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
        ComfyUI is not bundled. Leave <strong>Use server defaults</strong> on if ComfyUI is at{' '}
        <code className="ui-inline-code">http://127.0.0.1:8188</code>, or uncheck it and set the API
        URL below. Gallery, settings, and <code className="ui-inline-code">server.log</code> live in{' '}
        <code className="ui-inline-code">
          {serverEnvFieldValue(health?.serverEnv, 'PROMPT_DATA_DIR') || 'the app data folder'}
        </code>
        .
      </p>
    </div>
  );
}
