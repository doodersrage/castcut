'use client';

import { buildPresetPack, downloadPresetPack, parsePresetPack } from '@/lib/preset-packs';
import { upsertScenePreset, loadScenePresets } from '@/lib/scene-presets';
import { Button } from '@/components/ui/Button';
import type { StudioPresetsTabProps } from '@/components/studio/tabs/StudioPresetsTab';

export function StudioPresetsPacksSection({
  presetPackName,
  scenePresets,
  onPresetPackNameChange,
  onScenePresetsChange,
  onBackupStatusChange,
}: StudioPresetsTabProps) {
  return (
    <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
      <p className="text-sm font-medium text-[var(--text-primary)]">Preset packs</p>
      <p className="text-xs text-[var(--text-muted)]">
        Export or import bundles of scene presets for sharing across machines.
      </p>
      <input
        value={presetPackName}
        onChange={event => onPresetPackNameChange(event.target.value)}
        placeholder="Pack name"
        className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={!presetPackName.trim() || scenePresets.length === 0}
          onClick={() =>
            downloadPresetPack(
              buildPresetPack({
                name: presetPackName.trim(),
                presets: scenePresets,
              })
            )
          }
        >
          Export pack
        </Button>
        <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
          Import pack
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Choose a JSON file"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              void file
                .text()
                .then(raw => {
                  const pack = parsePresetPack(raw);
                  for (const preset of pack.presets) {
                    upsertScenePreset(preset);
                  }
                  onScenePresetsChange(loadScenePresets());
                  onBackupStatusChange(`Imported preset pack “${pack.name}”.`);
                })
                .catch(err => {
                  onBackupStatusChange(err instanceof Error ? err.message : 'Import failed.');
                });
            }}
          />
        </label>
      </div>
    </div>
  );
}
