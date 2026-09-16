import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetBrowserStorageCache } from './browser-storage';
import {
  applyRoleplayLibrarySession,
  deleteRoleplayLibrarySession,
  loadRoleplayLibrary,
  persistRoleplayLibraryFromCache,
  resolveRoleplayContinueFromCharacter,
  resolveStoryEntryCharacterId,
  ROLEPLAY_LIBRARY_KEY,
  roleplaySessionHasProgress,
  roleplaySessionTitle,
  saveRoleplayLibrary,
  shouldSyncRoleplaySessionToCharacter,
  syncRoleplayLibraryBioFromCharacter,
  withRoleplayCacheFromCastCharacter,
  archiveAndStartNewRoleplaySession,
  startNewRoleplaySession,
  upsertRoleplayLibrarySession,
} from './roleplay-library';
import { upsertCharacter } from './character-os';
import type { RoleplayToolCache } from './settings-cache';

function withMockLocalStorage(run: () => void): void {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      dispatchEvent: () => true,
    },
  });
  try {
    run();
  } finally {
    if (originalWindow === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  }
}

function sampleCache(patch: Partial<RoleplayToolCache> = {}): RoleplayToolCache {
  return {
    personaId: 'raccoon-pirate',
    characterName: 'Alex Quill',
    tone: 'noir',
    content: 'pg13',
    bio: {
      name: 'Alex Quill',
      look: 'a raccoon in a rain coat',
      personality: 'dry and loyal',
    },
    story: [
      {
        id: 'intro-first-look',
        title: 'First look',
        blurb: 'Portrait.',
        at: 1,
      },
      {
        id: 'mutiny',
        title: 'Mutiny at brunch',
        blurb: 'Syrup hostage.',
        at: 2,
        imageUrl: '/api/gallery/media/1?variant=original',
        stillStatus: 'completed',
      },
    ],
    ...patch,
  };
}

