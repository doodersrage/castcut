import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_DAY_SLOTS, diversifyDaySlotScenes, type DaySlot } from './day-planner';
import { swapDayForCast } from './day-cast-park';
import {
  dayThreadBeats,
  nextDayThread,
  normalizeDayThread,
  planTomorrowSlots,
  repeatsYesterday,
} from './day-thread';

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const today = diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
  forceBeats: true,
  forceLocations: true,
  fillBeats: true,
  dayMood: 'everyday',
  random: seeded(7),
}).slots;

describe('Tomorrow thread', () => {
  it("remembers today's beats as yesterday and keeps the idea", () => {
    const thread = nextDayThread({ premise: 'a rainy week in Lisbon', yesterday: ['old'] }, today);
    assert.equal(thread?.premise, 'a rainy week in Lisbon');
    assert.deepEqual(thread?.yesterday, dayThreadBeats(today));
    assert.match(thread!.yesterday![0]!, /^morning: /);
    assert.equal(normalizeDayThread({}), undefined);
    assert.equal(normalizeDayThread({ premise: 5, yesterday: [3, ' '] }), undefined);
  });

  it('parks with the Cast', () => {
    const swapped = swapDayForCast(
      { stills: [{ slotId: 'morning', status: 'completed' }], dayThread: { premise: 'x' } },
      'cast-a',
      'cast-b'
    );
    assert.deepEqual(swapped.parkedDays?.['cast-a']?.dayThread, { premise: 'x' });
  });

  it('writes in the follow-on beats; unwritten slots get a fresh beat, never yesterday’s', () => {
    const yesterday = dayThreadBeats(today);
    const next = planTomorrowSlots(today, {
      beats: [{ slotId: 'morning', beat: 'sitting on the ferry with a coffee', setting: 'river ferry deck' }],
      yesterday,
      dayMood: 'everyday',
      random: seeded(11),
    });
    assert.equal(next[0]!.sceneHints, 'sitting on the ferry with a coffee');
    for (const slot of next.slice(1)) {
      assert.ok(slot.sceneHints, slot.id);
      assert.equal(repeatsYesterday(slot.sceneHints, yesterday), false, slot.id);
    }
  });

  it('with no LLM beats (adult mood, LLM off) the whole day is fresh', () => {
    const yesterday = dayThreadBeats(today);
    const next = planTomorrowSlots(today, { yesterday, dayMood: 'everyday', random: seeded(3) });
    assert.equal(next.filter(slot => repeatsYesterday(slot.sceneHints, yesterday)).length, 0);
  });

  it('drops kits Day picked itself, keeps chosen outfits', () => {
    const slots = [
      { ...today[0], wardrobeId: 'auto-kit', wardrobeAuto: true },
      { ...today[1], wardrobeId: 'my-dress' },
    ] as DaySlot[];
    const next = planTomorrowSlots(slots, {
      beats: [
        { slotId: slots[0]!.id, beat: 'walking to the bakery', setting: 'street' },
        { slotId: slots[1]!.id, beat: 'sitting on a bench', setting: 'park' },
      ],
    });
    assert.equal(next[0]!.wardrobeId, undefined);
    assert.equal(next[1]!.wardrobeId, 'my-dress');
  });
});
