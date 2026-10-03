import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activeLook, characterWithLook, type CharacterRecord } from './character-os';
import { swapDayForCast } from './day-cast-park';
import { resolveDayFaceOnlyPlate, resolveDayQueueIdentityPlate } from './day-plate';
import { normalizeDaySlots, type DaySlot } from './day-planner';
import { daySlotLookOutfit, daySlotOwnLookId, resolveDaySlotLook } from './day-slot-look';
import { buildDaySlotPromptForStill } from './day-still-prompt';
import { DEFAULT_POSE_GUIDE_STYLE } from './pose-guide-prompt';
import type { DayToolCache } from './settings-cache';

/** A Cast with two looks: Studio (active, a kit lock) and Beach (another plate, a kept photo). */
const cast = (): CharacterRecord => ({
  id: 'char-looks',
  name: 'Juno',
  version: 1,
  updatedAt: 1,
  activeLookId: 'look-studio',
  descriptor: 'a woman with short red hair',
  reference: { originalFilename: 'studio.png' },
  ipAdapter: { imageFilename: 'studio-face.png' },
  lockedWardrobeId: 'outfit-studio-suit',
  looks: [
    {
      id: 'look-studio',
      name: 'Studio',
      createdAt: 2,
      descriptor: 'a woman with short red hair',
      reference: { originalFilename: 'studio.png' },
      ipAdapter: { imageFilename: 'studio-face.png' },
      lockedWardrobeId: 'outfit-studio-suit',
    },
    {
      id: 'look-beach',
      name: 'Beach',
      createdAt: 1,
      descriptor: 'a woman with short red hair',
      reference: { originalFilename: 'beach.png', originalUrl: '/plates/beach.png' },
      ipAdapter: { imageFilename: 'beach-face.png' },
      keptOutfit: {
        entryId: 'g-beach',
        dressPlateKey: 'dress-beach',
        customGarmentImageFilename: 'kaftan.png',
        customGarmentDescription: 'a white linen kaftan',
        footwear: 'tan sandals',
      },
    },
    {
      id: 'look-coat',
      name: 'Coat',
      createdAt: 0,
      reference: { originalFilename: 'coat.png' },
      lockedWardrobeId: 'outfit-wool-coat',
    },
  ],
});

const DAY_OUTFIT = {
  lockedWardrobeId: 'outfit-studio-suit',
  customGarmentImageFilename: 'day-photo.png',
  customGarmentDescription: 'a green dress',
  footwear: 'white sneakers',
  footwearImageFilename: 'sneakers.png',
};

