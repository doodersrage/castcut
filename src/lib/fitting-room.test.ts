import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFittingBackViewPrompt,
  buildFittingCompareLightboxState,
  buildFittingFeetPassPrompt,
  buildFittingGarmentPackshotExtractPrompt,
  buildFittingKitPreviewPrompt,
  buildFittingOutfitPrompt,
  buildFittingSwipeDeck,
  dismissFittingCompareTryOn,
  fittingFeetPassPlan,
  fittingNeedsFeetPass,
  fittingNextChainStep,
  fittingStepAfterShoeCheck,
  fittingQueueBlockReason,
  fittingSessionStatusLine,
  fittingSwipeIndex,
  fittingSwipeNeighbor,
  isCollapsedFittingGarmentDescription,
  isPlausibleFittingGarmentDescription,
  replaceFittingCompareTryOnImage,
  resolveFittingDeckWardrobeId,
  resolveFittingKitPreviewPlate,
  resolveFittingOutfitPhase,
  resolveFittingPlateFromCharacter,
  roleplayLookPlateFieldsFromCharacter,
  setFittingCompareTryOnBackImage,
  shouldFollowFittingPending,
  withRoleplayLookPlateFromCast,
} from './fitting-room';
import type { CharacterRecord } from './character-os';
import type { RoleplayToolCache } from './settings-cache';

describe('fitting-room swipe deck', () => {
  const options = [
    { value: '', label: 'Pick a kit…' },
    { value: 'kit-a', label: 'Linen set', group: 'Outfit' },
    { value: 'kit-b', label: 'Rain coat', group: 'Outerwear' },
    { value: 'kit-c', label: 'Evening gown', group: 'Outfit' },
  ];

  it('buildFittingSwipeDeck drops empty values and sorts outfits before other groups', () => {
    const deck = buildFittingSwipeDeck(options, 8);
    assert.equal(deck.length, 3);
    assert.equal(deck[0]?.id, 'kit-c');
    assert.equal(deck[1]?.id, 'kit-a');
    assert.equal(deck[2]?.id, 'kit-b');
  });

  it('buildFittingSwipeDeck returns all kits when no limit is passed', () => {
    const many = [
      { value: '', label: 'Pick a kit…' },
      ...Array.from({ length: 40 }, (_, index) => ({
        value: `kit-${index}`,
        label: `Kit ${index}`,
        group: index % 2 === 0 ? 'Outfit' : 'Other',
      })),
    ];
    const deck = buildFittingSwipeDeck(many);
    assert.equal(deck.length, 40);
  });

  it('fittingSwipeNeighbor wraps around the deck', () => {
    const deck = buildFittingSwipeDeck(options);
    const next = fittingSwipeNeighbor(deck, 'kit-a', 1);
    const prev = fittingSwipeNeighbor(deck, 'kit-a', -1);
    assert.ok(next);
    assert.ok(prev);
    assert.notEqual(next!.id, 'kit-a');
    assert.equal(fittingSwipeIndex(deck, next!.id) >= 0, true);
  });

  it('fittingSwipeIndex returns -1 when id is missing from deck', () => {
    const deck = buildFittingSwipeDeck(options);
    assert.equal(fittingSwipeIndex(deck, 'missing'), -1);
    assert.equal(fittingSwipeIndex(deck, ''), -1);
  });

  it('resolveFittingDeckWardrobeId falls back to first deck kit', () => {
    const deck = buildFittingSwipeDeck(options);
    assert.equal(resolveFittingDeckWardrobeId(deck, 'missing'), 'kit-c');
    assert.equal(resolveFittingDeckWardrobeId(deck, 'kit-b'), 'kit-b');
  });

  it('fittingSwipeNeighbor uses deck fallback when lock is outside deck', () => {
    const deck = buildFittingSwipeDeck(options);
    const next = fittingSwipeNeighbor(deck, 'missing-outside', 1);
    assert.ok(next);
    assert.equal(next!.id, deck[1]?.id);
  });
});

