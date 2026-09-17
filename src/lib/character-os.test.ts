import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCharacterRecord,
  applyCharacterRecordFresh,
  applyRemovedCharacterIds,
  bundleFromCharacter,
  castLoraSessionIds,
  characterFromBundle,
  characterFromRoleplaySession,
  characterFromShared,
  createBlankCharacter,
  activeLook,
  getCharacter,
  lookFromAppearance,
  looksOf,
  mergeMigratedCharacters,
  normalizeCharacterRecord,
  roleplayLibraryIdFromCharacter,
  saveCharacterBio,
  slugCharacterName,
  upsertCharacter,
  type CharacterRecord,
} from './character-os';
import type { CharacterIdentityBundle } from './character-identity-bundle';
import type { RoleplayLibrarySession } from './roleplay-library';
import { loadSettingsCache, saveSettingsCache, type SharedToolSettings } from './settings-cache';
import { resetBrowserStorageCache } from './browser-storage';

function withMockLocalStorage(run: () => void): void {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      dispatchEvent: () => true,
    },
  });
  resetBrowserStorageCache();
  try {
    run();
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
    resetBrowserStorageCache();
  }
}

const bundle: CharacterIdentityBundle = {
  version: 1,
  exportedAt: '2026-08-16T12:00:00.000Z',
  name: 'Rin',
  hints: 'black bob, red jacket',
  descriptor: 'Japanese woman, 28, sharp eyes',
  ipAdapterImageFilename: 'rin-lock.png',
  ipAdapterStrength: 0.72,
  lockedWardrobeId: 'jacket-01',
  loraTriggerPhrases: ['rinstyle'],
};

