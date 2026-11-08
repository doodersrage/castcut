import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dayMomentHeading } from './day-as-short';
import { slotDayPart, slotPoolId } from './parts';
import { buildDayPremiseMessages } from './premise';
import { normalizeDaySlots } from './planner';

describe('a moment’s chosen time of day', () => {
  it('is its daypart over where it falls; unset, where it falls', () => {
    assert.equal(slotDayPart({ id: 'morning', timeOfDay: 'night' }), 'night');
    assert.equal(slotDayPart({ id: 'evening-2' }), 'evening');
    assert.equal(slotDayPart({ id: 'morning', timeOfDay: 'noon' }), 'morning');
    assert.equal(slotPoolId({ id: 'morning-2', timeOfDay: 'night' }), 'night');
    assert.equal(slotPoolId({ id: 'morning-2' }), 'morning-2');
  });

  it('is kept with the moment, and its script scene is set then', () => {
    const [slot] = normalizeDaySlots([
      { id: 'morning', label: 'Night', location: 'kitchen', timeOfDay: 'night' },
    ] as never);
    assert.equal(slot!.timeOfDay, 'night');
    assert.equal(dayMomentHeading(slot!), 'INT. KITCHEN - NIGHT');
    const [plain] = normalizeDaySlots([
      { id: 'morning', label: 'Morning', timeOfDay: 'noon' },
    ] as never);
    assert.equal(plain!.timeOfDay, undefined);
  });

  it('is the time Write it asks the LLM for', () => {
    const text = buildDayPremiseMessages({
      premise: 'a quiet day',
      slotIds: ['morning', 'afternoon'],
      slotTimes: { morning: 'night' },
      companions: false,
    })
      .map(message => message.content)
      .join('\n');
    assert.match(text, /"morning" \(night\)/);
    assert.match(text, /"afternoon" \(afternoon\)/);
  });
});