describe('fitting outfit prompts', () => {
  it('buildFittingKitPreviewPrompt omits character flavor and forbids props', () => {
    const prompt = buildFittingKitPreviewPrompt({ outfitLabel: 'Silver two-piece swimsuit' });
    assert.match(prompt, /Silver two-piece swimsuit/);
    assert.match(prompt, /Replace all clothing/i);
    assert.match(prompt, /Remove every garment, weapon/i);
    assert.match(prompt, /white studio/i);
    assert.match(prompt, /SOLO SUBJECT/i);
    assert.match(prompt, /One person only/i);
    assert.doesNotMatch(prompt, /look notes/i);
    assert.doesNotMatch(prompt, /Image 2/i);
  });

  it('buildFittingKitPreviewPrompt references Image 2 when a garment packshot is present', () => {
    const prompt = buildFittingKitPreviewPrompt({
      outfitLabel: 'Silver two-piece swimsuit',
      hasGarmentReference: true,
    });
    assert.match(prompt, /Image 2/i);
    assert.match(prompt, /garment packshot/i);
    assert.match(prompt, /Silver two-piece swimsuit/);
    assert.doesNotMatch(prompt, /Replace all clothing, armor/i);
  });

  it('buildFittingOutfitPrompt references Image 2 when a garment packshot is present', () => {
    const prompt = buildFittingOutfitPrompt({
      outfitLabel: 'Cobalt monk robes',
      hasGarmentReference: true,
      isolated: true,
    });
    assert.match(prompt, /Image 2/i);
    assert.match(prompt, /ghost-mannequin \/ flat-lay clothing packshot/i);
    assert.match(prompt, /Cobalt monk robes/);
    assert.match(prompt, /white seamless/i);
  });

  it('buildFittingOutfitPrompt includes a vision garment description', () => {
    const prompt = buildFittingOutfitPrompt({
      outfitLabel: 'navy blazer look',
      hasGarmentReference: true,
      garmentDescription: 'navy double-breasted blazer over ivory trousers',
    });
    assert.match(prompt, /Visible garments: navy double-breasted blazer/i);
    assert.match(prompt, /ghost-mannequin \/ flat-lay clothing packshot/i);
    assert.match(prompt, /Image 2/i);
  });

  it('buildFittingOutfitPrompt ignores Cast look notes so bible clothing cannot stick', () => {
    const prompt = buildFittingOutfitPrompt({
      outfitLabel: 'silver evening gown',
      characterName: 'Mira',
      characterDescriptor: 'wearing a navy blazer and jeans, brown hair',
      notes: 'slightly oversized sleeves',
    });
    assert.doesNotMatch(prompt, /^look notes:/im);
    assert.doesNotMatch(prompt, /navy blazer and jeans/i);
    assert.match(prompt, /ignore Cast look notes/i);
    assert.match(prompt, /discard every garment/i);
    assert.match(prompt, /styling tweaks for the new outfit only/i);
    assert.match(prompt, /slightly oversized sleeves/);
    assert.match(prompt, /silver evening gown/);
  });

  it('buildFittingGarmentPackshotExtractPrompt asks for clothing-only ghost mannequin', () => {
    const prompt = buildFittingGarmentPackshotExtractPrompt({
      garmentDescription: 'red leather jacket over black jeans',
    });
    assert.match(prompt, /photoreal ecommerce clothing product photograph/i);
    assert.match(prompt, /red leather jacket over black jeans/);
    assert.match(prompt, /Ghost mannequin/i);
    assert.match(prompt, /No person/i);
    assert.match(prompt, /pure white studio/i);
    assert.match(prompt, /not a pattern/i);
    assert.doesNotMatch(prompt, /keep: face/i);
  });

  it('buildFittingGarmentPackshotExtractPrompt works without a garment description', () => {
    const prompt = buildFittingGarmentPackshotExtractPrompt();
    assert.match(prompt, /Keep the exact garments, colors, fabrics/i);
    assert.match(prompt, /flat lay/i);
  });

  it('isPlausibleFittingGarmentDescription accepts real garments and rejects collapses', () => {
    assert.equal(
      isPlausibleFittingGarmentDescription('navy double-breasted blazer over ivory trousers'),
      true
    );
    assert.equal(
      isPlausibleFittingGarmentDescription('ecommerce clothing product photo on white'),
      true
    );
    assert.equal(isPlausibleFittingGarmentDescription('repeating orange pattern tiles'), false);
    assert.equal(isPlausibleFittingGarmentDescription('abstract geometric glyph wall'), false);
    assert.equal(isPlausibleFittingGarmentDescription(''), false);
  });

  it('isCollapsedFittingGarmentDescription only hard-rejects pattern dumps', () => {
    assert.equal(isCollapsedFittingGarmentDescription(null), false);
    assert.equal(isCollapsedFittingGarmentDescription(''), false);
    assert.equal(
      isCollapsedFittingGarmentDescription('soft studio garment on seamless backdrop'),
      false
    );
    assert.equal(isCollapsedFittingGarmentDescription('repeating pattern wallpaper tiles'), true);
    assert.equal(isCollapsedFittingGarmentDescription('empty frame, no clothing'), true);
  });
});

