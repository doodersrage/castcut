import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_LYING_WIDE_CANVAS,
  DAY_OUTFIT_LINE_RE,
  dayStillClothingReinforce,
  dayStillDressedPlateUse,
  dayStillFaceCropCanvas,
  dayStillFootwearApplies,
  dayStillIdentityRoute,
  dayStillLiesDown,
  dayStillWantsDressPlate,
} from './day-still-plan';
import { PLAY_FACE_CROP_CANVAS } from './plate-render-size';

const RAPID = 'qwen-rapid-aio-edit';
const EDIT_2511 = 'qwen-image-edit-2511-lightning-8';

describe('dayStillWantsDressPlate', () => {
  const base = {
    castPlateAvailable: true,
    model: EDIT_2511,
    dayMood: 'everyday',
    intimateEnabled: false,
    plateSource: 'cast' as const,
    customGarmentPicked: true,
    kitPicked: false,
    packshotUrl: null,
    pickedShoes: '',
    omitGarment: false,
    replaceOutfit: false,
    sceneHints: 'walking through the market with a coffee',
  };

  it('dresses the Cast once when clothing is picked', () => {
    assert.equal(dayStillWantsDressPlate(base), true);
  });

  it('needs a Cast plate and something to dress her from', () => {
    assert.equal(dayStillWantsDressPlate({ ...base, castPlateAvailable: false }), false);
    assert.equal(
      dayStillWantsDressPlate({ ...base, customGarmentPicked: false, kitPicked: true }),
      false,
      'a picked kit with no packshot'
    );
    assert.equal(
      dayStillWantsDressPlate({
        ...base,
        customGarmentPicked: false,
        kitPicked: true,
        packshotUrl: '/wardrobe/kit.webp',
      }),
      true
    );
  });

  it('leaves a scene that dresses itself, or is about the feet, to the still', () => {
    assert.equal(
      dayStillWantsDressPlate({
        ...base,
        dayMood: 'vacation',
        sceneHints: 'swimming laps in the hotel pool',
      }),
      false
    );
    assert.equal(
      dayStillWantsDressPlate({
        ...base,
        pickedShoes: 'black stiletto heels',
        sceneHints: 'walking barefoot on the sand, heels in one hand',
      }),
      false
    );
  });

  it('treats an adult mood with Intimate off as Everyday, and skips it with Intimate on', () => {
    assert.equal(dayStillWantsDressPlate({ ...base, dayMood: 'intimate' }), true);
    assert.equal(
      dayStillWantsDressPlate({ ...base, dayMood: 'intimate', intimateEnabled: true }),
      false
    );
  });
});

describe('dayStillIdentityRoute', () => {
  const base = {
    dayMood: 'everyday',
    model: RAPID,
    sceneHints: 'walking through the market with a coffee',
    omitGarment: false,
    hasCharacter: true,
    hasIdentityPlate: true,
    identitySource: 'cast' as const,
    clothingOnlyGarment: false,
  };

  it('a nude still starts from a face crop', () => {
    assert.equal(dayStillIdentityRoute({ ...base, omitGarment: true }), 'nude');
  });

  it('Everyday on Rapid with a packshot over the undressed Cast plate breaks to the face', () => {
    assert.equal(dayStillIdentityRoute({ ...base, clothingOnlyGarment: true }), 'face-break');
    assert.equal(
      dayStillIdentityRoute({ ...base, clothingOnlyGarment: true, identitySource: 'keeper' }),
      'plate',
      'a Keep plate already wears the outfit'
    );
    assert.equal(dayStillIdentityRoute(base), 'plate');
  });

  it('the Lightning identity engines keep the full plate', () => {
    assert.equal(
      dayStillIdentityRoute({ ...base, model: EDIT_2511 }),
      'everyday-full-plate'
    );
  });

  it('with no plate there is nothing to route', () => {
    assert.equal(
      dayStillIdentityRoute({ ...base, clothingOnlyGarment: true, hasIdentityPlate: false }),
      'plate'
    );
  });
});

describe('dayStillDressedPlateUse', () => {
  it('goes where Image 1 leaves room for it', () => {
    const base = { hasDressedPlate: true, omitGarment: false, faceOnlyIdentity: false };
    assert.equal(dayStillDressedPlateUse(base), 'plate');
    assert.equal(dayStillDressedPlateUse({ ...base, faceOnlyIdentity: true }), 'clothing');
    assert.equal(dayStillDressedPlateUse({ ...base, omitGarment: true }), null);
    assert.equal(dayStillDressedPlateUse({ ...base, hasDressedPlate: false }), null);
  });
});

