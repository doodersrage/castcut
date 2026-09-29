'use client';

import type { SharedToolSettings } from '@/lib/settings-cache';
import { SETTINGS_TOOL_ACCENT } from '@/components/settings/tabs/settings-tool-shared';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';

const ACCENT = SETTINGS_TOOL_ACCENT;

export type SettingsHoldMaxPanelProps = {
  sharedSettings: SharedToolSettings;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  setStatus: (status: string | null) => void;
};

export default function SettingsHoldMaxPanel({
  sharedSettings,
  updateSharedSettings,
  setStatus,
}: SettingsHoldMaxPanelProps) {
  return (
    <ToolSection id="settings-comfyui-hold-max" title="Queue Max hold">
      <p className="text-sm text-[var(--text-secondary)]">
        When on, Max Generate / re-queue / Upscale / Moiré / Refine wait until the ComfyUI queue is
        idle, then flush from Queue → Orchestration.
      </p>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={sharedSettings.holdMaxUntilIdle === true}
          onChange={event => {
            updateSharedSettings({ holdMaxUntilIdle: event.target.checked });
            setStatus(
              event.target.checked
                ? 'Hold Best until idle enabled.'
                : 'Hold Best until idle disabled.'
            );
          }}
          className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
        />
        <span className="space-y-1">
          <span className="block text-sm font-medium text-[var(--text-primary)]">
            Hold Best until idle
          </span>
          <span className="block text-xs text-[var(--text-muted)]">
            Avoid stacking Best jobs while ComfyUI is already busy. Also shown on Queue →
            Orchestration.
          </span>
        </span>
      </label>
    </ToolSection>
  );
}
