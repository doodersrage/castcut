import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import {
  assignOutfitPlateToCastAndFitting,
  buildLookCastPlatePrompt,
  clearCharacterLookPlate,
  ensureOutfitPlateAfterLook,
  fittingHasSessionPlate,
  pickMoodboardPlateSource,
} from './look-outfit-plate';
import { createBlankCharacter, getCharacter, upsertCharacter } from './character-os';
import {
  DEFAULT_FITTING_TOOL_CACHE,
  loadToolSettings,
  saveToolSettings,
} from './settings-cache';

function installMemoryWindow() {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      sessionStorage: {
        getItem: (key: string) => storage.get(`s:${key}`) ?? null,
        setItem: (key: string, value: string) => storage.set(`s:${key}`, value),
        removeItem: (key: string) => storage.delete(`s:${key}`),
      },
      dispatchEvent: () => true,
    },
  });
  resetBrowserStorageCache();
}

describe('look-outfit-plate', () => {
  it('pickMoodboardPlateSource prefers subject/other tiles with images', () => {
    assert.equal(pickMoodboardPlateSource([]), null);
    assert.equal(pickMoodboardPlateSource([{ id: 'a', role: 'mood', notes: 'no image' }]), null);

    const picked = pickMoodboardPlateSource([
      { id: 'mood', role: 'mood', imageUrl: 'https://example.com/mood.jpg' },
      { id: 'subject', role: 'other', imageUrl: 'https://example.com/subject.jpg', label: 'Plate' },
      { id: 'style', role: 'style', imageFilename: 'style.png' },
    ]);
    assert.equal(picked?.imageUrl, 'https://example.com/subject.jpg');
    assert.equal(picked?.label, 'Plate');
  });

  it('pickMoodboardPlateSource falls back to style then any imaged tile', () => {
    const styleFirst = pickMoodboardPlateSource([
      { id: 'mood', role: 'mood', imageUrl: 'https://example.com/mood.jpg' },
      { id: 'style', role: 'style', imageFilename: 'style.png' },
    ]);
    assert.equal(styleFirst?.filename, 'style.png');

    const any = pickMoodboardPlateSource([
      { id: 'mood', role: 'mood', imageUrl: 'https://example.com/mood.jpg' },
    ]);
    assert.equal(any?.imageUrl, 'https://example.com/mood.jpg');
  });

  it('buildLookCastPlatePrompt includes cast look and try-on framing', () => {
    const prompt = buildLookCastPlatePrompt({
      characterName: 'Ava',
      descriptor: 'short black hair, freckles',
      vibePrompt: 'neon rain alley',
    });
    assert.match(prompt, /Ava/);
    assert.match(prompt, /freckles/);
    assert.match(prompt, /neon rain/);
    assert.match(prompt, /try-on/);
    assert.match(prompt, /seamless backdrop/);
  });

  it('fittingHasSessionPlate requires url or filename', () => {
    assert.equal(fittingHasSessionPlate(undefined), false);
    assert.equal(fittingHasSessionPlate({}), false);
    assert.equal(fittingHasSessionPlate({ referenceImageUrl: ' https://x ' }), true);
    assert.equal(fittingHasSessionPlate({ referenceImageFilename: 'plate.png' }), true);
  });

  it('clearCharacterLookPlate removes Cast plate and Outfit session plate', () => {
    installMemoryWindow();
    const blank = createBlankCharacter('Clear Plate');
    upsertCharacter(blank);
    assignOutfitPlateToCastAndFitting({
      characterId: blank.id,
      imageUrl: 'https://example.com/plate.jpg',
      filename: 'plate.jpg',
    });
    assert.ok(getCharacter(blank.id)?.reference?.originalUrl);
    assert.equal(
      fittingHasSessionPlate(loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE)),
      true
    );

    assert.equal(clearCharacterLookPlate(blank.id), true);
    const next = getCharacter(blank.id);
    assert.equal(next?.reference, undefined);
    assert.equal(next?.ipAdapter, undefined);
    const fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
    assert.equal(fittingHasSessionPlate(fitting), false);
    assert.equal(fitting.suppressAutoPlateSeed, true);
    assert.equal(clearCharacterLookPlate(blank.id), false);
  });

  it('ensureOutfitPlateAfterLook skips an existing session plate unless forceReplace', async () => {
    installMemoryWindow();
    const blank = createBlankCharacter('Ava');
    upsertCharacter(blank);
    assignOutfitPlateToCastAndFitting({
      characterId: blank.id,
      imageUrl: 'https://example.com/old-plate.jpg',
      filename: 'old-plate.jpg',
    });
    assert.equal(
      fittingHasSessionPlate(loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE)),
      true
    );

    let queued = 0;
    const skipped = await ensureOutfitPlateAfterLook({
      characterId: blank.id,
      tiles: [],
      vibePrompt: 'soft light',
      sendComfyUi: async () => {
        queued += 1;
        return 'prompt-skip';
      },
    });
    assert.equal(skipped, 'skipped');
    assert.equal(queued, 0);

    const replaced = await ensureOutfitPlateAfterLook({
      characterId: blank.id,
      tiles: [{ id: 't1', role: 'other', imageUrl: 'https://example.com/new-subject.jpg' }],
      vibePrompt: 'soft light',
      forceReplace: true,
      sendComfyUi: async () => {
        queued += 1;
        return 'prompt-replace';
      },
    });
    assert.equal(replaced, 'ready');
    assert.equal(queued, 0);
    const fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
    assert.equal(fitting.referenceImageUrl, 'https://example.com/new-subject.jpg');
  });

  it('ensureOutfitPlateAfterLook forceReplace queues a Cast plate when Look has no tile image', async () => {
    installMemoryWindow();
    const blank = createBlankCharacter('Nova');
    upsertCharacter(blank);
    saveToolSettings('fitting', {
      ...DEFAULT_FITTING_TOOL_CACHE,
      referenceImageUrl: 'https://example.com/stale.jpg',
      referenceImageFilename: 'stale.jpg',
    });

    let queuedPrompt = '';
    const result = await ensureOutfitPlateAfterLook({
      characterId: blank.id,
      tiles: [{ id: 'mood', role: 'mood', notes: 'no image' }],
      vibePrompt: 'golden hour commute',
      forceReplace: true,
      sendComfyUi: async prompt => {
        queuedPrompt = prompt;
        return 'prompt-queued';
      },
    });
    assert.equal(result, 'queued');
    assert.match(queuedPrompt, /Nova/);
    assert.match(queuedPrompt, /golden hour/);
    const fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
    assert.equal(fitting.pendingOutfitPlatePromptId, 'prompt-queued');
    assert.equal(fitting.referenceImageUrl, undefined);
  });
});
