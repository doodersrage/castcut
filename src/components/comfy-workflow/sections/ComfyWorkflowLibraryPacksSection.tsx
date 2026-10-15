'use client';

import type { ComfyWorkflowLibraryViewModel } from '@/hooks/useComfyWorkflowLibrary';
import type { WorkflowPresetPack } from '@/lib/workflow-preset-packs';
import { Button } from '@/components/ui/Button';
import { SelectInput, TextInput } from '@/components/ui/Field';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import { EmptyState } from '@/components/ui/ViewState';

type Props = ComfyWorkflowLibraryViewModel;

export function ComfyWorkflowLibraryPacksSection({
  presetPacks,
  packName,
  setPackName,
  activePackId,
  setActivePackId,
  selectedId,
  createNewPack,
  importPresetPackFile,
  addSelectedWorkflowToPack,
  saveCurrentSettingsToPack,
  installPresetPack,
  exportPresetPack,
}: Props) {
  return (
    <div className="ui-surface-inset space-y-3">
      <h3 className="type-heading">Workflow preset packs</h3>
      <p className="type-caption">
        Bundle saved workflow presets for import/export between browsers or team members.
      </p>
      <ToolActionRow>
        <TextInput
          value={packName}
          onChange={event => setPackName(event.target.value)}
          placeholder="Pack name"
          className="min-w-[180px] flex-1"
        />
        <Button type="button" variant="secondary" size="sm" onClick={createNewPack}>
          New pack
        </Button>
        <label className="ui-file-input-label ui-btn-secondary ui-btn-sm">
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
              importPresetPackFile(file);
              event.target.value = '';
            }}
          />
        </label>
      </ToolActionRow>
      {presetPacks.length === 0 ? (
        <EmptyState
          compact
          icon="preset"
          title="No preset packs yet"
          description="Create a pack above to group workflow presets for export, import, and reuse across machines."
        />
      ) : (
        <>
          <label className="block space-y-2">
            <span className="type-caption">Active pack for saving</span>
            <SelectInput
              value={activePackId}
              onChange={event => setActivePackId(event.target.value)}
            >
              <option value="">Select pack…</option>
              {presetPacks.map((pack: WorkflowPresetPack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.name} ({pack.presets.length})
                </option>
              ))}
            </SelectInput>
          </label>
          <ToolActionRow>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!activePackId || !selectedId}
              onClick={addSelectedWorkflowToPack}
            >
              Add selected workflow to pack
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!activePackId}
              onClick={saveCurrentSettingsToPack}
            >
              Save current settings to pack
            </Button>
          </ToolActionRow>
          <ul className="ui-list">
            {presetPacks.map((pack: WorkflowPresetPack) => (
              <li key={pack.id} className="ui-list-row text-xs">
                <span className="ui-list-primary type-caption">
                  {pack.name} · {pack.presets.length} preset(s)
                </span>
                <ToolActionRow>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pack.presets.length === 0}
                    onClick={() => installPresetPack(pack)}
                  >
                    Install
                  </Button>
                  <Button
                    type="button"
                    variant="accent-outline"
                    size="sm"
                    onClick={() => exportPresetPack(pack)}
                  >
                    Export
                  </Button>
                </ToolActionRow>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
