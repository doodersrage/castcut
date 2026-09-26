'use client';

import { Button } from '@/components/ui/Button';
import { gpuSettingsPatch, gpuSettingsSuggestion } from '@/lib/gpu-settings-match';
import { DEFAULT_SHARED_SETTINGS, type SharedToolSettings } from '@/lib/settings-cache';

/** "24 GB card → Max size · Final quality — Match this GPU" (only while it would change something). */
export default function GpuMatchCard({
  totalVramGb,
  sharedSettings,
  updateSharedSettings,
}: {
  totalVramGb?: number | null;
  sharedSettings: SharedToolSettings;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
}) {
  const suggestion = gpuSettingsSuggestion(totalVramGb != null ? totalVramGb * 1e9 : null);
  if (!suggestion) return null;
  const patch = gpuSettingsPatch(sharedSettings, DEFAULT_SHARED_SETTINGS, suggestion);
  const matched =
    sharedSettings.modelResolutionSizeTier === suggestion.sizeTier &&
    sharedSettings.queueQualityProfile === suggestion.qualityProfile;
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2 text-sm"
      data-testid="gpu-match"
    >
      <span className="text-[var(--text-secondary)]">{suggestion.label}</span>
      {matched ? (
        <span className="type-caption text-[var(--text-muted)]">· matched</span>
      ) : Object.keys(patch).length > 0 ? (
        <Button
          size="sm"
          variant="secondary"
          data-testid="gpu-match-apply"
          onClick={() => updateSharedSettings(patch)}
        >
          Match this GPU
        </Button>
      ) : (
        <span className="type-caption text-[var(--text-muted)]">
          · you&apos;ve set size and quality yourself
        </span>
      )}
    </div>
  );
}