describe('fitting kit preview plate sidecar', () => {
  it('resolveFittingKitPreviewPlate uses cached preview sidecar when source matches', () => {
    const plate = resolveFittingKitPreviewPlate({
      previewPlateFilename: 'white.png',
      previewPlateUrl: 'https://example.com/white.png',
      previewPlateSourceKey: 'scene.png|orig.png',
      sourceKey: 'scene.png|orig.png',
    });
    assert.deepEqual(plate, { filename: 'white.png', imageUrl: 'https://example.com/white.png' });
  });

  it('resolveFittingKitPreviewPlate ignores stale sidecar keys', () => {
    assert.equal(
      resolveFittingKitPreviewPlate({
        previewPlateFilename: 'white.png',
        previewPlateSourceKey: 'old-key',
        sourceKey: 'new-key',
      }),
      null
    );
  });
});

describe('fitting compare lightbox', () => {
  it('buildFittingCompareLightboxState opens on the tapped try-on', () => {
    const state = buildFittingCompareLightboxState(
      [
        {
          promptId: 'a',
          wardrobeId: 'kit-a',
          wardrobeLabel: 'Linen',
          imageUrl: 'https://example.com/a.png',
        },
        {
          promptId: 'b',
          wardrobeId: 'kit-b',
          wardrobeLabel: 'Rain',
          imageUrl: 'https://example.com/b.png',
        },
        { promptId: 'c', wardrobeId: 'kit-c' },
      ],
      'b'
    );
    assert.ok(state);
    assert.equal(state!.index, 1);
    assert.equal(state!.images.length, 2);
    assert.equal(state!.title, 'Rain');
    assert.deepEqual(state!.titles, ['Linen', 'Rain']);
  });

  it('buildFittingCompareLightboxState returns null when no images', () => {
    assert.equal(
      buildFittingCompareLightboxState([{ promptId: 'x', wardrobeId: 'kit-x' }], 'x'),
      null
    );
  });

  it('fittingQueueBlockReason mirrors Day-style block copy', () => {
    assert.equal(
      fittingQueueBlockReason({
        hasCharacter: false,
        hasPlate: true,
        hasGarmentSource: true,
      }),
      'Pick a Cast character first.'
    );
    assert.equal(
      fittingQueueBlockReason({
        hasCharacter: true,
        hasPlate: false,
        hasGarmentSource: true,
      }),
      'Add a look plate (upload, Gallery, or Extract look) before Queue try-on.'
    );
    assert.equal(
      fittingQueueBlockReason({
        hasCharacter: true,
        hasPlate: true,
        hasGarmentSource: false,
      }),
      'Pick a wardrobe kit or upload a clothing photo.'
    );
    assert.equal(
      fittingQueueBlockReason({
        hasCharacter: true,
        hasPlate: true,
        hasGarmentSource: true,
        isolateSubject: true,
        isolatePending: true,
      }),
      'Wait for plate isolate on white to finish.'
    );
    assert.equal(
      fittingQueueBlockReason({
        hasCharacter: true,
        hasPlate: true,
        hasGarmentSource: true,
      }),
      null
    );
  });

  it('dismissFittingCompareTryOn removes one card', () => {
    const next = dismissFittingCompareTryOn(
      [
        { promptId: 'a', wardrobeId: 'kit-a' },
        { promptId: 'b', wardrobeId: 'kit-b' },
      ],
      'a'
    );
    assert.equal(next.length, 1);
    assert.equal(next[0]?.promptId, 'b');
  });

  it('resolveFittingOutfitPhase walks Plate → Try-on → Keep → Day', () => {
    assert.equal(resolveFittingOutfitPhase({ hasPlate: false, compareCount: 0 }), 'plate');
    assert.equal(resolveFittingOutfitPhase({ hasPlate: true, compareCount: 0 }), 'tryon');
    assert.equal(resolveFittingOutfitPhase({ hasPlate: true, compareCount: 2 }), 'keep');
    assert.equal(
      resolveFittingOutfitPhase({ hasPlate: true, compareCount: 1, continueDayReady: true }),
      'day'
    );
  });

  it('fittingSessionStatusLine names plate and kit/BYO', () => {
    assert.match(fittingSessionStatusLine({ hasPlate: false }), /No plate/);
    assert.match(
      fittingSessionStatusLine({ hasPlate: true, kitLabel: 'Linen set' }),
      /Plate ready · Linen set/
    );
    assert.match(
      fittingSessionStatusLine({ hasPlate: true, hasByo: true, byoLabel: 'Red coat' }),
      /Red coat/
    );
  });
});

