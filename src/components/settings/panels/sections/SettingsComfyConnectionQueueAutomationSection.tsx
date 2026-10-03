'use client';

import { DEFAULT_NEGATIVE_PROFILES, type NegativeProfile } from '@/lib/negative-profiles';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import type { SettingsComfyConnectionPanelProps } from '@/components/settings/panels/settings-comfy-connection-types';

type Props = Pick<
  SettingsComfyConnectionPanelProps,
  | 'settings'
  | 'updateSettings'
  | 'sharedSettings'
  | 'sharedMounted'
  | 'updateSharedSettings'
  | 'notificationPermission'
  | 'handleEnableNotifications'
>;

export function SettingsComfyConnectionQueueAutomationSection({
  settings,
  updateSettings,
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  notificationPermission,
  handleEnableNotifications,
}: Props) {
  return (
    <CollapsibleSection
      title="Queue automation & notifications"
      summary="Auto-save, mutate/seed fallbacks, WebSocket progress, and browser alerts."
      defaultOpen={false}
      persistKey="settings-queue-automation"
    >
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.autoSaveHistoryOnQueue !== false}
          onChange={event => updateSettings({ autoSaveHistoryOnQueue: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Auto-save to history when queueing from result panels (skips if already saved)
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={sharedSettings.promptVersioningEnabled !== false}
          onChange={event =>
            updateSharedSettings({
              promptVersioningEnabled: event.target.checked,
            })
          }
          disabled={!sharedMounted}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Named prompt versions (vN labels + lineage on history saves)
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.autoMutateOnHighRating ?? false}
          onChange={event => updateSettings({ autoMutateOnHighRating: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Auto-queue mutations when a gallery output is rated 4–5★ (fallback when Final/Max improve is
        off or fails)
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.autoSeedExperimentOnHighRating ?? false}
          onChange={event =>
            updateSettings({ autoSeedExperimentOnHighRating: event.target.checked })
          }
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Auto-queue seed experiments when a gallery output is rated 4–5★
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.autoSeedExperimentOnFavorite ?? false}
          onChange={event => updateSettings({ autoSeedExperimentOnFavorite: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Auto-queue seed experiments when an output is favorited
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.autoNegativeOnQueue !== false}
          onChange={event => updateSettings({ autoNegativeOnQueue: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Auto-generate negative prompt when queueing SD-family models
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.useWebSocketProgress !== false}
          onChange={event => updateSettings({ useWebSocketProgress: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Use ComfyUI WebSocket for faster job progress updates
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.warmUpOnToolOpen === true}
          onChange={event => updateSettings({ warmUpOnToolOpen: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Warm up the engine when I open a tool
      </label>
      <p className="-mt-2 pl-6 text-xs text-[var(--text-muted)]">
        Day, Story and Outfit load their engine while you set up — only when ComfyUI is idle, the
        engine isn&apos;t already loaded and there is VRAM to spare. Nothing is saved.
      </p>

      <div className="ui-surface-inset space-y-2">
        <p className="text-xs font-medium text-[var(--text-secondary)]">Negative profile library</p>
        <select
          value={settings.selectedNegativeProfileId ?? 'general-sd'}
          onChange={event => updateSettings({ selectedNegativeProfileId: event.target.value })}
          className="ui-input w-full px-3 py-2 text-sm"
        >
          {(settings.negativeProfiles?.length
            ? settings.negativeProfiles
            : DEFAULT_NEGATIVE_PROFILES
          ).map((profile: NegativeProfile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            updateSettings({
              negativeProfiles: DEFAULT_NEGATIVE_PROFILES,
            })
          }
          className="type-caption ui-text-link"
        >
          Reset profiles to defaults
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.notifyOnComplete ?? false}
          disabled={notificationPermission === 'unsupported'}
          onChange={event => updateSettings({ notifyOnComplete: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Notify when ComfyUI jobs complete
        {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
          <button
            type="button"
            onClick={() => void handleEnableNotifications()}
            className="type-caption ui-text-link"
          >
            Enable permission
          </button>
        )}
      </label>
      {notificationPermission === 'unsupported' && (
        <p className="text-xs text-[var(--text-muted)]">
          Browser notifications are not supported in this environment.
        </p>
      )}

      <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.autoVisionTags !== false}
          onChange={event => updateSettings({ autoVisionTags: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Auto-tag completed and uploaded gallery images with vision LLM tags (also on LLM tab)
      </label>
    </CollapsibleSection>
  );
}
