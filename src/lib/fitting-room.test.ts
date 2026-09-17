import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFittingCompareLightboxState,
  buildFittingGarmentPackshotExtractPrompt,
  buildFittingKitPreviewPrompt,
  buildFittingOutfitPrompt,
  buildFittingSwipeDeck,
  fittingSwipeIndex,
  fittingSwipeNeighbor,
  isCollapsedFittingGarmentDescription,
  isPlausibleFittingGarmentDescription,
  resolveFittingDeckWardrobeId,
  resolveFittingKitPreviewPlate,
  resolveFittingPlateFromCharacter,
  roleplayLookPlateFieldsFromCharacter,
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
  });
});
