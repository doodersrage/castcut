import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDayDressPlatePrompt,
  DAY_DRESS_PLATE_CACHE_LIMIT,
  dayDressPlateApplies,
  dayDressPlateKey,
  dayDressPlateStatus,
  findDayDressPlate,
  forgetDayDressPlate,
  rememberDayDressPlate,
} from './day-dress-plate';
import { buildDaySlotPrompt } from './day-planner';
import { poseProfileForModel } from './pose/pose-model-profile';

const EDIT = 'qwen-image-edit-2511-lightning-8';

describe('Day dress plate', () => {
  const picked = {
    model: EDIT,
    dayMood: 'vacation',
    plateSource: 'cast' as const,
    clothingPicked: true,
    footwearPicked: true,
  };

  it('applies to clothed stills with clothing or shoes picked, on the engines it was measured on', () => {
    assert.equal(dayDressPlateApplies(picked), true);
    assert.equal(dayDressPlateApplies({ ...picked, footwearPicked: false }), true);
    assert.equal(dayDressPlateApplies({ ...picked, clothingPicked: false }), true);
    // Face-crop engines use the plate as the clothing reference; Edit 2511 as the starting image.
    for (const model of ['qwen-rapid-aio-edit', 'qwen-image-2.1-edit-pruna-8']) {
      assert.equal(dayDressPlateApplies({ ...picked, model }), true, model);
      assert.equal(poseProfileForModel(model).dressPlate, 'clothing');
    }
    assert.equal(poseProfileForModel(EDIT).dressPlate, 'plate');
    for (const mood of ['everyday', 'suggestive', 'date-night', 'photoshoot']) {
      assert.equal(dayDressPlateApplies({ ...picked, dayMood: mood }), true, mood);
    }
  });

  it('is skipped when nothing was picked, on the adult moods, Sport, a Keep and other engines', () => {
    assert.equal(
      dayDressPlateApplies({ ...picked, clothingPicked: false, footwearPicked: false }),
      false
    );
    for (const mood of ['intimate', 'raunchy', 'sport']) {
      assert.equal(dayDressPlateApplies({ ...picked, dayMood: mood }), false, mood);
    }
    // A nude beat, a replaced outfit, an Outfit Keep (already dressed), no plate at all.
    assert.equal(dayDressPlateApplies({ ...picked, omitGarment: true }), false);
    assert.equal(dayDressPlateApplies({ ...picked, replaceOutfit: true }), false);
    assert.equal(dayDressPlateApplies({ ...picked, plateSource: 'keeper' }), false);
    assert.equal(dayDressPlateApplies({ ...picked, plateSource: null }), false);
    // Engines without a measured dress-plate mode keep dressing her per still.
    for (const model of ['flux-2-klein-9b-distilled', 'z-image-turbo']) {
      assert.equal(dayDressPlateApplies({ ...picked, model }), false, model);
    }
  });

  it('keys a plate by plate, clothing and shoes (not the engine), and caches a few', () => {
    const key = dayDressPlateKey({ model: EDIT, plate: 'plate.png', clothing: 'dress.png', footwear: 'boots#' });
    assert.equal(
      key,
      dayDressPlateKey({ model: 'qwen-image-edit-2511', plate: ' plate.png ', clothing: 'dress.png', footwear: 'boots#' })
    );
    assert.notEqual(key, dayDressPlateKey({ model: EDIT, plate: 'plate.png', clothing: 'dress.png', footwear: 'heels#' }));
    let cache = rememberDayDressPlate([], { key, filename: 'a.png', at: 1 });
    cache = rememberDayDressPlate(cache, { key, filename: 'b.png', at: 2 });
    assert.deepEqual(cache.map(entry => entry.filename), ['b.png']);
    assert.equal(findDayDressPlate(cache, key)?.filename, 'b.png');
    assert.equal(findDayDressPlate(cache, 'other'), null);
    for (let index = 0; index < DAY_DRESS_PLATE_CACHE_LIMIT + 3; index += 1) {
      cache = rememberDayDressPlate(cache, { key: `k${index}`, filename: `${index}.png`, at: index });
    }
    assert.equal(cache.length, DAY_DRESS_PLATE_CACHE_LIMIT);
    assert.equal(forgetDayDressPlate(cache, cache[0]!.key).length, DAY_DRESS_PLATE_CACHE_LIMIT - 1);
  });

  it('asks for a full-body try-on with the shoes in frame and says what is happening', () => {
    const prompt = buildDayDressPlatePrompt({
      outfitLabel: 'black lace mini dress',
      hasGarmentReference: true,
      footwearLine: 'FOOTWEAR (mandatory): on her feet she wears white sneakers — exactly these, on both feet.',
      footwearImage: 'combined',
    });
    assert.match(prompt, /Image 2 is the clothing-only packshot with the shoes underneath it/);
    assert.match(prompt, /head to feet in frame, both feet and shoes visible/);
    assert.doesNotMatch(prompt, /three-quarter/);
    assert.match(prompt, /white seamless/);
    assert.equal(
      dayDressPlateStatus({ name: 'Robin', clothing: true, footwear: true }),
      'Dressing Robin first — one plate with the outfit and shoes (about a minute), then the stills start from it.'
    );
    assert.match(dayDressPlateStatus({ clothing: true, footwear: false }), /Dressing the lead first — one plate with the outfit \(/);
  });

  it('a still from a dressed plate wears what is on Image 1 and moves the pose map up', () => {
    const prompt = buildDaySlotPrompt({
      slot: {
        id: 'morning',
        label: 'morning',
        location: 'hotel balcony at sunrise',
        sceneHints: 'WAVING from the hotel balcony rail in a sundress — one arm raised high overhead',
      },
      hasPlate: true,
      plateSource: 'keeper',
      garmentReinforce: false,
      garmentDescription: 'A black strapless lace mini dress.',
      poseGuide: true,
      poseGuideStyle: 'openpose',
      model: EDIT,
      dayMood: 'vacation',
      intimateMix: 'solo',
      leadNoun: 'woman',
    } as Parameters<typeof buildDaySlotPrompt>[0]);
    assert.match(prompt, /OUTFIT \(mandatory\): she wears a black strapless lace mini dress — exactly the outfit and shoes she has on in Image 1, unchanged\./);
    assert.match(prompt, /She wears the outfit from the first image\./);
    assert.match(prompt, /second image \(pose map\)/);
    assert.doesNotMatch(prompt, /underwear in Image 1|sundress/);
  });
});

describe('Day plate upload names', () => {
  it('each plate gets its own filename stamp, stable for the same plate', async () => {
    const { dayPlateUploadStamp } = await import('./day-vacation-face-crop');
    const cast = dayPlateUploadStamp('char-1\0cast-plate.png');
    assert.equal(cast, dayPlateUploadStamp('char-1\0cast-plate.png'));
    assert.notEqual(cast, dayPlateUploadStamp('char-1\0day-dress-plate-1.png'));
    assert.notEqual(cast, dayPlateUploadStamp('char-2\0cast-plate.png'));
    assert.match(cast, /^day-[a-z0-9]+$/);
  });
});

