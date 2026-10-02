import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dayDressPlateChange,
  dayDressPlateRequestKey,
  dayDressPlateStatus,
  type DayDressPlateKeyInput,
} from './day-dress-plate';
import { findDayDressPlate, rememberDayDressPlate } from './dress-plate-cache';
import { stampedUploadName } from './upload-name';

const MODEL = 'qwen-image-edit-2511-lightning-8';

const photo: DayDressPlateKeyInput = {
  model: MODEL,
  plate: { filename: 'cast-plate-u1.png' },
  clothing: { imageFilename: 'dress-u1.png', imageUrl: '/api/comfyui/view?filename=dress-u1.png' },
  clothingLabel: 'lace dress',
  clothingDescription: 'A white lace midi dress with thin straps.',
  footwear: 'white sneakers',
  footwearImage: { imageFilename: 'sneakers-u1.png' },
};

const kit: DayDressPlateKeyInput = {
  model: MODEL,
  plate: { filename: 'cast-plate-u1.png' },
  clothing: { imageUrl: '/kits/dress-01.png' },
  clothingKey: 'kit:dress-01',
  clothingLabel: 'black dress',
  footwear: '',
};

/** A store holding the plate dressed for `before`: does `after` find it? */
function reuses(before: DayDressPlateKeyInput, after: DayDressPlateKeyInput): boolean {
  const cache = rememberDayDressPlate([], {
    key: dayDressPlateRequestKey(before),
    filename: 'day-dress-plate-1.png',
    at: 1,
  });
  return findDayDressPlate(cache, dayDressPlateRequestKey(after)) !== null;
}

describe('dress plate key — an outfit change never reuses the old plate', () => {
  it('the same picks find the same plate (Day, Story and Outfit share it)', () => {
    assert.equal(reuses(photo, { ...photo }), true);
    assert.equal(reuses(kit, { ...kit, clothingLabel: 'Black dress (renamed)' }), true);
    // The Cast plate as a filename or as a view URL of it is the same plate.
    assert.equal(
      reuses(photo, { ...photo, plate: { imageUrl: '/api/comfyui/view?filename=cast-plate-u1.png' } }),
      true
    );
    // A description that differs only in spacing / case is the same words.
    assert.equal(
      reuses(photo, { ...photo, clothingDescription: '  a white lace  midi dress with thin straps. ' }),
      true
    );
  });

  it('another kit', () => {
    assert.equal(reuses(kit, { ...kit, clothingKey: 'kit:dress-02' }), false);
  });

  it('a kit swapped for your own photo, and back', () => {
    assert.equal(reuses(kit, photo), false);
    assert.equal(reuses(photo, kit), false);
  });

  it('another clothing photo', () => {
    assert.equal(
      reuses(photo, { ...photo, clothing: { imageFilename: 'dress-u2.png' } }),
      false
    );
  });

  it('a re-uploaded clothing photo with the same filename gets its own upload name', () => {
    const first = stampedUploadName('image.jpg', 1_000);
    const second = stampedUploadName('image.jpg', 2_000);
    assert.notEqual(first, second);
    assert.equal(
      reuses(
        { ...photo, clothing: { imageFilename: first } },
        { ...photo, clothing: { imageFilename: second } }
      ),
      false
    );
  });

  it('the same photo used as a packshot vs extracted (different upload files)', () => {
    assert.equal(
      reuses(photo, { ...photo, clothing: { imageFilename: 'fitting-garment-packshot-2.png' } }),
      false
    );
  });

  it('an edited clothing description', () => {
    assert.equal(
      reuses(photo, { ...photo, clothingDescription: 'A red satin slip dress.' }),
      false
    );
    assert.equal(reuses(photo, { ...photo, clothingDescription: '' }), false);
  });

  it('a kit ignores the (photo) description field', () => {
    assert.equal(reuses(kit, { ...kit, clothingDescription: 'anything' }), true);
  });

  it('other shoes in words', () => {
    assert.equal(reuses(kit, { ...kit, footwear: 'black heels' }), false);
    assert.equal(reuses(photo, { ...photo, footwear: 'black heels' }), false);
  });

  it('shoes in words vs the same shoes with a picture (kit or photo)', () => {
    const words = { ...photo, footwearImage: undefined };
    assert.equal(reuses(words, photo), false);
    assert.equal(reuses(photo, words), false);
    assert.equal(
      reuses(photo, { ...photo, footwearImage: { imageUrl: '/kits/shoes/sneaker-02.png' } }),
      false
    );
    assert.equal(
      reuses(photo, { ...photo, footwearImage: { imageFilename: 'sneakers-u2.png' } }),
      false
    );
  });

  it('shoes picked vs none, and barefoot', () => {
    assert.equal(reuses(kit, { ...kit, footwear: 'white sneakers' }), false);
    assert.equal(reuses({ ...kit, footwear: 'white sneakers' }, { ...kit, footwear: 'barefoot' }), false);
  });

  it('another Cast plate (a look switch, another Cast, a new plate photo)', () => {
    assert.equal(reuses(photo, { ...photo, plate: { filename: 'cast-plate-look2.png' } }), false);
    assert.equal(
      reuses(photo, { ...photo, plate: { filename: stampedUploadName('cast-plate-u1.png', 5) } }),
      false
    );
  });

  it('another engine family', () => {
    assert.equal(reuses(kit, { ...kit, model: 'qwen-rapid-aio-edit' }), false);
  });
});

