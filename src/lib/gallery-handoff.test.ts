import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearGalleryHandoff,
  loadGalleryHandoff,
  saveGalleryHandoff,
  type GalleryHandoffPayload,
} from './gallery-handoff';

function installMemoryWindow() {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    },
  });
}

describe('gallery-handoff load', () => {
  it('accepts Cast plate picks with an image and empty prompt', () => {
    installMemoryWindow();
    const payload: GalleryHandoffPayload = {
      source: 'gallery',
      galleryEntryId: 'entry-1',
      promptId: 'prompt-1',
      prompt: '',
      imageUrl: 'https://example.com/lana.webp',
      imageFilename: 'lana.webp',
      target: 'cast',
      savedAt: Date.now(),
      characterId: 'char-1',
    };
    saveGalleryHandoff(payload);
    const loaded = loadGalleryHandoff('cast');
    assert.ok(loaded);
    assert.equal(loaded?.imageUrl, 'https://example.com/lana.webp');
    assert.equal(loaded?.characterId, 'char-1');
    clearGalleryHandoff();
  });

  it('rejects handoffs with neither prompt nor image', () => {
    installMemoryWindow();
    saveGalleryHandoff({
      source: 'gallery',
      galleryEntryId: 'entry-2',
      promptId: 'prompt-2',
      prompt: '   ',
      target: 'cast',
      savedAt: Date.now(),
    });
    assert.equal(loadGalleryHandoff('cast'), null);
  });
});