describe('Story look plate from Cast', () => {
  const character = {
    id: 'c1',
    name: 'Lead',
    version: 1,
    updatedAt: 1,
    reference: {
      originalUrl: 'https://example.com/orig.jpg',
      originalFilename: 'orig.jpg',
      isolatedUrl: 'https://example.com/cut.jpg',
      isolatedFilename: 'cut.jpg',
      isolated: true,
      isolateSubject: true,
    },
  } as CharacterRecord;

  it('roleplayLookPlateFieldsFromCharacter maps Cast plate to From photo', () => {
    assert.equal(roleplayLookPlateFieldsFromCharacter(null), null);
    assert.equal(roleplayLookPlateFieldsFromCharacter({ ...character, reference: undefined }), null);
    const fields = roleplayLookPlateFieldsFromCharacter(character);
    assert.equal(fields?.playAs, 'photo');
    assert.equal(fields?.referenceImageUrl, 'https://example.com/cut.jpg');
    assert.equal(fields?.referenceImageFilename, 'cut.jpg');
    assert.equal(fields?.referenceIsolated, true);
    assert.equal(resolveFittingPlateFromCharacter(character)?.imageUrl, 'https://example.com/cut.jpg');
  });

  it('withRoleplayLookPlateFromCast seeds missing refs and keeps existing photos', () => {
    const seeded = withRoleplayLookPlateFromCast({ personaId: 'x' } as RoleplayToolCache, character);
    assert.equal(seeded.playAs, 'photo');
    assert.equal(seeded.referenceImageUrl, 'https://example.com/cut.jpg');

    const kept = withRoleplayLookPlateFromCast(
      {
        personaId: 'x',
        playAs: 'text',
        referenceImageUrl: 'https://example.com/mine.jpg',
      } as RoleplayToolCache,
      character
    );
    assert.equal(kept.referenceImageUrl, 'https://example.com/mine.jpg');
    assert.equal(kept.playAs, 'photo');

    const forced = withRoleplayLookPlateFromCast(
      {
        personaId: 'x',
        playAs: 'text',
        referenceImageUrl: 'https://example.com/mine.jpg',
      } as RoleplayToolCache,
      character,
      { force: true }
    );
    assert.equal(forced.referenceImageUrl, 'https://example.com/cut.jpg');
    assert.equal(forced.playAs, 'photo');
  });
});

