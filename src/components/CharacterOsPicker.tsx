'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/Field';
import { whenBrowserStorageReady } from '@/lib/browser-storage';
import {
  activateLook,
  addLookFromShared,
  applyCharacterRecordFresh,
  characterFromShared,
  characterHomeHref,
  getCharacter,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  looksOf,
  loraTriggerFromCharacter,
  migrateCharactersFromLegacy,
  removeCharacter,
  subscribeCharacters,
  upsertCharacter,
} from '@/lib/character-os';
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
      // Fresh clears prior Cast face/wardrobe so Look/Extract cannot keep a stale IP lock.
      onApply(applyCharacterRecordFresh(character));
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
      const next = activateLook(activeId, lookId);
      if (next) {
        onApply(applyCharacterRecordFresh(next));
      }
    } catch (error) {
      console.error('CharacterOsPicker: failed to apply look', error);
    }
  };

  const saveCurrent = () => {
    const resolvedName = name.trim() || active?.name || 'Untitled character';
    const record = characterFromShared(shared, {
      name: resolvedName,
      hints,
      notes: active?.notes,
    });
    if (activeId) {
      record.id = activeId;
    }
    upsertCharacter(record);
    const saved = getCharacter(record.id);
    onApply(saved ? applyCharacterRecordFresh(saved) : applyCharacterRecordFresh(record));
    setName('');
  };

  const saveLook = () => {
    if (!activeId) {
      saveCurrent();
      return;
    }
    const next = addLookFromShared(activeId, shared, name.trim() || 'New look');
    if (next) {
      onApply(applyCharacterRecordFresh(next));
    }
    setName('');
  };

  return (
    <div className="space-y-2">
      <FieldLabel>Character</FieldLabel>
      <div className="flex flex-wrap gap-2">
        <select
          className="ui-input min-w-[12rem] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          value={activeId ?? ''}
          onChange={event => applyId(event.target.value)}
          aria-label="Active character"
        >
          <option value="">None — session only</option>
          {characters.map(character => (
            <option key={character.id} value={character.id}>
              {character.name}
              {loraTriggerFromCharacter(character)
                ? ` · ${loraTriggerFromCharacter(character)}`
                : ''}
            </option>
          ))}
        </select>
        {activeId ? (
          <>
            <ButtonLink
              href={characterHomeHref(activeId)}
              size="sm"
              variant="secondary"
              data-testid="cast-picker-open-home"
            >
              Go to home
            </ButtonLink>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
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
        <select
          className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          value={activeLookId ?? ''}
          onChange={event => applyLookId(event.target.value)}
          aria-label="Active look"
        >
          {looks.map(look => (
            <option key={look.id} value={look.id}>
              {look.name}
            </option>
          ))}
        </select>
      ) : null}
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
      {!activeId ? (
        <p className="type-caption text-[var(--text-muted)]">
          One record for face lock, wardrobe, looks, and LoRA. Generate, Story, Video, and gallery
          all stamp the active character.
        </p>
      ) : null}
    </div>
  );
}
