'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/Field';
import PortraitTileStrip from '@/components/ui/PortraitTileStrip';
import {
  castLookPortraitTile,
  castPlateThumbUrl,
  castPlateTiles,
} from '@/lib/character-plate-thumb';
import { whenBrowserStorageReady } from '@/lib/browser-storage';
import {
  addLookFromShared,
  applyCharacterRecord,
  applyCharacterRecordFresh,
  characterFromShared,
  characterHomeHref,
  getCharacter,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  looksOf,
  loraTriggerFromCharacter,
  removeCharacter,
  subscribeCharacters,
  renameActiveLook,
  upsertCharacter,
} from '@/lib/character-os';
import { migrateCharactersFromLegacy } from '@/lib/play-cast';
import { switchCastPlate } from '@/lib/cast-plate-switch';
import { listSavedIdentityBundles, type SharedToolSettings } from '@/lib/settings-cache';
import { roleplaySessionsForCharacterSync } from '@/lib/roleplay-library';

type CharacterOsPickerProps = {
  shared: SharedToolSettings;
  hints?: string;
  onApply: (patch: Partial<SharedToolSettings>) => void;
};

export default function CharacterOsPicker({ shared, hints, onApply }: CharacterOsPickerProps) {
  const characters = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );
  const [name, setName] = useState('');

  useEffect(() => {
    let cancelled = false;
    void whenBrowserStorageReady().then(() => {
      if (cancelled) {
        return;
      }
      migrateCharactersFromLegacy({
        bundles: listSavedIdentityBundles(),
        roleplaySessions: roleplaySessionsForCharacterSync(),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeId = shared.activeCharacterId?.trim();
  const active = getCharacter(activeId) ?? characters.find(entry => entry.id === activeId);
  const looks = active ? looksOf(active) : [];
  const activeLookId = shared.activeLookId ?? active?.activeLookId;

  const applyId = (id: string) => {
    const character = characters.find(entry => entry.id === id);
    if (!character) {
      onApply({
        activeCharacterId: undefined,
        activeLookId: undefined,
        activeCharacterDescriptor: undefined,
        ipAdapterImageFilename: undefined,
        ipAdapterImageFilenames: undefined,
        ipAdapterImageUrl: undefined,
        ipAdapterComfyUrl: undefined,
        ipAdapterStrength: undefined,
        ipAdapterModelFilename: undefined,
        identityKind: undefined,
      });
      return;
    }
    try {
      // A different Cast: its own face and wardrobe, nothing of the previous one's (fresh).
      // The Cast already active: keep its face lock and settings.
      onApply(
        character.id === activeId
          ? applyCharacterRecord(character)
          : applyCharacterRecordFresh(character)
      );
    } catch (error) {
      console.error('CharacterOsPicker: failed to apply character', error);
      onApply({
        activeCharacterId: character.id,
        activeLookId: undefined,
        activeCharacterDescriptor: character.descriptor,
        ipAdapterImageFilename: undefined,
        ipAdapterImageFilenames: undefined,
        ipAdapterImageUrl: undefined,
        ipAdapterComfyUrl: undefined,
        identityKind: undefined,
      });
    }
  };

  const applyLookId = (lookId: string) => {
    if (!activeId) {
      return;
    }
    try {
      // Outfit / Story follow the look's plate (switchCastPlate), as on the Cast page.
      const next = switchCastPlate(activeId, lookId);
      if (next) {
        onApply(applyCharacterRecordFresh(next));
      }
    } catch (error) {
      console.error('CharacterOsPicker: failed to apply look', error);
    }
  };

  const saveCurrent = () => {
    // With a Cast active the field names the LOOK. The typed text used to become the Cast's
    // name — renaming the character, and replacing any other Cast with that name.
    const resolvedName = active?.name || name.trim() || 'Untitled character';
    const record = characterFromShared(shared, {
      name: resolvedName,
      hints,
      notes: active?.notes,
    });
    if (activeId) {
      record.id = activeId;
    }
    upsertCharacter(record);
    if (active && name.trim()) {
      renameActiveLook(record.id, name);
    }
    const saved = getCharacter(record.id);
    onApply(saved ? applyCharacterRecordFresh(saved) : applyCharacterRecordFresh(record));
    setName('');
  };

  const saveLook = () => {
    if (!activeId) {
      saveCurrent();
      return;
    }
    // An unnamed look is numbered ("Look 3"); every one used to be called "New look".
    const next = addLookFromShared(activeId, shared, name.trim());
    if (next) {
      // Same Cast: keep its face lock and strength (the "fresh" apply dropped them).
      onApply(applyCharacterRecord(next));
    }
    setName('');
  };

  const saveRow = (
    <div className="flex flex-wrap gap-2">
      <input
        value={name}
        onChange={event => setName(event.target.value)}
        placeholder={active ? 'Name this look' : 'Name this character'}
        className="ui-input min-w-[10rem] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        aria-label={active ? 'Look name' : 'Character name'}
      />
      <Button size="sm" variant="secondary" onClick={saveCurrent}>
        {activeId ? 'Update look' : 'Save character'}
      </Button>
      {activeId ? (
        <Button size="sm" variant="ghost" onClick={saveLook}>
          Save as new look
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-2">
      <FieldLabel>Character</FieldLabel>
      {/* Picked by picture: a dropdown hid the Cast behind a list of names. */}
      <PortraitTileStrip
        label="Active character"
        value={activeId ?? ''}
        onChange={applyId}
        testIdPrefix="cast-picker-character"
        tiles={[
          { id: '', label: 'None', title: 'None — session only', glyph: '–' },
          ...characters.map(character => {
            const trigger = loraTriggerFromCharacter(character);
            return {
              id: character.id,
              label: character.name,
              title: trigger ? `${character.name} · ${trigger}` : character.name,
              thumb: castPlateThumbUrl(character) || undefined,
            };
          }),
        ]}
      />
      <div className="flex flex-wrap gap-2">
        {activeId ? (
          <>
            <ButtonLink
              href={characterHomeHref(activeId)}
              size="sm"
              variant="secondary"
              data-testid="cast-picker-open-home"
            >
              Open Cast page
            </ButtonLink>
            <Button
              size="sm"
              variant="ghost"
              title="Delete this Cast record (asks first)"
              onClick={() => {
                // Forget deletes the Cast record everywhere — it sat next to "Go to home" with no
                // confirmation.
                if (
                  !window.confirm(
                    `Forget ${active?.name || 'this character'}? This deletes the Cast record and its looks from every tool. Gallery stills stay in the gallery.`
                  )
                ) {
                  return;
                }
                removeCharacter(activeId);
                onApply({
                  activeCharacterId: undefined,
                  activeLookId: undefined,
                  activeCharacterDescriptor: undefined,
                  ipAdapterImageFilename: undefined,
                  ipAdapterImageFilenames: undefined,
                  ipAdapterImageUrl: undefined,
                  ipAdapterComfyUrl: undefined,
                  ipAdapterStrength: undefined,
                  ipAdapterModelFilename: undefined,
                  identityKind: undefined,
                });
              }}
            >
              Forget
            </Button>
          </>
        ) : null}
      </div>
      {active && looks.length > 0 ? (
        <div className="space-y-1.5">
          <FieldLabel>Look</FieldLabel>
          <PortraitTileStrip
            label="Active look"
            value={activeLookId ?? ''}
            onChange={applyLookId}
            testIdPrefix="cast-picker-look"
            // The Cast page's Looks tiles: each look's own plate, name and outfit lock. A look with
            // no plate is added to on the Cast page, so its box here only says so.
            tiles={castPlateTiles(active).map(tile =>
              castLookPortraitTile(tile, { placeholder: 'No plate' })
            )}
          />
        </div>
      ) : null}
      {/* Saving is occasional — keep it one click away instead of three controls up front. */}
      <details className="group" data-testid="cast-picker-save-look">
        <summary className="type-caption cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          {active ? 'Save or rename this look…' : 'Save these settings as a character…'}
        </summary>
        <div className="mt-2 space-y-2">
          {saveRow}
          {!activeId ? (
            <p className="type-caption text-[var(--text-muted)]">
              One record for face lock, wardrobe, looks, and LoRA. Generate, Story, Video, and
              gallery all stamp the active character.
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
