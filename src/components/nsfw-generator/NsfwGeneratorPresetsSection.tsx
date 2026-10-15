'use client';

import NsfwGeneratorPresetChips from '@/components/NsfwGeneratorPresetChips';
import { CollapsibleSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import { toggleNsfwPresetFavorite } from '@/lib/user-nsfw-generator-presets';
import type { useNsfwGeneratorToolOrchestration } from '@/hooks/useNsfwGeneratorToolOrchestration';

const ACCENT = 'fuchsia' as const;

type ViewModel = ReturnType<typeof useNsfwGeneratorToolOrchestration>;

type Props = Pick<
  ViewModel,
  | 'toolSettings'
  | 'updateToolSettings'
  | 'userPresets'
  | 'presetPrefs'
  | 'handlePresetSelect'
  | 'saveCurrentAsPreset'
  | 'pickRandomPreset'
  | 'handoffToVariations'
  | 'exportPresets'
  | 'importPresetsFromFile'
  | 'deleteUserPreset'
  | 'setPresetPrefs'
>;

export default function NsfwGeneratorPresetsSection({
  toolSettings,
  updateToolSettings,
  userPresets,
  presetPrefs,
  handlePresetSelect,
  saveCurrentAsPreset,
  pickRandomPreset,
  handoffToVariations,
  exportPresets,
  importPresetsFromFile,
  deleteUserPreset,
  setPresetPrefs,
}: Props) {
  return (
    <CollapsibleSection
      title="Scene presets"
      summary={`${toolSettings.nsfwPresetId ? 'Preset selected' : 'Pick a starter mood or setting'}`}
      defaultOpen
      persistKey="nsfw-generator-presets"
    >
      <div className="space-y-3">
        <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={toolSettings.duoOnly === true}
            onChange={event => updateToolSettings({ duoOnly: event.target.checked || undefined })}
            className={`h-4 w-4 rounded ${accentFocusClass(ACCENT)}`}
          />
          Duo presets only
        </label>
        <NsfwGeneratorPresetChips
          selectedId={toolSettings.nsfwPresetId}
          category={toolSettings.presetCategory ?? 'all'}
          onCategoryChange={category => updateToolSettings({ presetCategory: category })}
          userPresets={userPresets}
          favoriteIds={presetPrefs.favoriteIds}
          recentIds={presetPrefs.recentIds}
          duoOnly={toolSettings.duoOnly === true}
          onToggleFavorite={id => setPresetPrefs(toggleNsfwPresetFavorite(id))}
          onDeleteUserPreset={deleteUserPreset}
          onSelect={handlePresetSelect}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={saveCurrentAsPreset}>
            Save current hints as preset
          </Button>
          <Button variant="secondary" size="sm" onClick={pickRandomPreset}>
            Random preset
          </Button>
          <Button variant="secondary" size="sm" onClick={handoffToVariations}>
            Variations grid
          </Button>
          <Button variant="secondary" size="sm" onClick={exportPresets}>
            Export presets
          </Button>
          <label className="ui-btn-secondary ui-btn-sm cursor-pointer px-4">
            Import presets
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Choose a JSON file"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) {
                  importPresetsFromFile(file);
                }
                event.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
    </CollapsibleSection>
  );
}
