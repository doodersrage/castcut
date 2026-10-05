import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dayLooksWrongAvailable,
  dayLooksWrongMark,
  dayLooksWrongTakeIds,
  LOOKS_WRONG_MARK,
} from './day-looks-wrong';
import { normalizeDaySlotStills, upsertDaySlotStill } from './day-planner';

describe('Looks wrong', () => {
  it('is offered only on a landed still', () => {
    assert.equal(dayLooksWrongAvailable({ status: 'completed', imageUrl: '/a.png' }), true);
    assert.equal(dayLooksWrongAvailable({ status: 'queued', promptId: 'p' }), false);
    assert.equal(dayLooksWrongAvailable({ status: 'completed' }), false);
    assert.equal(dayLooksWrongAvailable(undefined), false);
  });

  it('judges the shown take, and an unpicked second take too', () => {
    assert.deepEqual(
      dayLooksWrongTakeIds({ status: 'completed', imageUrl: '/a.png', promptId: 'p-a' }),
      ['p-a']
    );
    assert.deepEqual(
      dayLooksWrongTakeIds({
        status: 'completed',
        imageUrl: '/a.png',
        promptId: 'p-a',
        twoTakes: { promptId: 'p-b', status: 'completed', imageUrl: '/b.png' },
      }),
      ['p-a', 'p-b']
    );
    assert.deepEqual(dayLooksWrongTakeIds({ status: 'queued', promptId: 'p-a' }), []);
  });

  it('notes the redo on the card, and the note survives the still store', () => {
    assert.equal(dayLooksWrongMark({ redoReason: 'looks-wrong' }), LOOKS_WRONG_MARK);
    assert.equal(LOOKS_WRONG_MARK, 'Redone — looked wrong');
    assert.equal(dayLooksWrongMark({}), null);
    const [still] = normalizeDaySlotStills([
      { slotId: 'morning', promptId: 'p-c', status: 'queued', redoReason: 'looks-wrong' },
    ]);
    assert.equal(dayLooksWrongMark(still), LOOKS_WRONG_MARK);
    // Any other queue clears it.
    const [next] = upsertDaySlotStill([still!], {
      slotId: 'morning',
      promptId: 'p-d',
      status: 'queued',
      redoReason: undefined,
    });
    assert.equal(dayLooksWrongMark(next), null);
  });
});