describe('roleplay library', () => {
  beforeEach(() => {
    withMockLocalStorage(() => {
      resetBrowserStorageCache();
      window.localStorage.removeItem(ROLEPLAY_LIBRARY_KEY);
    });
  });

  afterEach(() => {
    withMockLocalStorage(() => {
      resetBrowserStorageCache();
      window.localStorage.removeItem(ROLEPLAY_LIBRARY_KEY);
    });
  });

  it('ignores empty drafts and titles from the assigned name', () => {
    assert.equal(roleplaySessionHasProgress({ personaId: 'raccoon-pirate' }), false);
    assert.equal(roleplaySessionTitle(sampleCache()), 'Alex Quill');
  });

  it('archives a session, continues it, and deletes it', () => {
    withMockLocalStorage(() => {
      const first = persistRoleplayLibraryFromCache(sampleCache());
      assert.ok(first);
      assert.equal(first.session.title, 'Alex Quill');
      assert.equal(first.session.beatCount, 1);
      assert.equal(first.cache.activeSessionId, first.session.id);
      assert.equal(loadRoleplayLibrary().length, 1);

      const continued = applyRoleplayLibrarySession(first.session);
      assert.equal(continued.bio?.name, 'Alex Quill');
      assert.equal(continued.story?.[1]?.title, 'Mutiny at brunch');
      assert.equal(continued.activeSessionId, first.session.id);

      persistRoleplayLibraryFromCache({
        ...sampleCache({ characterName: 'Mara', bio: { name: 'Mara', look: 'a clerk', personality: 'tired' } }),
        activeSessionId: undefined,
      });
      assert.equal(loadRoleplayLibrary().length, 2);

      deleteRoleplayLibrarySession(first.session.id);
      const remaining = loadRoleplayLibrary();
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0]?.title, 'Mara');
    });
  });

  it('updates the same archive entry when the active session continues', () => {
    withMockLocalStorage(() => {
      const first = persistRoleplayLibraryFromCache(sampleCache());
      assert.ok(first);
      const next = persistRoleplayLibraryFromCache({
        ...first.cache,
        story: [
          ...(first.cache.story ?? []),
          { id: 'dock', title: 'Foggy dock', blurb: 'Tide in.', at: 3 },
        ],
      });
      assert.ok(next);
      assert.equal(next.session.id, first.session.id);
      assert.equal(loadRoleplayLibrary().length, 1);
      assert.equal(next.session.beatCount, 2);
    });
  });

  it('starts a new session without deleting the archive', () => {
    withMockLocalStorage(() => {
      const saved = persistRoleplayLibraryFromCache(
        sampleCache({
          referenceImageUrl: '/api/gallery/media/1?variant=original',
        })
      );
      assert.ok(saved);
      const blank = startNewRoleplaySession(saved.cache);
      assert.equal(blank.bio, undefined);
      assert.deepEqual(blank.story, []);
      assert.deepEqual(blank.rejectedScenes, []);
      assert.equal(blank.activeSessionId, undefined);
      assert.equal(blank.tone, saved.cache.tone);
      assert.equal(blank.characterName, '');
      assert.equal(blank.referenceImageUrl, '/api/gallery/media/1?variant=original');
      assert.equal(loadRoleplayLibrary().length, 1);
    });
  });

  it('shelves the open session then returns a blank draft', () => {
    withMockLocalStorage(() => {
      const current = sampleCache({
        activeSessionId: undefined,
        referenceImageUrl: '/api/gallery/media/1?variant=original',
      });
      const { archived, next } = archiveAndStartNewRoleplaySession(current);
      assert.ok(archived);
      assert.equal(archived.title, 'Alex Quill');
      assert.equal(archived.beatCount, 1);
      assert.equal(next.bio, undefined);
      assert.deepEqual(next.story, []);
      assert.equal(next.activeSessionId, undefined);
      assert.equal(next.tone, 'noir');
      assert.equal(next.characterName, '');
      assert.equal(next.referenceImageUrl, '/api/gallery/media/1?variant=original');
      const library = loadRoleplayLibrary();
      assert.equal(library.length, 1);
      assert.equal(library[0]?.id, archived.id);
      assert.equal(library[0]?.snapshot.bio?.name, 'Alex Quill');
    });
  });

  it('caps the library at 24 sessions', () => {
    withMockLocalStorage(() => {
      const sessions = Array.from({ length: 30 }, (_, index) => {
        const persisted = persistRoleplayLibraryFromCache(
          sampleCache({
            activeSessionId: undefined,
            characterName: `Cast ${index}`,
            bio: { name: `Cast ${index}`, look: 'a look', personality: 'game' },
          })
        );
        return persisted?.session;
      }).filter(Boolean);
      assert.equal(sessions.length, 30);
      assert.equal(loadRoleplayLibrary().length, 24);
      upsertRoleplayLibrarySession(sessions[0]!);
      saveRoleplayLibrary(loadRoleplayLibrary());
      assert.equal(loadRoleplayLibrary().length, 24);
    });
  });

  it('continues from Cast when the library session still exists', () => {
    withMockLocalStorage(() => {
      const saved = persistRoleplayLibraryFromCache(sampleCache());
      assert.ok(saved);
      const ok = resolveRoleplayContinueFromCharacter(`char-rp-${saved.session.id}`);
      assert.equal(ok.ok, true);
      if (ok.ok) {
        assert.equal(ok.session.id, saved.session.id);
        assert.equal(ok.cache.bio?.name, 'Alex Quill');
        assert.equal(ok.cache.autoQueue, true);
      }
    });
  });

  it('synthesizes continue from Cast when the library session is gone', () => {
    withMockLocalStorage(() => {
      upsertCharacter({
        id: 'char-rp-gone',
        name: 'Gone Session',
        version: 1,
        updatedAt: Date.now(),
        bio: { name: 'Gone Session', look: 'silver hair', personality: 'quiet' },
        characterName: 'Gone Session',
        tone: 'noir',
      });
      const recovered = resolveRoleplayContinueFromCharacter('char-rp-gone');
      assert.equal(recovered.ok, true);
      if (recovered.ok) {
        assert.equal(recovered.session.id, 'gone');
        assert.equal(recovered.cache.bio?.name, 'Gone Session');
        assert.match(recovered.cache.bio?.look ?? '', /silver/);
        assert.equal(recovered.cache.autoQueue, true);
      }

      const stillMissing = resolveRoleplayContinueFromCharacter('char-rp-no-cast');
      assert.equal(stillMissing.ok, false);
      if (!stillMissing.ok) {
        assert.equal(stillMissing.reason, 'session-missing');
      }
    });
  });

  it('continues from Play/Fitting Cast characters that are not char-rp', () => {
    withMockLocalStorage(() => {
      upsertCharacter({
        id: 'char-play-manual',
        name: 'Play Cast',
        version: 1,
        updatedAt: Date.now(),
        descriptor: 'linen coat, morning light',
        characterName: 'Play Cast',
      });
      const ok = resolveRoleplayContinueFromCharacter('char-play-manual');
      assert.equal(ok.ok, true);
      if (ok.ok) {
        assert.equal(ok.session.id, 'cast-char-play-manual');
        assert.equal(ok.cache.bio?.name, 'Play Cast');
        assert.match(ok.cache.bio?.look ?? '', /linen/);
        assert.equal(ok.cache.autoQueue, true);
      }
    });
  });

  it('seeds Cast look plate as Story From photo when continuing', () => {
    withMockLocalStorage(() => {
      upsertCharacter({
        id: 'char-plate-story',
        name: 'Plate Lead',
        version: 1,
        updatedAt: Date.now(),
        characterName: 'Plate Lead',
        bio: { name: 'Plate Lead', look: 'short dark hair', personality: 'sharp' },
        reference: {
          originalUrl: 'https://example.com/plate-original.jpg',
          originalFilename: 'plate-original.jpg',
          isolatedUrl: 'https://example.com/plate-cut.jpg',
          isolatedFilename: 'plate-cut.jpg',
          isolated: true,
          isolateSubject: true,
        },
      });
      const ok = resolveRoleplayContinueFromCharacter('char-plate-story');
      assert.equal(ok.ok, true);
      if (ok.ok) {
        assert.equal(ok.cache.playAs, 'photo');
        assert.equal(ok.cache.referenceImageUrl, 'https://example.com/plate-cut.jpg');
        assert.equal(ok.cache.referenceImageFilename, 'plate-cut.jpg');
        assert.equal(ok.cache.referenceIsolated, true);
        assert.equal(ok.cache.autoQueue, true);
      }
    });
  });

  it('keeps an existing Story photo and only enables From photo', () => {
    withMockLocalStorage(() => {
      upsertCharacter({
        id: 'char-rp-keep-photo',
        name: 'Keep Photo',
        version: 1,
        updatedAt: Date.now(),
        characterName: 'Keep Photo',
        bio: { name: 'Keep Photo', look: 'a look', personality: 'calm' },
        reference: {
          originalUrl: 'https://example.com/cast-plate.jpg',
          isolatedUrl: 'https://example.com/cast-plate.jpg',
          isolated: true,
        },
      });
      const saved = persistRoleplayLibraryFromCache(
        sampleCache({
          playAs: 'text',
          referenceImageUrl: 'https://example.com/user-story.jpg',
          referenceImageFilename: 'user-story.jpg',
          activeSessionId: 'keep-photo',
        })
      );
      assert.ok(saved);
      assert.equal(saved.session.id, 'keep-photo');
      const ok = resolveRoleplayContinueFromCharacter('char-rp-keep-photo');
      assert.equal(ok.ok, true);
      if (ok.ok) {
        assert.equal(ok.cache.referenceImageUrl, 'https://example.com/user-story.jpg');
        assert.equal(ok.cache.playAs, 'photo');
      }
    });
  });

  it('overlays Cast bible onto a stale Story library session', () => {
    withMockLocalStorage(() => {
      const saved = persistRoleplayLibraryFromCache(
        sampleCache({
          activeSessionId: 'stale-bio',
          bio: {
            name: 'Old Library Name',
            look: 'stale library look',
            personality: 'stale library personality',
          },
          characterName: 'Old Library Name',
        })
      );
      assert.ok(saved);
      // Cast bible is source of truth after library persist (which may stamp Cast).
      upsertCharacter({
        id: 'char-rp-stale-bio',
        name: 'Cast Lead',
        version: 1,
        updatedAt: Date.now(),
        characterName: 'Cast Lead',
        bio: {
          name: 'Cast Lead',
          look: 'fresh Cast look — ink coat',
          personality: 'updated on Cast',
        },
      });
      const ok = resolveRoleplayContinueFromCharacter('char-rp-stale-bio');
      assert.equal(ok.ok, true);
      if (ok.ok) {
        assert.equal(ok.cache.bio?.name, 'Cast Lead');
        assert.match(ok.cache.bio?.look ?? '', /ink coat/);
        assert.equal(ok.cache.bio?.personality, 'updated on Cast');
        assert.equal(ok.cache.characterName, 'Cast Lead');
      }
    });
  });

  it('syncRoleplayLibraryBioFromCharacter updates the linked library snapshot', () => {
    withMockLocalStorage(() => {
      const saved = persistRoleplayLibraryFromCache(
        sampleCache({
          activeSessionId: 'sync-bio',
          bio: { name: 'Before', look: 'before look', personality: 'before' },
        })
      );
      assert.ok(saved);
      upsertCharacter({
        id: 'char-rp-sync-bio',
        name: 'After',
        version: 1,
        updatedAt: Date.now(),
        characterName: 'After',
        bio: { name: 'After', look: 'after look', personality: 'after' },
      });
      syncRoleplayLibraryBioFromCharacter({
        id: 'char-rp-sync-bio',
        name: 'After',
        version: 1,
        updatedAt: Date.now(),
        characterName: 'After',
        bio: { name: 'After', look: 'after look', personality: 'after' },
      });
      const session = loadRoleplayLibrary().find(entry => entry.id === 'sync-bio');
      assert.equal(session?.snapshot.bio?.name, 'After');
      assert.equal(session?.snapshot.bio?.look, 'after look');
      assert.equal(session?.title, 'After');
    });
  });

  it('withRoleplayCacheFromCastCharacter prefers complete Cast bio', () => {
    const cache = sampleCache({
      bio: { name: 'Story', look: 'story look', personality: 'story' },
      characterName: 'Story',
    });
    const next = withRoleplayCacheFromCastCharacter(cache, {
      id: 'char-x',
      name: 'Cast',
      version: 1,
      updatedAt: 1,
      bio: { name: 'Cast', look: 'cast look', personality: 'cast' },
    });
    assert.equal(next.bio?.name, 'Cast');
    assert.equal(next.bio?.look, 'cast look');
    assert.equal(next.characterName, 'Cast');
  });

  it('resolves Story entry Cast from query or active Cast', () => {
    assert.equal(
      resolveStoryEntryCharacterId({ queryCharacterId: 'char-q', activeCharacterId: 'char-a' }),
      'char-q'
    );
    assert.equal(
      resolveStoryEntryCharacterId({ queryCharacterId: '', activeCharacterId: 'char-a' }),
      'char-a'
    );
    assert.equal(resolveStoryEntryCharacterId({ queryCharacterId: null, activeCharacterId: null }), null);
  });

  it('syncs Story when the live session is not the Cast library id', () => {
    assert.equal(shouldSyncRoleplaySessionToCharacter('char-play', 'cast-char-play'), false);
    assert.equal(shouldSyncRoleplaySessionToCharacter('char-play', 'cast-other'), true);
    assert.equal(shouldSyncRoleplaySessionToCharacter('char-play', undefined), true);
    assert.equal(shouldSyncRoleplaySessionToCharacter('', 'cast-x'), false);
  });
});
