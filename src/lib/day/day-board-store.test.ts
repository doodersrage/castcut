import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DayToolCache } from '../play/settings';
import { dayAsShort, dayShortFingerprint } from './day-as-short';
import { storedDayBoard, wholeDayBoard } from './day-board-store';

const day = {
  stillsCharacterId: 'mara',
  dayLength: 4,
  slots: [
    { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee by the window', line: 'Coffee first.' },
    { id: 'afternoon', label: 'Afternoon', location: 'beach', sceneHints: 'walks along the water', eventMove: 'puts down her cup' },
    { id: 'evening', label: 'Evening' },
    { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed' },
  ],
  stills: [{ slotId: 'morning', promptId: 'p-m', imageUrl: '/m.png', status: 'completed' }],
} as unknown as DayToolCache;
const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
const linked = {
  ...day,
  shortLink: { castId: 'mara', scriptId: short.script.id, fingerprint: dayShortFingerprint(day), syncedAt: 1000 },
} as DayToolCache;
const by = (board: DayToolCache, id: string) => board.slots!.find(slot => slot.id === id)!;
/** As it goes through the settings store (JSON). */
const stored = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const sameMoments = (board: DayToolCache) => {
  for (const slot of linked.slots!) {
    const back = by(board, slot.id) as Record<string, unknown>;
    for (const [key, value] of Object.entries(slot)) assert.deepEqual(back[key], value, `${slot.id}.${key}`);
  }
};

describe('the Short’s board stored slim (Step 5f part 3b)', () => {
  it('stores a linked board slim and reads it back whole, in step', () => {
    const slim = stored(storedDayBoard(linked, short.scenes));
    assert.deepEqual(by(slim, 'morning'), { id: 'morning' });
    assert.deepEqual(by(slim, 'afternoon'), { id: 'afternoon', eventMove: 'puts down her cup' });
    const whole = wholeDayBoard(slim, short.scenes);
    sameMoments(whole);
    assert.deepEqual(whole.stills, linked.stills);
    // In step: the page holding it has no edit waiting.
    assert.equal(whole.shortLink!.fingerprint, dayShortFingerprint(whole));
  });

  it('stores whole what wouldn’t read back the same: an edit waiting, no link', () => {
    const waiting = { ...linked, slots: linked.slots!.map(slot => (slot.id === 'night' ? { ...slot, sceneHints: 'cooks' } : slot)) } as DayToolCache;
    assert.equal(storedDayBoard(waiting, short.scenes), waiting);
    assert.equal(storedDayBoard(day, short.scenes), day);
    assert.equal(wholeDayBoard(day, short.scenes), day);
  });

  it('a change written over the board read whole (a new take) is stored whole — never an empty card', () => {
    // What saveToolSettings('day', { stills }) does: the change onto the board as read.
    const slim = stored(storedDayBoard(linked, short.scenes));
    const read = wholeDayBoard(slim, short.scenes);
    const changed = {
      ...read,
      stills: [...read.stills!, { slotId: 'night', promptId: 'p-n', imageUrl: '/n.png', status: 'completed' }],
    } as DayToolCache;
    const next = stored(storedDayBoard(changed, short.scenes));
    // Not in step with its link any more (the board writes it into the short): kept whole.
    sameMoments(next);
    assert.equal(wholeDayBoard(next, short.scenes), next);
  });

  it('fills a slim card its Scene holds even when the stored copy is out of step with its link', () => {
    const slim = stored(storedDayBoard(linked, short.scenes));
    // Something wrote over the slim copy what its link didn't see (the mood, from another tab).
    const outOfStep = { ...slim, dayMood: 'intimate' } as DayToolCache;
    assert.notEqual(dayShortFingerprint(outOfStep), outOfStep.shortLink!.fingerprint);
    const whole = wholeDayBoard(outOfStep, short.scenes);
    sameMoments(whole);
    assert.deepEqual(whole.stills, linked.stills);
  });

  it('keeps a card whole once its Scene is gone (Scene → Delete saves it whole first)', () => {
    const slim = stored(storedDayBoard(linked, short.scenes));
    const read = wholeDayBoard(slim, short.scenes);
    const rest = short.scenes.filter(scene => scene.fromDaySlot !== 'night');
    // keepShortCardOf: the board as read before the delete, saved after it.
    const next = stored(storedDayBoard({ ...wholeDayBoard(slim, rest), slots: read.slots, shortLink: read.shortLink } as DayToolCache, rest));
    assert.equal(by(next, 'night').sceneHints, 'reads in bed');
    assert.deepEqual(by(next, 'morning'), { id: 'morning' });
    sameMoments(wholeDayBoard(next, rest));
    // Without it, the slim card would read empty: its Scene said what it was.
    assert.equal(by(wholeDayBoard(slim, rest), 'night').sceneHints, undefined);
  });
});
