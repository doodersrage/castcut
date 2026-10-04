import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clothingSummaryThumbs } from './clothing-summary';
import {
  dayAfterOutfitHandoff,
  dayHandoffKeptSlotIds,
  daySlotDiffers,
  daySlotsThatDiffer,
  slotsAfterDayOutfitChange,
  slotsUsingDayOutfit,
  type DayWideOutfit,
} from './day-outfit-scope';
import type { DaySlot } from './day-planner';

const DAY: DayWideOutfit = {
  activeLookId: 'look-a',
  lookIds: ['look-a', 'look-b'],
  kitId: 'kit-day',
};

const slot = (id: string, extra: Partial<DaySlot> = {}): DaySlot =>
  ({ id, label: id[0]!.toUpperCase() + id.slice(1), ...extra }) as DaySlot;

describe('one look and clothing for the whole Day', () => {
  it('a slot differs by another look or a kit that is not the Day’s', () => {
    assert.equal(daySlotDiffers(slot('morning'), DAY), false);
    assert.equal(daySlotDiffers(slot('morning', { lookId: 'look-a' }), DAY), false);
    assert.equal(daySlotDiffers(slot('morning', { wardrobeId: 'kit-day' }), DAY), false);
    assert.equal(daySlotDiffers(slot('morning', { lookId: 'look-b' }), DAY), true);
    assert.equal(daySlotDiffers(slot('morning', { wardrobeId: 'kit-x' }), DAY), true);
    // A look removed since it was picked does not count; nor does the photo placeholder.
    assert.equal(daySlotDiffers(slot('morning', { lookId: 'look-gone' }), DAY), false);
    assert.equal(daySlotDiffers(slot('morning', { wardrobeId: 'custom-garment' }), DAY), false);
  });

  it('an auto-picked kit is the Day’s own only while the Day wears nothing of its own', () => {
    const auto = slot('morning', { wardrobeId: 'kit-arc', wardrobeAuto: true });
    assert.equal(daySlotDiffers(auto, { ...DAY, kitId: undefined }), false);
    assert.equal(daySlotDiffers(auto, DAY), true);
    assert.equal(daySlotDiffers(auto, { ...DAY, kitId: undefined, hasPhoto: true }), true);
  });

  it('a clothing photo turns the Day’s kit off: any slot kit differs', () => {
    assert.equal(
      daySlotDiffers(slot('morning', { wardrobeId: 'kit-day' }), { ...DAY, hasPhoto: true }),
      true
    );
  });

  it('Use for every slot clears the overrides of the slots that differ, in one go', () => {
    const slots = [
      slot('morning', { lookId: 'look-b', outfitByHand: true }),
      slot('afternoon', { wardrobeId: 'kit-x', outfitByHand: true }),
      slot('evening', { wardrobeId: 'kit-day' }),
      slot('night', { location: 'home' }),
    ];
    assert.deepEqual(daySlotsThatDiffer(slots, DAY), ['morning', 'afternoon']);
    const next = slotsUsingDayOutfit(slots, DAY);
    assert.deepEqual(daySlotsThatDiffer(next, DAY), []);
    assert.equal(next[0]!.lookId, undefined);
    assert.equal(next[0]!.outfitByHand, undefined);
    assert.equal(next[1]!.wardrobeId, undefined);
    // Slots that already match are left as they are.
    assert.equal(next[2], slots[2]);
    assert.equal(next[3], slots[3]);
    // Only some slots (Outfit's notice).
    const some = slotsUsingDayOutfit(slots, DAY, ['afternoon']);
    assert.equal(some[0]!.lookId, 'look-b');
    assert.equal(some[1]!.wardrobeId, undefined);
  });
});