describe('dayStillClothingReinforce', () => {
  const packshot = { imageUrl: '/wardrobe/kit.webp', source: 'packshot' as const };
  const worn = { imageFilename: 'my-dress-photo.png', source: 'custom' as const };
  const base = { omitGarment: false, replaceOutfit: false, partnerFace: false, faceBreak: false };

  it('carries the garment unless the slot is taken or the outfit is dropped', () => {
    assert.equal(dayStillClothingReinforce({ ...base, garment: packshot }), packshot);
    assert.equal(dayStillClothingReinforce({ ...base, garment: packshot, omitGarment: true }), null);
    assert.equal(
      dayStillClothingReinforce({ ...base, garment: packshot, replaceOutfit: true }),
      null
    );
    assert.equal(dayStillClothingReinforce({ ...base, garment: packshot, partnerFace: true }), null);
  });

  it('a face-break still takes a clothing-only picture, never a worn photo', () => {
    assert.equal(dayStillClothingReinforce({ ...base, garment: packshot, faceBreak: true }), packshot);
    assert.equal(dayStillClothingReinforce({ ...base, garment: worn, faceBreak: true }), null);
  });
});

describe('dayStillFootwearApplies', () => {
  it('clothed stills only; not Sport, a beat about the feet, or a swim scene', () => {
    const base = { dayMood: 'everyday', intimateEnabled: false, sceneHints: 'reading on a bench' };
    assert.equal(dayStillFootwearApplies(base), true);
    assert.equal(dayStillFootwearApplies({ ...base, dayMood: 'sport' }), false);
    assert.equal(
      dayStillFootwearApplies({ ...base, dayMood: 'intimate', intimateEnabled: true }),
      false
    );
    assert.equal(dayStillFootwearApplies({ ...base, dayMood: 'intimate' }), true);
    assert.equal(
      dayStillFootwearApplies({ ...base, sceneHints: 'barefoot on the sand, heels in one hand' }),
      false
    );
    assert.equal(
      dayStillFootwearApplies({
        ...base,
        dayMood: 'vacation',
        sceneHints: 'swimming laps in the hotel pool',
      }),
      false
    );
  });
});

describe('dayStillLiesDown', () => {
  it('reads the drawn layout, or the beat on a one-person still', () => {
    assert.equal(dayStillLiesDown({ beat: 'reading in the sun', layout: 'lie_side' }), true);
    assert.equal(dayStillLiesDown({ beat: 'lying on the picnic blanket', layout: 'read' }), true);
    assert.equal(dayStillLiesDown({ beat: 'sitting on a park bench', layout: 'sit' }), false);
    // On a pair the beat's lying can be the partner's.
    assert.equal(
      dayStillLiesDown({ beat: 'she leans in, he lies propped on an elbow', layout: 'sit', figures: 2 }),
      false
    );
  });
});

describe('dayStillFaceCropCanvas', () => {
  const QWEN_21 = 'qwen-image-2.1-edit';
  const lying = { model: QWEN_21, solo: true, lying: true, outfitLine: true };

  it('keeps Qwen-Image 2.1 lying stills portrait (the wide canvas drew twins)', () => {
    // Live 2026-10-03: landscape drew a second copy of her 2 of 3; portrait 6/6 clean.
    assert.deepEqual(dayStillFaceCropCanvas(lying), { ...PLAY_FACE_CROP_CANVAS });
    assert.equal(DAY_LYING_WIDE_CANVAS.width, 1472);
  });

  it('keeps the portrait face-crop canvas otherwise', () => {
    const portrait = { ...PLAY_FACE_CROP_CANVAS };
    // Wide without an outfit line drew her nude 2 of 3.
    assert.deepEqual(dayStillFaceCropCanvas({ ...lying, outfitLine: false }), portrait);
    assert.deepEqual(dayStillFaceCropCanvas({ ...lying, lying: false }), portrait);
    assert.deepEqual(dayStillFaceCropCanvas({ ...lying, solo: false }), portrait);
    // Only Qwen-Image 2.1 was tested.
    assert.deepEqual(dayStillFaceCropCanvas({ ...lying, model: RAPID }), portrait);
    assert.deepEqual(dayStillFaceCropCanvas({ ...lying, model: EDIT_2511 }), portrait);
  });

  it('finds the outfit line in a finished prompt', () => {
    assert.equal(DAY_OUTFIT_LINE_RE.test('SCENE: a park.\nOUTFIT (mandatory): she wears a dress.'), true);
    assert.equal(DAY_OUTFIT_LINE_RE.test('Day photo: She wears the outfit (mandatory).'), false);
  });
});