describe('Outfit feet pass', () => {
  const EDIT_2511 = 'qwen-image-edit-2511-lightning-4';

  it('runs only for Edit 2511 with a custom pose and real shoes', () => {
    assert.equal(
      fittingNeedsFeetPass({ model: EDIT_2511, hasCustomPose: true, footwear: 'red heels' }),
      true
    );
    assert.equal(
      fittingNeedsFeetPass({ model: EDIT_2511, hasCustomPose: false, footwear: 'red heels' }),
      false
    );
    assert.equal(
      fittingNeedsFeetPass({ model: 'qwen-image-edit-rapid-aio', hasCustomPose: true, footwear: 'red heels' }),
      false
    );
    assert.equal(
      fittingNeedsFeetPass({ model: EDIT_2511, hasCustomPose: true, footwear: 'Barefoot.' }),
      false
    );
    assert.equal(fittingNeedsFeetPass({ model: EDIT_2511, hasCustomPose: true, footwear: '' }), false);
    assert.equal(
      fittingNeedsFeetPass({ model: EDIT_2511, hasCustomPose: true, footwear: ' ', hasShoeImage: true }),
      true
    );
    assert.equal(
      fittingNeedsFeetPass({
        model: EDIT_2511,
        hasCustomPose: true,
        footwear: 'no shoes',
        hasShoeImage: true,
      }),
      false
    );
  });

  it('keeps the whole picture, names the shoes and their heel, and keeps everything else', () => {
    assert.equal(
      buildFittingFeetPassPrompt({
        shoeWords: 'red strappy heels.',
        imagePlacement: 'alone',
        subject: 'she',
      }),
      'Edit Image 1: the same full picture — her whole body head to feet, the same framing, size and position as Image 1 — with only her footwear changed: she now wears the shoes shown in Image 2 — red strappy heels — one on each foot, in place of whatever is on her feet. High heels: her heels lifted on the tall thin heels, each heel post under the heel of her foot. Keep each strap thin and continuous, both shoes the same. No other shoes anywhere in the picture. Change nothing else: the same person, face, outfit, pose, framing, light and background as Image 1, pixel for pixel away from the feet.'
    );
  });

  it('shoes under the clothing, words alone, and a man lead', () => {
    assert.match(
      buildFittingFeetPassPrompt({ shoeWords: '', imagePlacement: 'combined', subject: 'she' }),
      /she now wears the shoes shown at the bottom of Image 2 one on each foot/
    );
    const words = buildFittingFeetPassPrompt({ shoeWords: 'white sneakers', subject: 'he' });
    assert.match(words, /his whole body head to feet/);
    assert.match(words, /he now wears white sneakers one on each foot, in place of whatever is on his feet\. Both shoes the same\./);
    assert.doesNotMatch(words, /Image 2|High heels|strap/);
  });

  it('replaces the try-on card in place with the pass result', () => {
    const current = [
      { promptId: 'b', wardrobeId: 'kit-b', imageUrl: '/b.png', galleryEntryId: 'gb' },
      { promptId: 'a', wardrobeId: 'kit-a', wardrobeLabel: 'A', imageUrl: '/a.png', galleryEntryId: 'ga' },
    ];
    const next = replaceFittingCompareTryOnImage(current, 'a', {
      promptId: 'feet',
      imageUrl: '/feet.png',
      galleryEntryId: 'gf',
    });
    assert.deepEqual(next[1], {
      promptId: 'feet',
      wardrobeId: 'kit-a',
      wardrobeLabel: 'A',
      imageUrl: '/feet.png',
      galleryEntryId: 'gf',
    });
    assert.equal(next[0], current[0]);
    assert.equal(
      replaceFittingCompareTryOnImage(current, 'gone', { promptId: 'x', imageUrl: '/x.png' }),
      current
    );
  });
});