describe('dayDressPlateChange — why a new plate is dressed', () => {
  const key = (input: DayDressPlateKeyInput) => dayDressPlateRequestKey(input);

  it('nothing for this Cast plate yet: a first plate', () => {
    assert.equal(dayDressPlateChange([], key(kit)), null);
    assert.equal(
      dayDressPlateChange(
        [{ key: key({ ...kit, plate: { filename: 'someone-else.png' } }), at: 1 }],
        key(kit)
      ),
      null
    );
  });

  it('names what changed against the newest plate of the same Cast plate', () => {
    assert.equal(
      dayDressPlateChange([{ key: key(kit), at: 1 }], key({ ...kit, clothingKey: 'kit:dress-02' })),
      'outfit'
    );
    assert.equal(
      dayDressPlateChange([{ key: key(kit), at: 1 }], key({ ...kit, footwear: 'black heels' })),
      'shoes'
    );
    assert.equal(dayDressPlateChange([{ key: key(kit), at: 1 }], key(photo)), 'outfit and shoes');
    assert.equal(
      dayDressPlateChange(
        [
          { key: key(kit), at: 1 },
          { key: key({ ...kit, clothingKey: 'kit:dress-02' }), at: 2 },
        ],
        key({ ...kit, clothingKey: 'kit:dress-02', footwear: 'black heels' })
      ),
      'shoes'
    );
  });

  it('the status line says so', () => {
    assert.equal(
      dayDressPlateStatus({ name: 'Robin', clothing: true, footwear: false, change: 'outfit' }),
      'Outfit changed — dressing Robin again: one plate with the outfit (about a minute), then the stills start from it.'
    );
    assert.match(
      dayDressPlateStatus({ clothing: true, footwear: true, change: 'outfit and shoes' }),
      /^Outfit and shoes changed — dressing the lead again/
    );
    assert.match(dayDressPlateStatus({ clothing: true, footwear: true }), /^Dressing the lead first/);
  });
});

describe('stampedUploadName', () => {
  it('keeps the extension, replaces an earlier stamp', () => {
    assert.equal(stampedUploadName('IMG_0001.JPG', 36), 'IMG_0001-u10.JPG');
    const once = stampedUploadName('dress.png', 1_759_000_000_000);
    const twice = stampedUploadName(once, 1_759_000_000_001);
    assert.equal(twice.match(/-u/g)?.length, 1);
    assert.equal(stampedUploadName('', 36), 'upload-u10.png');
    assert.equal(stampedUploadName('folder/photo', 36), 'photo-u10.png');
  });
});
