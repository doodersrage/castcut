import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyCharacterRecord, applyCharacterRecordFresh, applyRemovedCharacterIds, bundleFromCharacter, castLoraSessionIds, characterFromBundle, characterFromShared, createBlankCharacter, activeLook, activateLook, getCharacter, renameLook, withNewPlateLook, lookFromAppearance, renameActiveLook, loadCharacters, looksOf, saveCharacters, normalizeCharacterRecord, roleplayLibraryIdFromCharacter, saveCharacterTraits, setLookPlateStance, slugCharacterName, upsertCharacter, castIdForRoleplaySession, type CharacterRecord } from './character-os';
import { characterFromRoleplaySession, clearCharacterBio, mergeMigratedCharacters, migrateCharactersFromLegacy, saveCharacterBio, upsertCharacterFromRoleplaySession } from './play-cast';
import type { CharacterIdentityBundle } from './character-identity-bundle';
import type { RoleplayLibrarySession } from './roleplay-library';
import { loadSettingsCache, saveSettingsCache, type SharedToolSettings } from './settings-cache';
import {
  resetBrowserStorageCache,
  withLocalWritesPreserved,
  withSuppressedDurableSyncPush,
} from './browser-storage';

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

  it('a fresh-browser migration mid-pull does not keep its empty list over the server Cast', () => {
    withMockLocalStorage(() => {
      const pullStartedAt = Date.now() - 1;
      // Fresh profile: the picker's first-import migration lands while the startup pull runs.
      migrateCharactersFromLegacy({ bundles: [], roleplaySessions: [] });
      const server = createBlankCharacter('Rin', {
        sex: 'woman',
        ethnicity: 'east-asian',
        ageBand: 'late-20s',
        height: 'average',
        bodyBuild: 'average',
      });
      const kept = withLocalWritesPreserved(pullStartedAt, () =>
        withSuppressedDurableSyncPush(() => saveCharacters([server]))
      );
      assert.equal(kept, 0);
      assert.deepEqual(
        loadCharacters().map(entry => entry.name),
        ['Rin']
      );
    });
  });

  it('saveCharacterBio persists the bible and leaves the physical description alone', () => {
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
      // The bible is Story's: its look no longer becomes what Day and Look draw.
      assert.equal(saved?.descriptor, blank.descriptor);
      assert.equal(saved?.looks?.[0]?.descriptor, blank.descriptor);
      assert.equal(saved?.traits?.sex, 'woman');
      const reloaded = getCharacter(blank.id);
      assert.equal(reloaded?.bio?.personality, 'dry, loyal, always late');
      assert.equal(reloaded?.bio?.catchphrase, 'notes first');
      const cleared = clearCharacterBio(blank.id);
      assert.equal(cleared?.bio, undefined);
      assert.equal(getCharacter(blank.id)?.bio, undefined);
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

  it('does not import a Cast session again beside its older "char-rp-cast-" copy', () => {
    const copy = {
      ...characterFromBundle(bundle, 'char-rp-cast-char-rin'),
      updatedAt: 10,
    };
    const session = {
      id: 'cast-char-rin',
      createdAt: 1,
      updatedAt: 9,
      title: 'Rin',
      beatCount: 1,
      snapshot: {
        characterName: 'Rin',
        bio: { name: 'Rin', look: 'black bob', personality: 'dry wit' },
      },
    } as RoleplayLibrarySession;
    const merged = mergeMigratedCharacters({ existing: [copy], roleplaySessions: [session] });
    assert.deepEqual(
      merged.map(entry => entry.id),
      ['char-rp-cast-char-rin']
    );
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

  it('renameActiveLook renames the look and leaves the Cast name alone', () => {
    withMockLocalStorage(() => {
      const record = normalizeCharacterRecord(
        characterFromShared({ model: 'qwen-image-2512' } as SharedToolSettings, { name: 'Mara' })
      );
      upsertCharacter(record);
      const renamed = renameActiveLook(record.id, '  Beach day ');
      assert.equal(renamed?.name, 'Mara');
      assert.equal(activeLook(getCharacter(record.id)!).name, 'Beach day');
      assert.equal(renameActiveLook(record.id, '  ')?.name, 'Mara');
    });
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

  it('applyCharacterRecordFresh leaves session LoRAs alone when Cast has none', () => {
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
      assert.equal(fresh.sessionActiveLoraIdsByModel, undefined);
      // Face/wardrobe still cleared for blank Cast create.
      assert.ok('ipAdapterImageFilename' in fresh);
      assert.ok('lockedWardrobeId' in fresh);
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

describe('a Story session saved back onto its Cast', () => {
  const session = (id: string, name: string) =>
    ({
      id,
      createdAt: 1,
      updatedAt: 5,
      title: name,
      beatCount: 0,
      snapshot: {
        characterName: name,
        bio: { name, look: 'a man in a grey coat', personality: 'patient' },
      },
    }) as RoleplayLibrarySession;

  it('maps the session id back to the Cast it was opened from', () => {
    assert.equal(castIdForRoleplaySession('cast-char-abc'), 'char-abc');
    assert.equal(castIdForRoleplaySession('roleplay-123'), 'char-rp-roleplay-123');
    assert.equal(castIdForRoleplaySession('char-rp-roleplay-123'), 'char-rp-roleplay-123');
  });

  it('updates a Film-made Cast in place instead of replacing it with a copy', () => {
    withMockLocalStorage(() => {
      const tomas = createBlankCharacter('Tomas', {
        sex: 'man',
        ethnicity: 'random',
        ageBand: '30s',
        height: 'average',
        bodyBuild: 'average',
      } as never);
      upsertCharacter(tomas);
      const looksBefore = looksOf(getCharacter(tomas.id)!).length;
      const saved = upsertCharacterFromRoleplaySession(session(`cast-${tomas.id}`, 'Tomas'));
      assert.equal(saved?.id, tomas.id);
      const all = loadCharacters().filter(entry => slugCharacterName(entry.name) === 'tomas');
      assert.deepEqual(all.map(entry => entry.id), [tomas.id]);
      assert.equal(looksOf(getCharacter(tomas.id)!).length, looksBefore);
      assert.equal(getCharacter(tomas.id)?.bio?.personality, 'patient');
    });
  });

  it('folds an older "char-rp-cast-" copy into the real Cast', () => {
    withMockLocalStorage(() => {
      const tomas = createBlankCharacter('Tomas', undefined as never);
      upsertCharacter(tomas);
      saveCharacters([
        ...loadCharacters(),
        { ...tomas, id: `char-rp-cast-${tomas.id}`, updatedAt: Date.now() - 10 },
      ]);
      const saved = upsertCharacterFromRoleplaySession(session(`cast-${tomas.id}`, 'Tomas'));
      assert.equal(saved?.id, tomas.id);
      assert.deepEqual(
        loadCharacters()
          .filter(entry => slugCharacterName(entry.name) === 'tomas')
          .map(entry => entry.id),
        [tomas.id]
      );
    });
  });
});

describe('a reference to a Cast an older version replaced', () => {
  it('finds its "char-rp-cast-" copy', () => {
    withMockLocalStorage(() => {
      const copy = createBlankCharacter('Tomas', undefined as never);
      saveCharacters([{ ...copy, id: 'char-rp-cast-char-lost' }]);
      assert.equal(getCharacter('char-lost')?.id, 'char-rp-cast-char-lost');
      assert.equal(getCharacter('char-rp-missing'), undefined);
      saveCharacters([{ ...copy, id: 'char-real' }]);
      assert.equal(getCharacter('char-rp-cast-char-real')?.id, 'char-real');
    });
  });
});

describe('switching the active Cast', () => {
  it("drops the previous Cast's face lock when the new one has none", () => {
    withMockLocalStorage(() => {
      const cache = loadSettingsCache();
      saveSettingsCache({
        ...cache,
        shared: {
          ...cache.shared,
          activeCharacterId: 'char-tomas',
          ipAdapterImageFilenames: ['tomas-cutout.png'],
          ipAdapterImageUrl: '/api/comfyui/view?filename=tomas-cutout.png',
          identityKind: 'ipadapter',
        } as SharedToolSettings,
      });
      const nora = createBlankCharacter('Nora', undefined as never);
      const patch = applyCharacterRecord({ ...nora, id: 'char-nora' });
      assert.equal(patch.activeCharacterId, 'char-nora');
      assert.ok('ipAdapterImageFilenames' in patch);
      assert.equal(patch.ipAdapterImageFilenames, undefined);
      assert.equal(patch.ipAdapterImageUrl, undefined);
      assert.equal(patch.identityKind, undefined);
      // Re-applying the same Cast keeps its lock.
      const again = applyCharacterRecord({ ...nora, id: 'char-tomas' });
      assert.ok(!('ipAdapterImageFilenames' in again));
    });
  });
});

describe('saving an unchanged Cast', () => {
  it('keeps the stored record and its time', () => {
    withMockLocalStorage(() => {
      const tomas = { ...createBlankCharacter('Tomas', undefined as never), id: 'char-tomas' };
      upsertCharacter(tomas);
      const before = getCharacter('char-tomas')!;
      upsertCharacter({ ...before });
      assert.equal(getCharacter('char-tomas')!.updatedAt, before.updatedAt);
      upsertCharacter({ ...before, notes: 'likes trains' });
      assert.notEqual(getCharacter('char-tomas')!.notes, undefined);
    });
  });
});

describe('the Story bible look follows the Cast description', () => {
  it('a rolled bible look gives way to the Cast description', async () => {
    const { castBibleLook } = await import('./play-cast');
    const rolled =
      'a White man in his 40s with fair skin, a square jaw, short ginger hair and a ginger beard, and a body that is average height, stocky';
    assert.equal(
      castBibleLook({ bio: { name: 'Sam', look: rolled, personality: 'calm' }, descriptor: 'a young Black man' }),
      'a young Black man'
    );
    // A bible look someone wrote stays.
    assert.equal(
      castBibleLook({ bio: { name: 'Sam', look: 'tall, in a green coat', personality: 'calm' }, descriptor: 'a man' }),
      'tall, in a green coat'
    );
  });
});

describe('Cast traits', () => {
  it('are the physical description; the bible stays Story\'s', () => {
    withMockLocalStorage(() => {
      upsertCharacter({
        id: 'char-traits',
        name: 'Traits',
        version: 1,
        updatedAt: 1,
        descriptor: 'an Indigenous woman in her forties with warm skin, and a body that is short, muscular',
        ipAdapter: { imageFilename: 'traits-face.png' },
        bio: { name: 'Traits', look: 'a red raincoat, always muddy boots', personality: 'calm' },
      });
      const saved = saveCharacterTraits('char-traits', { sex: 'woman', ageBand: '30s' });
      assert.match(saved?.descriptor ?? '', /^a woman/);
      assert.doesNotMatch(saved?.descriptor ?? '', /Indigenous|hair|skin/);
      assert.equal(saved?.looks?.[0]?.descriptor, saved?.descriptor);
      assert.equal(saved?.bio?.look, 'a red raincoat, always muddy boots');
      // Nothing picked, with a picture: no description at all — the picture shows the person.
      const cleared = saveCharacterTraits('char-traits', undefined);
      assert.equal(cleared?.descriptor, undefined);
      assert.equal(cleared?.traits, undefined);
    });
  });
});

describe('several look plates per Cast', () => {
  it('an added plate is a new active look; the old plate and the Cast traits stay', () => {
    withMockLocalStorage(() => {
      upsertCharacter({
        id: 'char-plates',
        name: 'Plates',
        version: 1,
        updatedAt: 1,
        descriptor: 'a woman in her thirties',
        lockedWardrobeId: 'denim-01',
        ipAdapter: { imageFilename: 'plate-a.png', imageUrl: '/a.png' },
        reference: { originalFilename: 'plate-a.png', originalUrl: '/a.png' },
      });
      const first = activeLook(getCharacter('char-plates')!);
      saveCharacterTraits('char-plates', { sex: 'woman', ageBand: '30s' });
      const stored = getCharacter('char-plates')!;
      const withPlate = withNewPlateLook(stored, {
        id: 'look-plate-b',
        reference: { originalFilename: 'plate-b.png', originalUrl: '/b.png' },
        ipAdapter: { imageFilename: 'plate-b.png', imageUrl: '/b.png' },
      });
      assert.equal(withPlate.activeLookId, 'look-plate-b');
      assert.equal(withPlate.ipAdapter?.imageFilename, 'plate-b.png');
      assert.equal(withPlate.reference?.originalFilename, 'plate-b.png');
      // The description and wardrobe come along from the active look.
      assert.equal(withPlate.descriptor, stored.descriptor);
      assert.equal(withPlate.lockedWardrobeId, 'denim-01');
      upsertCharacter(withPlate);
      const saved = getCharacter('char-plates')!;
      const looks = looksOf(saved);
      assert.equal(looks.length, 2);
      assert.equal(looks.find(look => look.id === 'look-plate-b')?.name, 'Plate 2');
      assert.equal(looks.find(look => look.id === 'look-plate-b')?.keeperEntryIds, undefined);
      assert.equal(
        looks.find(look => look.id === first.id)?.ipAdapter?.imageFilename,
        'plate-a.png'
      );
      // Traits are the Cast's, not a plate's.
      assert.equal(saved.traits?.sex, 'woman');
    });
  });

  it('switching back to a plate brings its own picture back', () => {
    withMockLocalStorage(() => {
      upsertCharacter({
        id: 'char-swap',
        name: 'Swap',
        version: 1,
        updatedAt: 1,
        ipAdapter: { imageFilename: 'swap-a.png', imageUrl: '/a.png' },
      });
      const first = activeLook(getCharacter('char-swap')!);
      upsertCharacter(
        withNewPlateLook(getCharacter('char-swap')!, {
          name: 'Beach',
          reference: undefined,
          ipAdapter: { imageFilename: 'swap-b.png', imageUrl: '/b.png' },
        })
      );
      assert.equal(getCharacter('char-swap')?.ipAdapter?.imageFilename, 'swap-b.png');
      assert.equal(activeLook(getCharacter('char-swap')!).name, 'Beach');
      const back = activateLook('char-swap', first.id);
      assert.equal(back?.activeLookId, first.id);
      assert.equal(back?.ipAdapter?.imageFilename, 'swap-a.png');
    });
  });

  it('setLookPlateStance stores the plate stance on the look and keeps it through edits', () => {
    withMockLocalStorage(() => {
      upsertCharacter({
        id: 'char-stance',
        name: 'Stance',
        version: 1,
        updatedAt: 1,
        ipAdapter: { imageFilename: 'stance-a.png', imageUrl: '/a.png' },
      });
      const look = activeLook(getCharacter('char-stance')!);
      const stored = setLookPlateStance('char-stance', look.id, {
        standing: false,
        reason: 'seated',
        checkedAt: 7,
        plate: 'stance-a.png',
      });
      assert.deepEqual(activeLook(stored!).plateStance, {
        standing: false,
        reason: 'seated',
        checkedAt: 7,
        plate: 'stance-a.png',
      });
      // An appearance save (no looks passed) rebuilds the look — the stance stays.
      upsertCharacter({ ...getCharacter('char-stance')!, looks: undefined, hints: 'freckles' });
      assert.equal(activeLook(getCharacter('char-stance')!).plateStance?.reason, 'seated');
      // A broken stored stance is dropped.
      const broken = normalizeCharacterRecord({
        ...getCharacter('char-stance')!,
        looks: [{ ...look, plateStance: { reason: 'dancing' } as never }],
      });
      assert.equal('plateStance' in activeLook(broken), false);
    });
  });

  it('renameLook names any plate; a blank name or unknown look is ignored', () => {
    withMockLocalStorage(() => {
      upsertCharacter({ id: 'char-name', name: 'Name', version: 1, updatedAt: 1 });
      const look = activeLook(getCharacter('char-name')!);
      assert.equal(
        renameLook('char-name', look.id, '  Winter coat  ')?.looks?.[0]?.name,
        'Winter coat'
      );
      assert.equal(renameLook('char-name', look.id, '   ')?.looks?.[0]?.name, 'Winter coat');
      assert.equal(renameLook('char-name', 'look-missing', 'X')?.looks?.[0]?.name, 'Winter coat');
      assert.equal(getCharacter('char-name')?.name, 'Name');
    });
  });
});

describe('a new look made from the active one', () => {
  it('wears the same kept outfit, without the old plate’s kept try-on', async () => {
    const { withNewPlateLook, looksOf } = await import('./character-os');
    const character = {
      id: 'char-copy',
      name: 'Copy',
      version: 1,
      updatedAt: 1,
      activeLookId: 'look-a',
      looks: [
        {
          id: 'look-a',
          name: 'A',
          createdAt: 1,
          lockedWardrobeId: 'kit-1',
          keptOutfit: { entryId: 'g-1', dressPlateKey: 'k-1', wardrobeId: 'kit-1', footwear: 'red heels' },
        },
      ],
    } as never;
    const next = withNewPlateLook(character, { id: 'look-b', reference: undefined, ipAdapter: undefined });
    const copy = looksOf(next).find(look => look.id === 'look-b');
    assert.equal(copy?.keptOutfit?.wardrobeId, 'kit-1');
    assert.equal(copy?.keptOutfit?.footwear, 'red heels');
    assert.equal(copy?.keptOutfit?.entryId, undefined);
    assert.equal(copy?.keptOutfit?.dressPlateKey, undefined);
  });
});