describe('Outfit front and back', () => {
  it('buildFittingBackViewPrompt is the live recipe, his for a man', () => {
    assert.equal(
      buildFittingBackViewPrompt({ subject: 'she' }),
      'Edit Image 1: the same person in exactly the same outfit and shoes, seen from directly behind — a back view, standing, full body head to feet, her hair and the back of the outfit and the shoes visible. Same body, same proportions, same light and same plain background as Image 1. One person.'
    );
    const his = buildFittingBackViewPrompt({ subject: 'he' });
    assert.match(his, /, his hair and the back of the outfit/);
    assert.doesNotMatch(his, /\bher\b/);
    assert.match(buildFittingBackViewPrompt({}), /, her hair/);
  });

  it('fittingNextChainStep: try-on → feet pass → back view → done', () => {
    const backView = { subject: 'she' as const };
    const feetPass = { shoeWords: 'red heels', subject: 'she' as const };
    const base = { promptId: 'p', wardrobeId: 'kit' };
    // A plain try-on with Front and back on, or off.
    assert.equal(fittingNextChainStep({ ...base, backView }), 'back-view');
    assert.equal(fittingNextChainStep(base), null);
    // A posed try-on on Edit 2511: shoes first, whatever the back view says.
    assert.equal(fittingNextChainStep({ ...base, feetPass, backView }), 'feet-pass');
    assert.equal(fittingNextChainStep({ ...base, feetPass }), 'feet-pass');
    // The feet pass landed: then the back view, if it was asked for.
    assert.equal(fittingNextChainStep({ ...base, replacesPromptId: 'a', backView }), 'back-view');
    assert.equal(fittingNextChainStep({ ...base, replacesPromptId: 'a' }), null);
    // The back view ends the chain (it keeps its subject for the status line).
    assert.equal(fittingNextChainStep({ ...base, backOfPromptId: 'a', backView }), null);
  });

  it('fittingStepAfterShoeCheck: the pass only when the check asks, else on to the back view', () => {
    const base = { promptId: 'p', wardrobeId: 'kit', feetPass: { shoeWords: 'red heels', subject: 'she' as const } };
    const backView = { subject: 'she' as const };
    assert.equal(fittingStepAfterShoeCheck({ ...base, backView }, true), 'feet-pass');
    assert.equal(fittingStepAfterShoeCheck({ ...base, backView }, false), 'back-view');
    assert.equal(fittingStepAfterShoeCheck(base, false), null);
  });

  it('fittingFeetPassPlan: every engine with real shoes; the pass runs unchecked too', () => {
    const EDIT_2511 = 'qwen-image-edit-2511-lightning-4';
    const installed = (id: string) => id === 'qwen-image-edit-2511-lightning-8';
    assert.deepEqual(
      fittingFeetPassPlan({ model: EDIT_2511, hasCustomPose: true, footwear: 'red heels' }),
      { model: EDIT_2511, whenUnchecked: true }
    );
    assert.deepEqual(
      fittingFeetPassPlan({ model: EDIT_2511, hasCustomPose: false, footwear: 'red heels' }),
      { model: EDIT_2511, whenUnchecked: true }
    );
    // A Rapid AIO or Qwen-Image 2.1 try-on: the shoes go on with Edit 2511 when it is installed.
    assert.deepEqual(
      fittingFeetPassPlan({
        model: 'qwen-image-edit-rapid-aio',
        hasCustomPose: true,
        footwear: 'red heels',
        installed,
      }),
      { model: 'qwen-image-edit-2511-lightning-8', whenUnchecked: true }
    );
    assert.equal(
      fittingFeetPassPlan({ model: 'qwen-image-2.1', hasCustomPose: false, footwear: 'red heels' }),
      null
    );
    // A shoe picture alone counts; barefoot and auto never do.
    assert.ok(
      fittingFeetPassPlan({ model: EDIT_2511, hasCustomPose: false, footwear: '', hasShoeImage: true })
    );
    assert.equal(
      fittingFeetPassPlan({ model: EDIT_2511, hasCustomPose: true, footwear: 'barefoot', hasShoeImage: true }),
      null
    );
    assert.equal(fittingFeetPassPlan({ model: EDIT_2511, hasCustomPose: true, footwear: '' }), null);
  });

  it('shouldFollowFittingPending never follows a job that already landed', () => {
    const saved = { promptId: 'try', wardrobeId: 'kit', feetPass: { shoeWords: 'pumps', subject: 'she' as const } };
    assert.equal(shouldFollowFittingPending(saved, null, new Set()), true);
    // The late settings echo of a landed try-on: following it again queued a second shoe pass.
    assert.equal(shouldFollowFittingPending(saved, null, new Set(['try'])), false);
    // Already following a job (the pass that try-on started): keep it.
    assert.equal(
      shouldFollowFittingPending(saved, { promptId: 'feet', wardrobeId: 'kit' }, new Set()),
      false
    );
    assert.equal(shouldFollowFittingPending(undefined, null, new Set()), false);
    assert.equal(shouldFollowFittingPending({ promptId: ' ', wardrobeId: 'k' }, null, new Set()), false);
    // The back view that a landed feet pass started is new: followed.
    assert.equal(
      shouldFollowFittingPending(
        { promptId: 'back', wardrobeId: 'kit', backOfPromptId: 'feet' },
        null,
        new Set(['try', 'feet'])
      ),
      true
    );
  });

  it('setFittingCompareTryOnBackImage puts the back beside the front, front untouched', () => {
    const current = [
      { promptId: 'a', wardrobeId: 'k', imageUrl: '/a.png', dressPlateKey: 'key-a' },
      { promptId: 'b', wardrobeId: 'k', imageUrl: '/b.png' },
    ];
    const next = setFittingCompareTryOnBackImage(current, 'a', {
      promptId: 'back',
      imageUrl: '/back.png',
      galleryEntryId: 'gb',
    });
    assert.deepEqual(next[0], {
      promptId: 'a',
      wardrobeId: 'k',
      imageUrl: '/a.png',
      dressPlateKey: 'key-a',
      backImageUrl: '/back.png',
      backPromptId: 'back',
      backGalleryEntryId: 'gb',
    });
    assert.equal(next[1], current[1]);
    // Dismissed meanwhile: nothing comes back.
    assert.equal(
      setFittingCompareTryOnBackImage(current, 'gone', { promptId: 'x', imageUrl: '/x.png' }),
      current
    );
  });

  it('a feet pass replacing the front drops a stale back view', () => {
    const next = replaceFittingCompareTryOnImage(
      [
        {
          promptId: 'a',
          wardrobeId: 'k',
          imageUrl: '/a.png',
          backImageUrl: '/old-back.png',
          backPromptId: 'ob',
        },
      ],
      'a',
      { promptId: 'feet', imageUrl: '/feet.png' }
    );
    assert.equal(next[0]?.backImageUrl, undefined);
    assert.equal(next[0]?.backPromptId, undefined);
    assert.equal(next[0]?.imageUrl, '/feet.png');
  });

  it('the lightbox shows each back right after its front and can open on it', () => {
    const tryOns = [
      {
        promptId: 'a',
        wardrobeId: 'k',
        wardrobeLabel: 'Red dress',
        imageUrl: '/a.png',
        backImageUrl: '/a-back.png',
      },
      { promptId: 'b', wardrobeId: 'k2', imageUrl: '/b.png' },
    ];
    const front = buildFittingCompareLightboxState(tryOns, 'a');
    assert.deepEqual(front?.images, ['/a.png', '/a-back.png', '/b.png']);
    assert.deepEqual(front?.titles, ['Red dress', 'Red dress · back', 'k2']);
    assert.equal(front?.index, 0);
    assert.equal(buildFittingCompareLightboxState(tryOns, 'a', { back: true })?.index, 1);
    assert.equal(buildFittingCompareLightboxState(tryOns, 'b')?.index, 2);
    // No back view: opens on the front.
    assert.equal(buildFittingCompareLightboxState(tryOns, 'b', { back: true })?.index, 2);
  });
});