describe('Outfit hands a new outfit to Day', () => {
  const before = [
    // An older Keep / deep link stamped its kit on every slot.
    slot('morning', { wardrobeId: 'kit-old' }),
    // Picked by hand in the slot sheet.
    slot('afternoon', { wardrobeId: 'kit-hand', outfitByHand: true }),
    // A slot look is only ever picked by hand (no flag on older saves).
    slot('evening', { lookId: 'look-b' }),
    // The auto outfit arc.
    slot('night', { wardrobeId: 'kit-arc', wardrobeAuto: true }),
  ];

  it('clears what an earlier Day-wide choice left, keeps and lists the hand-set slots', () => {
    const { slots, keptSlotIds } = slotsAfterDayOutfitChange(before, { ...DAY, kitId: 'kit-new' });
    assert.equal(slots[0]!.wardrobeId, undefined);
    assert.equal(slots[1]!.wardrobeId, 'kit-hand');
    assert.equal(slots[2]!.lookId, 'look-b');
    assert.equal(slots[3]!.wardrobeId, undefined, 'the arc gives way to the Day’s kit');
    assert.deepEqual(keptSlotIds, ['afternoon', 'evening']);
  });

  it('keeps the auto arc while the Day still wears nothing of its own', () => {
    const { slots } = slotsAfterDayOutfitChange(before, { ...DAY, kitId: undefined });
    assert.equal(slots[3]!.wardrobeId, 'kit-arc');
    assert.equal(slots[0]!.wardrobeId, undefined);
  });

  it('a hand-set slot that now matches the Day is not listed', () => {
    const { keptSlotIds } = slotsAfterDayOutfitChange(before, { ...DAY, kitId: 'kit-hand' });
    assert.deepEqual(keptSlotIds, ['evening']);
  });

  it('the hand-off patch carries Outfit’s photo / shoes, the merged slots and the notice', () => {
    const patch = dayAfterOutfitHandoff(
      { slots: before, footwear: 'sneakers', customGarmentImageFilename: 'old.png' },
      {
        picks: { footwear: 'black pumps' },
        kitId: 'kit-new',
        activeLookId: 'look-a',
        lookIds: ['look-a', 'look-b'],
        at: 42,
      }
    );
    assert.equal(patch.footwear, 'black pumps');
    assert.ok('customGarmentImageFilename' in patch);
    assert.equal(patch.customGarmentImageFilename, undefined);
    assert.deepEqual(patch.outfitHandoffKept, { slotIds: ['afternoon', 'evening'], at: 42 });
    assert.equal(patch.slots[0]!.wardrobeId, undefined);
  });

  it('a kit or look change alone leaves the photo and shoes; a photo on Day turns kits off', () => {
    const patch = dayAfterOutfitHandoff(
      { slots: before, customGarmentImageFilename: 'dress.png', footwear: 'sneakers' },
      { kitId: 'kit-new', activeLookId: 'look-a', at: 1 }
    );
    assert.equal('footwear' in patch, false);
    assert.equal('customGarmentImageFilename' in patch, false);
    // The Day wears its photo: the hand-set kit differs, the stale ones went.
    assert.deepEqual(patch.outfitHandoffKept?.slotIds, ['afternoon', 'evening']);
  });

  it('a choice made on Day itself writes no notice', () => {
    const patch = dayAfterOutfitHandoff(
      { slots: before, outfitHandoffKept: { slotIds: ['morning'], at: 1 } },
      { kitId: 'kit-new', activeLookId: 'look-a', at: 2, notice: false }
    );
    assert.equal(patch.outfitHandoffKept, undefined);
  });

  it('the notice lists only the slots that still differ', () => {
    const slots = [slot('afternoon', { wardrobeId: 'kit-hand', outfitByHand: true }), slot('evening')];
    assert.deepEqual(
      dayHandoffKeptSlotIds({ slotIds: ['afternoon', 'evening'], at: 1 }, slots, DAY),
      ['afternoon']
    );
    assert.deepEqual(dayHandoffKeptSlotIds(undefined, slots, DAY), []);
  });
});

describe('the Clothing row’s pictures', () => {
  it('the photo wins over the kit, the shoes’ photo follows', () => {
    assert.deepEqual(
      clothingSummaryThumbs({
        kitLabel: 'outfit-boxy-chocolate-habit',
        kitThumbUrl: '/kit.png',
        photoUrl: '/dress.png',
        footwear: 'black pumps',
        footwearImageUrl: '/shoes.png',
      }).map(thumb => thumb.url),
      ['/dress.png', '/shoes.png']
    );
    const kitOnly = clothingSummaryThumbs({ kitLabel: 'Boxy habit', kitThumbUrl: '/kit.png' });
    assert.equal(kitOnly.length, 1);
    assert.equal(kitOnly[0]!.url, '/kit.png');
    assert.deepEqual(clothingSummaryThumbs({}), []);
    // Shoes picked from a footwear kit show its packshot.
    assert.deepEqual(
      clothingSummaryThumbs({ footwear: 'black leather pointed-toe stiletto pumps' }),
      [{ url: '/footwear/black-pumps.webp', label: 'Black pumps' }]
    );
  });
});
