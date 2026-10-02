'use client';

import {
  buildSceneStarterPack,
  downloadSceneStarterPack,
  parseSceneStarterPack,
} from '@/lib/scene-starter-packs';
import {
  upsertUserSceneStarterPreset,
  loadUserSceneStarterPresets,
  toggleUserSceneStarterFavorite,
  deleteUserSceneStarterPreset,
} from '@/lib/user-scene-starter-presets';
import { useGenerateEmptyCta } from '@/hooks/useEmptyCta';
import { Button } from '@/components/ui/Button';
import { DataList, DataListPrimary, DataListRow } from '@/components/ui/DataList';
import { EmptyState } from '@/components/ui/ViewState';
import type { StudioPresetsTabProps } from '@/components/studio/tabs/StudioPresetsTab';

export function StudioPresetsStartersSection({
  sceneStarterPackName,
  userSceneStarters,
  onSceneStarterPackNameChange,
  onUserSceneStartersChange,
  onBackupStatusChange,
}: StudioPresetsTabProps) {
  const generateCta = useGenerateEmptyCta();
  return (
    <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
      <p className="text-sm font-medium text-[var(--text-primary)]">Scene starter presets</p>
      <p className="text-xs text-[var(--text-muted)]">
        Saved from Generate/Character preset panels or promoted from Gallery analytics. These appear
        in the preset catalog on Generate and Character.
      </p>
      <input
        value={sceneStarterPackName}
        onChange={event => onSceneStarterPackNameChange(event.target.value)}
        placeholder="Starter pack name"
        className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={!sceneStarterPackName.trim() || userSceneStarters.length === 0}
          onClick={() =>
            downloadSceneStarterPack(
              buildSceneStarterPack({
                name: sceneStarterPackName.trim(),
                presets: userSceneStarters,
              })
            )
          }
        >
          Export starter pack
        </Button>
        <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
          Import starter pack
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              void file
                .text()
                .then(raw => {
                  const pack = parseSceneStarterPack(raw);
                  for (const preset of pack.presets) {
                    upsertUserSceneStarterPreset(preset);
                  }
                  onUserSceneStartersChange(loadUserSceneStarterPresets());
                  onBackupStatusChange(`Imported scene starter pack “${pack.name}”.`);
                })
                .catch(err => {
                  onBackupStatusChange(err instanceof Error ? err.message : 'Import failed.');
                });
            }}
          />
        </label>
      </div>
      {userSceneStarters.length === 0 ? (
        <EmptyState
          compact
          icon="preset"
          title="No scene starters yet"
          description="Save a starter from Generate or Character, or promote high-scoring tokens from Analytics. They appear in those tools’ preset catalogs."
          action={generateCta}
        />
      ) : (
        <DataList scrollable={false}>
          {userSceneStarters.map(preset => (
            <DataListRow key={preset.id} className="!items-start !py-4">
              <DataListPrimary
                title={
                  <>
                    {preset.favorite ? '★ ' : null}
                    {preset.label}
                  </>
                }
                subtitle={preset.hints}
              />
              <div className="ui-list-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  className="type-caption"
                  onClick={() => {
                    toggleUserSceneStarterFavorite(preset.id);
                    onUserSceneStartersChange(loadUserSceneStarterPresets());
                  }}
                >
                  {preset.favorite ? 'Unfavorite' : 'Favorite'}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  className="type-caption"
                  onClick={() => {
                    deleteUserSceneStarterPreset(preset.id);
                    onUserSceneStartersChange(loadUserSceneStarterPresets());
                  }}
                >
                  Remove
                </Button>
              </div>
            </DataListRow>
          ))}
        </DataList>
      )}
    </div>
  );
}