describe('character-os', () => {
  it('round-trips an identity bundle', () => {
    const character = characterFromBundle(bundle, 'char-rin');
    assert.equal(character.id, 'char-rin');
    assert.equal(character.name, 'Rin');
    assert.equal(character.ipAdapter?.imageFilename, 'rin-lock.png');
    const back = bundleFromCharacter(character);
    assert.equal(back.name, 'Rin');
    assert.equal(back.ipAdapterImageFilename, 'rin-lock.png');
    assert.equal(back.loraTriggerPhrases?.[0], 'rinstyle');
  });

  it('keeps look keepers on the character record', () => {
    const character = normalizeCharacterRecord({
      ...characterFromBundle(bundle, 'char-rin'),
      looks: [
        {
          id: 'look-1',
          name: 'Default',
          createdAt: 1,
          keeperEntryIds: ['g1', 'g2'],
        },
      ],
      activeLookId: 'look-1',
    });
    assert.deepEqual(activeLook(character).keeperEntryIds, ['g1', 'g2']);
  });

  it('keeps a film cut on the character record', () => {
    const character = normalizeCharacterRecord({
      ...characterFromBundle(bundle, 'char-rin'),
      filmCut: {
        items: [{ entryId: 'g1', included: true }],
        stillHoldSec: 3,
        updatedAt: 1,
      },
    });
    assert.equal(character.filmCut?.items[0]?.entryId, 'g1');
    assert.equal(character.filmCut?.stillHoldSec, 3);
  });

  it('applies a character onto shared session fields including activeCharacterId', () => {
    const patch = applyCharacterRecord(characterFromBundle(bundle, 'char-rin'));
    assert.equal(patch.activeCharacterId, 'char-rin');
    assert.equal(patch.activeCharacterDescriptor, 'Japanese woman, 28, sharp eyes');
    assert.equal(patch.ipAdapterImageFilename, 'rin-lock.png');
    assert.equal(patch.lockedWardrobeId, 'jacket-01');
  });

  it('captures the live session lock into a character record', () => {
    const shared = {
      model: 'qwen-image-2512',
      detail: 'balanced',
      activeCharacterDescriptor: 'tall, silver hair',
      ipAdapterImageFilename: 'face.png',
      ipAdapterImageUrl: '/api/gallery/media/identity',
      ipAdapterStrength: 0.6,
      identityKind: 'ipadapter',
      lockedLocation: 'neon alley',
    } as SharedToolSettings;
    const record = characterFromShared(shared, { name: 'Nova', hints: 'rain-soaked streets' });
    assert.equal(record.name, 'Nova');
    assert.equal(record.ipAdapter?.imageUrl, '/api/gallery/media/identity');
    assert.equal(record.lockedLocation, 'neon alley');
  });

  it('createBlankCharacter stores optional Part and From photo playAs', () => {
    const blank = createBlankCharacter('Rin', undefined, {
      personaId: 'raccoon-pirate',
      playAs: 'photo',
    });
    assert.equal(blank.personaId, 'raccoon-pirate');
    assert.equal(blank.playAs, 'photo');
  });

  it('saveCharacterBio persists bible and active look descriptor', () => {
    withMockLocalStorage(() => {
      const blank = createBlankCharacter('Nova', {
        sex: 'woman',
        ethnicity: 'mediterranean',
        ageBand: 'early-20s',
        height: 'average',
        bodyBuild: 'average',
      });
      upsertCharacter(blank);
      const saved = saveCharacterBio(blank.id, {
        name: 'Nova',
        look: 'ink coat, gold glasses, satchel',
        personality: 'dry, loyal, always late',
        catchphrase: 'notes first',
      });
      assert.ok(saved?.bio);
      assert.equal(saved?.bio?.look, 'ink coat, gold glasses, satchel');
      assert.equal(saved?.descriptor, 'ink coat, gold glasses, satchel');
      assert.equal(saved?.looks?.[0]?.descriptor, 'ink coat, gold glasses, satchel');
      const reloaded = getCharacter(blank.id);
      assert.equal(reloaded?.bio?.personality, 'dry, loyal, always late');
      assert.equal(reloaded?.bio?.catchphrase, 'notes first');
    });
  });

  it('createBlankCharacter does not inherit session face lock or wardrobe', () => {
    const blank = createBlankCharacter('Kai', {
      sex: 'man',
      ethnicity: 'mediterranean',
      ageBand: '30s',
      height: 'average',
      bodyBuild: 'stocky',
    });
    assert.equal(blank.name, 'Kai');
    assert.equal(blank.ipAdapter?.imageFilename, undefined);
    assert.ok(blank.descriptor && blank.descriptor.length > 8);
    assert.match(blank.descriptor, /Mediterranean/);
    assert.match(blank.hints ?? '', /man/);
    assert.equal(blank.lockedWardrobeId, undefined);
    const fresh = applyCharacterRecordFresh(blank);
    assert.equal(fresh.activeCharacterId, blank.id);
    assert.equal(fresh.ipAdapterImageFilename, undefined);
    assert.equal(fresh.lockedWardrobeId, undefined);
    assert.equal(fresh.activeCharacterDescriptor, blank.descriptor);
    // Explicit clears so callers can overwrite a prior Cast session.
    assert.ok('ipAdapterImageFilename' in fresh);
    assert.ok('lockedWardrobeId' in fresh);
  });

  it('migrates bundles and roleplay sessions without duplicating names', () => {
    const session = {
      id: 'rp-1',
      createdAt: 1,
      updatedAt: 2,
      title: 'Rin',
      beatCount: 1,
      snapshot: {
        characterName: 'Rin',
        bio: { name: 'Rin', look: 'black bob', personality: 'dry wit' },
        referenceImageFilename: 'rin-ref.png',
      },
    } as RoleplayLibrarySession;
    const merged = mergeMigratedCharacters({
      existing: [],
      bundles: [bundle],
      roleplaySessions: [session],
    });
    assert.equal(merged.length, 1);
    assert.equal(slugCharacterName(merged[0]!.name), 'rin');
  });

  it('keeps two Roleplay sessions even when they share a display name', () => {
    const first = characterFromRoleplaySession({
      id: 'rp-kai-1',
      createdAt: 1,
      updatedAt: 2,
      title: 'Kai',
      beatCount: 1,
      snapshot: {
        characterName: 'Kai',
        bio: { name: 'Kai', look: 'silver hair', personality: 'quiet' },
      },
    } as RoleplayLibrarySession);
    const second = {
      id: 'rp-kai-2',
      createdAt: 3,
      updatedAt: 4,
      title: 'Kai',
      beatCount: 1,
      snapshot: {
        characterName: 'Kai',
        bio: { name: 'Kai', look: 'red coat', personality: 'loud' },
      },
    } as RoleplayLibrarySession;
    assert.ok(first);
    const merged = mergeMigratedCharacters({
      existing: [first!],
      roleplaySessions: [second],
    });
    assert.equal(merged.length, 2);
    assert.ok(merged.some(entry => entry.id === 'char-rp-rp-kai-1'));
    assert.ok(merged.some(entry => entry.id === 'char-rp-rp-kai-2'));
  });

  it('imports a later roleplay session when the roster already has someone', () => {
    const existing = [characterFromBundle(bundle, 'char-rin')];
    const session = {
      id: 'rp-kai',
      createdAt: 1,
      updatedAt: 4,
      title: 'Kai',
      beatCount: 1,
      snapshot: {
        characterName: 'Kai',
        bio: { name: 'Kai', look: 'silver hair', personality: 'quiet' },
      },
    } as RoleplayLibrarySession;
    const merged = mergeMigratedCharacters({
      existing,
      roleplaySessions: [session],
    });
    assert.equal(merged.length, 2);
    assert.ok(merged.some(entry => slugCharacterName(entry.name) === 'kai'));
    assert.ok(merged.some(entry => slugCharacterName(entry.name) === 'rin'));
  });

  it('converts a roleplay library session into a character with reference plate', () => {
    const converted = characterFromRoleplaySession({
      id: 'sess-9',
      createdAt: 1,
      updatedAt: 3,
      title: 'Kai',
      beatCount: 2,
      snapshot: {
        characterName: 'Kai',
        isolateSubject: true,
        referenceIsolated: true,
        referenceImageUrl: 'blob:cutout',
        referenceImageFilename: 'kai.png',
        playAs: 'photo',
      },
    } as RoleplayLibrarySession);
    assert.equal(converted?.name, 'Kai');
    assert.equal(converted?.reference?.isolatedFilename, 'kai.png');
    assert.equal(converted?.playAs, 'photo');
  });

  it('keeps prior looks when activating a new era', () => {
    const first = normalizeCharacterRecord(
      characterFromShared(
        {
          model: 'qwen-image-2512',
          activeCharacterDescriptor: 'black bob',
          lockedWardrobeId: 'jacket-01',
        } as SharedToolSettings,
        { name: 'Rin' }
      )
    );
    assert.equal(looksOf(first).length, 1);
    const winter = lookFromAppearance(
      { descriptor: 'long hair', lockedWardrobeId: 'coat-02' },
      'Winter'
    );
    const withTwo = normalizeCharacterRecord({
      ...first,
      looks: [winter, ...looksOf(first)],
      activeLookId: winter.id,
    });
    assert.equal(looksOf(withTwo).length, 2);
    assert.equal(withTwo.lockedWardrobeId, 'coat-02');
    const original = looksOf(withTwo).find(look => look.id !== winter.id)!;
    const restored = normalizeCharacterRecord({
      ...withTwo,
      activeLookId: original.id,
    });
    assert.equal(restored.lockedWardrobeId, 'jacket-01');
  });

  it('drops removed ids from a migrated roster', () => {
    const rin = characterFromBundle(bundle, 'char-rin');
    const kai = characterFromRoleplaySession({
      id: 'rp-kai',
      createdAt: 1,
      updatedAt: 2,
      title: 'Kai',
      beatCount: 1,
      snapshot: { characterName: 'Kai', bio: { name: 'Kai', look: 'silver', personality: 'quiet' } },
    } as RoleplayLibrarySession);
    assert.ok(kai);
    const kept = applyRemovedCharacterIds([rin, kai!], [kai!.id]);
    assert.deepEqual(
      kept.map(entry => entry.id),
      ['char-rin']
    );
    assert.equal(roleplayLibraryIdFromCharacter(kai!.id), 'rp-kai');
    assert.equal(roleplayLibraryIdFromCharacter('char-rin'), undefined);
  });

  it('applies pinned LoRA ids onto the session and by-model map', () => {
    withMockLocalStorage(() => {
      saveSettingsCache({
        ...loadSettingsCache(),
        shared: {
          ...loadSettingsCache().shared,
          model: 'qwen-image-2512',
          sessionActiveLoraIdsByModel: { 'qwen-image-2512': ['other-lora'] },
        },
      });
      const record = normalizeCharacterRecord({
        ...characterFromBundle(bundle, 'char-lora'),
        loraLibraryIds: ['lora-rin'],
      });
      const patch = applyCharacterRecord(record);
      assert.ok(patch.sessionActiveLoraIds?.includes('lora-rin'));
      assert.deepEqual(patch.sessionActiveLoraIdsByModel?.['qwen-image-2512'], ['lora-rin']);
      assert.equal(patch.activeLookId, record.activeLookId);
    });
  });

  it('castLoraSessionIds returns pinned ids for Day job pin', () => {
    assert.equal(castLoraSessionIds(null), undefined);
    const blank = normalizeCharacterRecord(characterFromBundle(bundle, 'char-blank'));
    assert.equal(castLoraSessionIds(blank), undefined);
    const withLora = normalizeCharacterRecord({
      ...blank,
      loraLibraryIds: ['lora-a', 'lora-a', '  lora-b  '],
    });
    assert.deepEqual(castLoraSessionIds(withLora), ['lora-a', 'lora-b']);
  });

  it('applyCharacterRecordFresh clears prior by-model LoRAs when Cast has none', () => {
    withMockLocalStorage(() => {
      saveSettingsCache({
        ...loadSettingsCache(),
        shared: {
          ...loadSettingsCache().shared,
          model: 'qwen-image-2512',
          sessionActiveLoraIds: ['stale-lora'],
          sessionActiveLoraIdsByModel: { 'qwen-image-2512': ['stale-lora'] },
        },
      });
      const blank = createBlankCharacter('Fresh Clear');
      const fresh = applyCharacterRecordFresh(blank);
      assert.equal(fresh.sessionActiveLoraIds, undefined);
      assert.deepEqual(fresh.sessionActiveLoraIdsByModel?.['qwen-image-2512'], []);
    });
  });

  it('does not wipe session model when character has no model, and survives empty looks', () => {
    const corrupt = {
      id: 'char-empty-looks',
      name: 'Empty Looks',
      version: 1 as const,
      updatedAt: Date.now(),
      looks: [{ id: 'look-blank', name: '   ', createdAt: Date.now() }],
    };
    assert.equal(looksOf(corrupt as CharacterRecord).length, 1);
    assert.ok(activeLook(corrupt as CharacterRecord).name);

    const patch = applyCharacterRecord(corrupt as CharacterRecord);
    assert.equal(patch.model, undefined);
    assert.equal(patch.detail, undefined);
    assert.equal(patch.activeCharacterId, 'char-empty-looks');
    assert.ok(patch.activeLookId);

    const merged = { model: 'qwen-image-2512', detail: 'balanced' as const, ...patch };
    assert.equal(merged.model, 'qwen-image-2512');
    assert.equal(merged.detail, 'balanced');
  });
});
