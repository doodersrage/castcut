'use client';

import { restartComfyUi } from '@/lib/comfyui/queue-control';
import { SETTINGS_TOOL_ACCENT } from '@/components/settings/tabs/settings-tool-shared';
import { accentButtonClass } from '@/components/ui/ToolPageShell';
import { PrimaryButton } from '@/components/ui/Button';
import type { SettingsComfyConnectionPanelProps } from '@/components/settings/panels/settings-comfy-connection-types';

const ACCENT = SETTINGS_TOOL_ACCENT;

type Props = Pick<
  SettingsComfyConnectionPanelProps,
  | 'mounted'
  | 'settings'
  | 'handleSaveComfySettings'
  | 'refreshHealth'
  | 'handleResetComfySettings'
  | 'setStatus'
>;

export function SettingsComfyConnectionActionsFooter({
  mounted,
  settings,
  handleSaveComfySettings,
  refreshHealth,
  handleResetComfySettings,
  setStatus,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <PrimaryButton
        accentClassName={accentButtonClass(ACCENT)}
        disabled={!mounted}
        onClick={handleSaveComfySettings}
      >
        Save ComfyUI settings
      </PrimaryButton>
      <button
        type="button"
        onClick={() => void refreshHealth()}
        className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-[var(--text-primary)] hover:border-[var(--border-strong)]"
      >
        Test connection
      </button>
      <button
        type="button"
        onClick={() => {
          void (async () => {
            setStatus('Sending ComfyUI restart…');
            const result = await restartComfyUi(settings.apiUrl?.trim() || undefined);
            if (!result.ok) {
              setStatus(result.error ?? 'ComfyUI restart failed.');
              return;
            }
            setStatus('ComfyUI restart requested. Wait a few seconds, then Test connection.');
          })();
        }}
        className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-[var(--text-primary)] hover:border-[var(--border-strong)]"
      >
        Restart ComfyUI
      </button>
      <button
        type="button"
        onClick={handleResetComfySettings}
        className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
      >
        Reset to server defaults
      </button>
    </div>
  );
}