describe('Outfit on Klein 9B Distilled', () => {
  it('no blind shoe pass after a Klein try-on; a top-alone photo gets bottoms', async () => {
    const { buildFittingOutfitPrompt } = await import('./fitting-room');
    assert.equal(
      fittingFeetPassPlan({
        model: 'flux-2-klein-9b-distilled',
        hasCustomPose: false,
        footwear: 'white sneakers',
        installed: () => true,
      })?.whenUnchecked,
      false
    );
    const prompt = buildFittingOutfitPrompt({
      outfitLabel: 'pink cropped tee',
      hasGarmentReference: true,
      garmentDescription: 'A cropped pink t-shirt',
    });
    assert.match(prompt, /if Image 2 shows only a top, she also wears simple bottoms/);
    assert.doesNotMatch(
      buildFittingOutfitPrompt({ outfitLabel: 'red sundress' }),
      /shows only a top/
    );
  });
});

describe('Outfit default engine: Klein 9B Distilled, else Edit 2511', () => {
  it('switches to the best installed once, waits when unknown, keeps a later own pick', async () => {
    const { fittingDefaultEngineSwitch } = await import('./fitting-room');
    const KLEIN = 'flux-2-klein-9b-distilled';
    const E2511 = 'qwen-image-edit-2511-lightning-8';
    const all = () => true;
    const no2511Klein = (id: string) => id === E2511;
    assert.equal(fittingDefaultEngineSwitch({ currentModel: E2511, installed: all }), KLEIN);
    assert.equal(fittingDefaultEngineSwitch({ currentModel: 'qwen-image-2.1', installed: no2511Klein }), E2511);
    assert.equal(fittingDefaultEngineSwitch({ currentModel: 'x', installed: null }), null);
    assert.equal(fittingDefaultEngineSwitch({ currentModel: 'x', installed: () => false }), null);
    // Switched to Klein before, then the player picked 2511: stays.
    assert.equal(fittingDefaultEngineSwitch({ currentModel: E2511, installed: all, lastApplied: KLEIN }), null);
    // Was on the 2511 fallback, Klein installed since: moves up once.
    assert.equal(fittingDefaultEngineSwitch({ currentModel: E2511, installed: all, lastApplied: E2511 }), KLEIN);
  });
});

describe('back view shoe sentence', () => {
  it('heels keep their shape; sneakers are flat; other shoes are named only', async () => {
    const { buildFittingBackViewPrompt } = await import('./fitting-room');
    assert.match(buildFittingBackViewPrompt({ shoeWords: 'red stiletto pumps' }), /thin stiletto stays a thin stiletto/);
    const sneakers = buildFittingBackViewPrompt({ shoeWords: 'white leather sneakers' });
    assert.match(sneakers, /flat soles, no heel/);
    assert.doesNotMatch(sneakers, /heel height|stiletto/);
    assert.doesNotMatch(buildFittingBackViewPrompt({ shoeWords: 'brown ankle boots' }), /heel/);
    assert.doesNotMatch(buildFittingBackViewPrompt({}), /On her feet/);
  });
});
