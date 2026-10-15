'use client';

import {
  buildPromptBriefFromCurrent,
  downloadPromptBrief,
  parsePromptBriefFile,
  applyPromptBrief,
} from '@/lib/prompt-brief';
import {
  buildScenePresetFromCurrent,
  upsertScenePreset,
  loadScenePresets,
} from '@/lib/scene-presets';
import { accentButtonClass } from '@/components/ui/ToolPageShell';
import { FieldLabel } from '@/components/ui/Field';
import { Button, PrimaryButton } from '@/components/ui/Button';
import dynamic from 'next/dynamic';
import type { StudioPresetsTabProps } from '@/components/studio/tabs/StudioPresetsTab';

const SharedToolControls = dynamic(() => import('@/components/SharedToolControls'), {
  ssr: false,
  loading: () => (
    <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-muted)]/50" aria-hidden />
  ),
});

export function StudioPresetsSaveSection({
  accent,
  shared,
  presetName,
  presetHints,
  compareHints,
  filledTemplate,
  onPresetNameChange,
  onPresetHintsChange,
  onScenePresetsChange,
  onBackupStatusChange,
  onUpdateShared,
}: StudioPresetsTabProps) {
  return (
    <>
      <p className="text-sm text-[var(--text-secondary)]">
        Save named bundles of hints and shared locks (kit, location, seed) for quick reuse across
        Generate, Character, and Background.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            const brief = buildPromptBriefFromCurrent({
              label: presetName.trim() || 'Studio brief',
              hints: presetHints.trim() || filledTemplate || 'scene hints',
              model: shared.model,
              detailLevel: shared.detail,
              tool: 'studio',
            });
            downloadPromptBrief(brief);
            onBackupStatusChange('Prompt brief downloaded.');
          }}
        >
          Export prompt brief
        </Button>
        <label className="ui-btn-secondary cursor-pointer px-4 py-2 text-sm">
          Import prompt brief
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
                  const brief = parsePromptBriefFile(raw);
                  applyPromptBrief(brief);
                  onPresetNameChange(brief.label);
                  onPresetHintsChange(brief.hints);
                  onBackupStatusChange(`Loaded prompt brief “${brief.label}”.`);
                })
                .catch(error => {
                  onBackupStatusChange(error instanceof Error ? error.message : 'Import failed.');
                });
            }}
          />
        </label>
      </div>

      <SharedToolControls
        shared={shared}
        onModelChange={model => onUpdateShared({ model })}
        onDetailChange={detail => onUpdateShared({ detail })}
        onWorkflowPresetChange={id => onUpdateShared({ selectedWorkflowFileId: id })}
        lockedWardrobeId={shared.lockedWardrobeId}
        lockedLocation={shared.lockedLocation}
        lockedVariationSeed={shared.lockedVariationSeed}
        onClearLockedWardrobe={() => onUpdateShared({ lockedWardrobeId: undefined })}
        onClearLockedLocation={() => onUpdateShared({ lockedLocation: undefined })}
        onClearLockedVariationSeed={() => onUpdateShared({ lockedVariationSeed: undefined })}
      />

      <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
        <div className="space-y-1">
          <FieldLabel htmlFor="studio-preset-name">Preset name</FieldLabel>
          <input
            id="studio-preset-name"
            value={presetName}
            onChange={event => onPresetNameChange(event.target.value)}
            placeholder="Gravel duo night race"
            className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          />
        </div>
        <div className="space-y-1">
          <FieldLabel htmlFor="studio-preset-hints">Hints (optional)</FieldLabel>
          <input
            id="studio-preset-hints"
            value={presetHints}
            onChange={event => onPresetHintsChange(event.target.value)}
            placeholder={compareHints}
            className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          />
        </div>
      </div>

      <PrimaryButton
        accentClassName={accentButtonClass(accent)}
        disabled={!presetName.trim()}
        onClick={() => {
          const preset = buildScenePresetFromCurrent({
            name: presetName,
            hints: presetHints || compareHints,
            tool: 'studio',
            shared,
          });
          upsertScenePreset(preset);
          onScenePresetsChange(loadScenePresets());
          onPresetNameChange('');
          onBackupStatusChange(`Saved preset “${preset.name}”.`);
        }}
      >
        Save current locks as preset
      </PrimaryButton>
    </>
  );
}