describe('a look per Day slot', () => {
  it('no look, the active look or an unknown look: the same record and Day’s outfit', () => {
    const character = cast();
    for (const lookId of [undefined, '', 'look-studio', 'look-gone']) {
      const resolved = resolveDaySlotLook({ character, slot: { lookId }, outfit: DAY_OUTFIT });
      assert.equal(resolved.lookId, undefined);
      assert.equal(resolved.character, character);
      assert.equal(resolved.outfit, DAY_OUTFIT);
      assert.equal(resolved.plate, undefined);
    }
    assert.equal(daySlotOwnLookId(null, { lookId: 'look-beach' }), undefined);
    assert.equal(characterWithLook(character, 'look-studio'), character);
  });

  it('another look: its plate, face and kept photo outfit, without changing the active look', () => {
    const character = cast();
    const resolved = resolveDaySlotLook({
      character,
      slot: { lookId: 'look-beach' },
      outfit: DAY_OUTFIT,
    });
    assert.equal(resolved.lookId, 'look-beach');
    assert.equal(resolved.plate?.filename, 'beach.png');
    assert.equal(resolved.plate?.source, 'cast');
    assert.equal(activeLook(resolved.character!).id, 'look-beach');
    assert.equal(resolveDayFaceOnlyPlate(resolved.character)?.filename, 'beach-face.png');
    assert.equal(
      resolveDayQueueIdentityPlate({ character: resolved.character, preferCastPlate: true })
        ?.filename,
      'beach.png'
    );
    // The kept photo and its shoes; no kit lock.
    assert.deepEqual(resolved.outfit, {
      lockedWardrobeId: undefined,
      customGarmentImageUrl: undefined,
      customGarmentImageFilename: 'kaftan.png',
      customGarmentDescription: 'a white linen kaftan',
      footwear: 'tan sandals',
      footwearImageUrl: undefined,
      footwearImageFilename: undefined,
    });
    // The Cast itself is untouched.
    assert.equal(character.activeLookId, 'look-studio');
    assert.equal(activeLook(character).id, 'look-studio');
  });

  it('a kit look wears its kit (not Day’s photo) and Day’s shoes; a look with no outfit wears Day’s', () => {
    const coat = daySlotLookOutfit({ lockedWardrobeId: 'outfit-wool-coat' }, DAY_OUTFIT);
    assert.equal(coat.lockedWardrobeId, 'outfit-wool-coat');
    assert.equal(coat.customGarmentImageFilename, undefined);
    assert.equal(coat.footwear, 'white sneakers');
    assert.equal(coat.footwearImageFilename, 'sneakers.png');
    assert.equal(daySlotLookOutfit({}, DAY_OUTFIT), DAY_OUTFIT);
  });

  it('isolate on: a look plate with a stored cut-out queues the cut-out', () => {
    const character = cast();
    const isolated: CharacterRecord = {
      ...character,
      looks: character.looks!.map(look =>
        look.id === 'look-beach'
          ? {
              ...look,
              reference: {
                originalFilename: 'beach.png',
                isolatedFilename: 'beach-white.png',
                isolated: true,
              },
            }
          : look
      ),
    };
    const on = resolveDaySlotLook({
      character: isolated,
      slot: { lookId: 'look-beach' },
      outfit: {},
      isolateSubject: true,
    });
    const off = resolveDaySlotLook({
      character: isolated,
      slot: { lookId: 'look-beach' },
      outfit: {},
      isolateSubject: false,
    });
    assert.equal(on.plate?.filename, 'beach-white.png');
    assert.equal(off.plate?.filename, 'beach.png');
  });

  it('the slot’s prompt follows its look’s outfit', () => {
    const character = cast();
    const slot: DaySlot = {
      id: 'morning',
      label: 'Morning',
      location: 'a seaside promenade',
      sceneHints: 'walking along the railing',
    };
    const prompt = (lookId?: string) => {
      const look = resolveDaySlotLook({ character, slot: { ...slot, lookId }, outfit: {} });
      return buildDaySlotPromptForStill(slot, {
        plate: look.plate ?? { filename: 'studio.png', source: 'cast' },
        queuePlate: null,
        character: look.character,
        hasPlate: true,
        leadNoun: 'woman',
        customGarmentFilename: look.outfit.customGarmentImageFilename,
        customGarmentDescription: look.outfit.customGarmentDescription,
        dayMood: 'everyday',
        intimateEnabled: false,
        allowCompanions: false,
        model: 'qwen-rapid-aio-edit',
        defaultPoseGuideStyle: DEFAULT_POSE_GUIDE_STYLE,
      });
    };
    assert.doesNotMatch(prompt(), /kaftan/);
    assert.match(prompt('look-beach'), /kaftan/);
  });

  it('a slot keeps its look through saves and Cast parking', () => {
    const slots = normalizeDaySlots([
      { id: 'morning', label: 'Morning', lookId: ' look-beach ' },
      { id: 'evening', label: 'Evening' },
    ]);
    assert.equal(slots.find(slot => slot.id === 'morning')?.lookId, 'look-beach');
    assert.equal(slots.find(slot => slot.id === 'evening')?.lookId, undefined);
    const day = {
      slots,
      stills: [{ slotId: 'morning', imageUrl: '/a.png', status: 'completed' }],
      stillsCharacterId: 'char-looks',
    } as DayToolCache;
    const parked = swapDayForCast(day, 'char-looks', 'char-other', 1);
    const back = swapDayForCast(
      { ...day, ...parked, slots: [] },
      'char-other',
      'char-looks',
      2
    );
    assert.equal(back.slots?.find(slot => slot.id === 'morning')?.lookId, 'look-beach');
  });
});
