import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import {
  assignOutfitPlateToCastAndFitting,
  buildLookCastPlateNegative,
  buildLookCastPlatePrompt,
  clearCharacterBodyPlate,
  clearCharacterLookPlate,
  ensureOutfitPlateAfterLook,
  fittingHasSessionPlate,
  inferPlateEthnicityKey,
  pickMoodboardPlateSource,
  reinforceAppearanceForPlate,
  resolveCharacterAppearanceForPlate,
  stripDemographicCuesFromStyle,
  styleNotesForLookPlate,
} from './look-outfit-plate';
import { createBlankCharacter, getCharacter, upsertCharacter, activeLook } from './character-os';
import {
  DEFAULT_FITTING_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSettingsCache,
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

  it('buildLookCastPlatePrompt locks Cast subject and treats vibe as style-only', () => {
    const prompt = buildLookCastPlatePrompt({
      characterName: 'Ava',
      descriptor: 'skinny East Asian woman, long black hair',
      vibePrompt: 'a large Black woman in neon rain alley',
    });
    assert.match(prompt, /Ava/);
    assert.match(prompt, /skinny East Asian woman/);
    assert.match(prompt, /SUBJECT \(mandatory/);
    assert.match(prompt, /Color photograph/);
    assert.match(prompt, /DSLR|natural skin/i);
    assert.match(prompt, /not a 3D model|not clay/i);
    assert.match(prompt, /STYLE ONLY/);
    assert.match(prompt, /neon rain/);
    assert.match(prompt, /full-body|head-to-toe/);
    assert.match(prompt, /underwear|base layer/);
    // Subject block must keep Cast appearance; vibe people must not become the subject line.
    const subjectLine = prompt.split('\n').find(line => line.startsWith('SUBJECT'));
    assert.ok(subjectLine?.includes('skinny East Asian'));
    assert.ok(!subjectLine?.toLowerCase().includes('black woman'));
    // Demographic cues stripped from style.
    const styleLine = prompt.split('\n').find(line => line.startsWith('STYLE ONLY'));
    assert.ok(styleLine);
    assert.ok(!styleLine!.toLowerCase().includes('black woman'));
  });

  it('reinforceAppearanceForPlate and negatives lock white vs black skin', () => {
    const reinforced = reinforceAppearanceForPlate('White woman, slender, woman, White, 30s');
    assert.match(reinforced, /fair to light skin/i);
    assert.match(reinforced, /White Caucasian/i);
    const negative = buildLookCastPlateNegative(reinforced);
    assert.match(negative, /dark brown skin|deep Black skin/i);
    assert.equal(inferPlateEthnicityKey('woman, White, slender'), 'white');
    assert.equal(inferPlateEthnicityKey('skinny East Asian woman'), 'east-asian');
  });

  it('stripDemographicCuesFromStyle removes people and race from vibe text', () => {
    const cleaned = stripDemographicCuesFromStyle(
      'a slim Black woman walking under neon rain alley lighting'
    );
    assert.match(cleaned, /neon rain/i);
    assert.doesNotMatch(cleaned, /black woman/i);
  });

  it('resolveCharacterAppearanceForPlate prefers active look descriptor over shared', () => {
    installMemoryWindow();
    const blank = createBlankCharacter('Mei');
    upsertCharacter(blank);
    const stored = getCharacter(blank.id)!;
    const look = activeLook(stored);
    upsertCharacter({
      ...stored,
      descriptor: 'fallback root descriptor',
      looks: [
        {
          ...look,
          descriptor: 'skinny East Asian woman, sharp jaw',
          hints: 'short bob',
        },
      ],
      activeLookId: look.id,
    });
    saveSettingsCache({
      ...loadSettingsCache(),
      shared: {
        ...loadSettingsCache().shared,
        activeCharacterDescriptor: 'should not win over look',
      },
    });
    const resolved = resolveCharacterAppearanceForPlate(getCharacter(blank.id));
    assert.match(resolved.appearance, /skinny East Asian/);
    assert.match(resolved.appearance, /short bob/);
    assert.ok(!resolved.appearance.includes('should not win'));
  });

  it('styleNotesForLookPlate prefers look-pack lighting/palette over raw vibe people', () => {
    const notes = styleNotesForLookPlate({
      lookPack: {
        version: 1,
        source: 'moodboard',
        lightingNotes: 'soft window light',
        paletteNotes: 'warm amber',
        savedAt: Date.now(),
        vibePrompt: 'a large Black woman walking downtown',
      },
      vibePrompt: 'a large Black woman walking downtown',
    });
    assert.match(notes, /soft window light/);
    assert.match(notes, /warm amber/);
    assert.ok(!notes.toLowerCase().includes('black woman'));
  });

  it('fittingHasSessionPlate requires url or filename', () => {
    assert.equal(fittingHasSessionPlate(undefined), false);
    assert.equal(fittingHasSessionPlate({}), false);
    assert.equal(fittingHasSessionPlate({ referenceImageUrl: ' https://x ' }), true);
    assert.equal(fittingHasSessionPlate({ referenceImageFilename: 'plate.png' }), true);
  });

  it('clearCharacterBodyPlate removes body plate but keeps Cast face lock', () => {
    installMemoryWindow();
    const blank = createBlankCharacter('Clear Plate');
    upsertCharacter(blank);
    const stored = getCharacter(blank.id)!;
    const look = activeLook(stored);
    upsertCharacter({
      ...stored,
      ipAdapter: { imageFilename: 'cast-face.png', imageUrl: 'https://example.com/face.png' },
      looks: [
        {
          ...look,
          ipAdapter: { imageFilename: 'cast-face.png', imageUrl: 'https://example.com/face.png' },
        },
      ],
      activeLookId: look.id,
    });
    assignOutfitPlateToCastAndFitting({
      characterId: blank.id,
      imageUrl: 'https://example.com/plate.jpg',
      filename: 'plate.jpg',
    });
    assert.ok(getCharacter(blank.id)?.reference?.originalUrl);
    assert.equal(getCharacter(blank.id)?.ipAdapter?.imageFilename, 'cast-face.png');
    assert.equal(
      fittingHasSessionPlate(loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE)),
      true
    );

    assert.equal(clearCharacterBodyPlate(blank.id), true);
    const next = getCharacter(blank.id);
    assert.equal(next?.reference, undefined);
    assert.equal(next?.ipAdapter?.imageFilename, 'cast-face.png');
    const fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
    assert.equal(fittingHasSessionPlate(fitting), false);
    assert.equal(fitting.suppressAutoPlateSeed, true);
  });

  it('clearCharacterLookPlate removes body plate and face so Cast home preview clears', () => {
    installMemoryWindow();
    const blank = createBlankCharacter('Clear All');
    upsertCharacter(blank);
    const stored = getCharacter(blank.id)!;
    const look = activeLook(stored);
    upsertCharacter({
      ...stored,
      ipAdapter: { imageFilename: 'cast-face.png', imageUrl: 'https://example.com/face.png' },
      looks: [
        {
          ...look,
          ipAdapter: { imageFilename: 'cast-face.png', imageUrl: 'https://example.com/face.png' },
          reference: {
            originalUrl: 'https://example.com/plate.jpg',
            originalFilename: 'plate.jpg',
            isolated: false,
            isolateSubject: true,
          },
        },
      ],
      activeLookId: look.id,
      reference: {
        originalUrl: 'https://example.com/plate.jpg',
        originalFilename: 'plate.jpg',
        isolated: false,
        isolateSubject: true,
      },
    });

    assert.equal(clearCharacterLookPlate(blank.id), true);
    const next = getCharacter(blank.id);
    assert.equal(next?.reference, undefined);
    assert.equal(next?.ipAdapter, undefined);
    assert.equal(activeLook(next!).ipAdapter, undefined);
  });

  it('ensureOutfitPlateAfterLook skips an existing session plate unless forceReplace', async () => {
    installMemoryWindow();
    const blank = createBlankCharacter('Ava');
    upsertCharacter(blank);
    const stored = getCharacter(blank.id)!;
    const look = activeLook(stored);
    upsertCharacter({
      ...stored,
      ipAdapter: { imageFilename: 'ava-face.png' },
      looks: [{ ...look, ipAdapter: { imageFilename: 'ava-face.png' } }],
      activeLookId: look.id,
    });
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
    // Extract queues a full-body plate when Cast has a face lock.
    assert.equal(replaced, 'queued');
    assert.equal(queued, 1);
    const fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
    assert.equal(fitting.pendingOutfitPlatePromptId, 'prompt-replace');
    assert.equal(fitting.referenceImageUrl, undefined);
  });

  it('ensureOutfitPlateAfterLook handoff can stamp a subject tile without forceReplace', async () => {
    installMemoryWindow();
    const blank = createBlankCharacter('Kai');
    upsertCharacter(blank);
    clearCharacterLookPlate(blank.id);
    saveToolSettings('fitting', {
      ...DEFAULT_FITTING_TOOL_CACHE,
      suppressAutoPlateSeed: true,
    });

    let queued = 0;
    const stamped = await ensureOutfitPlateAfterLook({
      characterId: blank.id,
      tiles: [{ id: 't1', role: 'other', imageUrl: 'https://example.com/capture-plate.jpg' }],
      vibePrompt: 'soft light',
      sendComfyUi: async () => {
        queued += 1;
        return 'should-not-queue';
      },
    });
    assert.equal(stamped, 'ready');
    assert.equal(queued, 0);
    const fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
    assert.equal(fitting.referenceImageUrl, 'https://example.com/capture-plate.jpg');
  });

  it('ensureOutfitPlateAfterLook forceReplace queues plate without Cast face', async () => {
    installMemoryWindow();
    const blank = createBlankCharacter('NoFace');
    upsertCharacter({
      ...blank,
      descriptor: 'White woman, slender',
      hints: 'woman, White, slender',
    });
    let queuedPrompt = '';
    let queuedOptions: { queueParamsBase?: { ipAdapterImageFilename?: string } } | undefined;
    const result = await ensureOutfitPlateAfterLook({
      characterId: blank.id,
      tiles: [],
      vibePrompt: 'a large Black woman',
      forceReplace: true,
      sendComfyUi: async (prompt, _s, _h, options) => {
        queuedPrompt = prompt;
        queuedOptions = options;
        return 'prompt-noface';
      },
    });
    assert.equal(result, 'queued');
    assert.match(queuedPrompt, /White/);
    assert.ok(!queuedPrompt.toLowerCase().includes('black woman'));
    assert.equal(queuedOptions?.queueParamsBase?.ipAdapterImageFilename, undefined);
  });

  it('ensureOutfitPlateAfterLook forceReplace pins Cast face IP and ignores vibe people', async () => {
    installMemoryWindow();
    const blank = createBlankCharacter('Nova');
    upsertCharacter(blank);
    const stored = getCharacter(blank.id)!;
    const look = activeLook(stored);
    upsertCharacter({
      ...stored,
      looks: [
        {
          ...look,
          descriptor: 'White woman, slender, fair skin',
          hints: 'woman, White, slender',
          ipAdapter: { imageFilename: 'nova-face.png', imageUrl: 'https://example.com/nova.png' },
        },
      ],
      activeLookId: look.id,
      descriptor: 'White woman, slender, fair skin',
      hints: 'woman, White, slender',
      ipAdapter: { imageFilename: 'nova-face.png', imageUrl: 'https://example.com/nova.png' },
    });
    // Stale shared face from a different character — Fresh sync + queueParamsBase must win.
    saveSettingsCache({
      ...loadSettingsCache(),
      shared: {
        ...loadSettingsCache().shared,
        activeCharacterId: 'other-character',
        ipAdapterImageFilename: 'stale-black-face.png',
        ipAdapterStrength: 0.72,
      },
    });
    saveToolSettings('fitting', {
      ...DEFAULT_FITTING_TOOL_CACHE,
      referenceImageUrl: 'https://example.com/stale.jpg',
      referenceImageFilename: 'stale.jpg',
    });

    let queuedPrompt = '';
    let queuedOptions:
      | {
          identityLock?: boolean;
          explicitNegative?: string;
          queueParamsBase?: { ipAdapterImageFilename?: string };
        }
      | undefined;
    const result = await ensureOutfitPlateAfterLook({
      characterId: blank.id,
      tiles: [{ id: 'mood', role: 'mood', notes: 'no image' }],
      vibePrompt: 'a large Black woman at golden hour commute',
      lookPack: {
        version: 1,
        source: 'moodboard',
        lightingNotes: 'golden hour',
        moodNotes: 'commute calm',
        vibePrompt: 'a large Black woman at golden hour commute',
        savedAt: Date.now(),
      },
      forceReplace: true,
      sendComfyUi: async (prompt, _sport, _historyId, options) => {
        queuedPrompt = prompt;
        queuedOptions = options;
        return 'prompt-queued';
      },
    });
    assert.equal(result, 'queued');
    assert.match(queuedPrompt, /Nova/);
    assert.match(queuedPrompt, /White/);
    assert.match(queuedPrompt, /SUBJECT \(mandatory/);
    assert.ok(!queuedPrompt.includes('STYLE ONLY'));
    assert.ok(!queuedPrompt.toLowerCase().includes('black woman'));
    assert.match(queuedPrompt, /full-body|head-to-toe/);
    assert.match(queuedPrompt, /underwear|base layer/);
    assert.match(queuedPrompt, /Color photograph|DSLR/i);
    assert.match(queuedPrompt, /not a 3D model|not clay/i);    assert.equal(queuedOptions?.identityLock, false);
    assert.equal(queuedOptions?.queueParamsBase?.ipAdapterImageFilename, 'nova-face.png');
    assert.match(queuedOptions?.explicitNegative ?? '', /dark brown skin|deep Black skin/i);
    assert.equal(getCharacter(blank.id)?.ipAdapter?.imageFilename, 'nova-face.png');
    assert.equal(getCharacter(blank.id)?.reference, undefined);
    const fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
    assert.equal(fitting.pendingOutfitPlatePromptId, 'prompt-queued');
    assert.equal(fitting.referenceImageUrl, undefined);
  });
});
