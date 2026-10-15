'use client';

import { removeSavedIdentityBundle, upsertSavedIdentityBundle } from '@/lib/settings-cache';
import {
  buildCharacterIdentityBundle,
  downloadCharacterIdentityBundle,
  parseCharacterIdentityBundle,
} from '@/lib/character-identity-bundle';
import { characterFromBundle, upsertCharacter } from '@/lib/character-os';
import { Button } from '@/components/ui/Button';
import { DataList, DataListPrimary, DataListRow } from '@/components/ui/DataList';
import type { StudioPresetsTabProps } from '@/components/studio/tabs/StudioPresetsTab';

export function StudioPresetsIdentitySection({
  shared,
  toolSettings,
  presetHints,
  compareHints,
  identityBundleName,
  onIdentityBundleNameChange,
  onUpdateToolSettings,
  onApplyIdentityBundle,
  onOpenCharacterWithIdentity,
  onBackupStatusChange,
}: StudioPresetsTabProps) {
  return (
    <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
      <p className="text-sm font-medium text-[var(--text-primary)]">Character identity bundles</p>
      <p className="text-xs text-[var(--text-muted)]">
        Export/import — or save to a browser-local list — reusable character sheets: locks, hints,
        pinned descriptor, and a portable IP-Adapter reference (image/strength/model — see Settings
        → ComfyUI). Enable LoRAs from the LoRA stack on each tool.
      </p>
      <input
        value={identityBundleName}
        onChange={event => onIdentityBundleNameChange(event.target.value)}
        placeholder="Character name"
        className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={!identityBundleName.trim()}
          onClick={() =>
            downloadCharacterIdentityBundle(
              buildCharacterIdentityBundle({
                name: identityBundleName,
                shared,
                hints: presetHints || compareHints,
              })
            )
          }
        >
          Export bundle
        </Button>
        <Button
          variant="secondary"
          disabled={!identityBundleName.trim()}
          onClick={() => {
            const bundle = buildCharacterIdentityBundle({
              name: identityBundleName,
              shared,
              hints: presetHints || compareHints,
            });
            onUpdateToolSettings({
              savedIdentityBundles: upsertSavedIdentityBundle(
                toolSettings.savedIdentityBundles,
                bundle
              ),
            });
            upsertCharacter(characterFromBundle(bundle));
            onBackupStatusChange(`Saved identity bundle “${bundle.name}” to your list.`);
          }}
        >
          Save to list
        </Button>
        <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
          Import bundle
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
                  const bundle = parseCharacterIdentityBundle(raw);
                  onApplyIdentityBundle(bundle);
                  onBackupStatusChange(`Imported identity bundle “${bundle.name}”.`);
                })
                .catch(err => {
                  onBackupStatusChange(err instanceof Error ? err.message : 'Import failed.');
                });
            }}
          />
        </label>
      </div>
      {(toolSettings.savedIdentityBundles ?? []).length > 0 ? (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Saved bundles ({(toolSettings.savedIdentityBundles ?? []).length})
          </p>
          <DataList scrollable={false}>
            {(toolSettings.savedIdentityBundles ?? []).map(bundle => (
              <DataListRow key={bundle.name} className="!items-start !py-3">
                <DataListPrimary
                  title={bundle.name}
                  subtitle={
                    [bundle.model, bundle.ipAdapterImageFilename ? 'IP-Adapter ref' : null]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                />
                <div className="ui-list-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="type-caption"
                    onClick={() => {
                      onApplyIdentityBundle(bundle);
                      onBackupStatusChange(`Applied identity bundle “${bundle.name}”.`);
                    }}
                  >
                    Apply
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="type-caption"
                    onClick={() => onOpenCharacterWithIdentity(bundle)}
                  >
                    Open Character
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="type-caption"
                    onClick={() =>
                      onUpdateToolSettings({
                        savedIdentityBundles: removeSavedIdentityBundle(
                          toolSettings.savedIdentityBundles,
                          bundle.name
                        ),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              </DataListRow>
            ))}
          </DataList>
        </div>
      ) : null}
    </div>
  );
}
