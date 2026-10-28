import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeDaySlots } from './planner';
import {
  STORY_STATE_ITEMS_MAX,
  normalizeStoryState,
  storyItemsFromText,
  storyStateBeat,
  withStoryState,
} from './story-state';

describe('a shot\'s story state (M8 T5)', () => {
  it('keeps what is set, tidied: items once each, a day from 1, nothing when empty', () => {
    assert.deepEqual(
      normalizeStoryState({
        carries: ['  the red   umbrella ', 'The red umbrella', '', { text: 'a paper bag', carriesOver: true }],
        changes: [{ text: 'left hand bandaged', carriesOver: 'yes' }],
        emotion: ' anxious ',
        storyDay: 2.7,
      }),
      {
        carries: [{ text: 'the red umbrella' }, { text: 'a paper bag', carriesOver: true }],
        changes: [{ text: 'left hand bandaged' }],
        emotion: 'anxious',
        storyDay: 2,
      }
    );
    assert.equal(normalizeStoryState({ storyDay: -4 })?.storyDay, 1);
    assert.equal(normalizeStoryState({ carries: [], emotion: ' ' }), undefined);
    assert.equal(normalizeStoryState('junk'), undefined);
    const many = Array.from({ length: STORY_STATE_ITEMS_MAX + 3 }, (_, i) => `thing ${i}`);
    assert.equal(normalizeStoryState({ carries: many })?.carries?.length, STORY_STATE_ITEMS_MAX);
  });

  it('reads a comma list, keeping which items carry over', () => {
    assert.deepEqual(
      storyItemsFromText('the red umbrella, a paper bag,, keys', [
        { text: 'A paper bag', carriesOver: true },
        { text: 'gone', carriesOver: true },
      ]),
      [{ text: 'the red umbrella' }, { text: 'a paper bag', carriesOver: true }, { text: 'keys' }]
    );
  });

  it('says it after the beat, for the still prompt', () => {
    const state = normalizeStoryState({
      carries: ['the red umbrella'],
      changes: ['left hand bandaged', 'wet hair'],
      emotion: 'anxious',
    });
    assert.equal(
      storyStateBeat(state),
      'She carries the red umbrella. Keep visible: left hand bandaged, wet hair. She feels anxious.'
    );
    assert.equal(
      withStoryState('waits at the bus stop.', state),
      'waits at the bus stop. She carries the red umbrella. Keep visible: left hand bandaged, wet hair. She feels anxious.'
    );
    assert.equal(withStoryState('', { emotion: 'calm' }), 'She feels calm.');
    assert.equal(withStoryState('waits', undefined), 'waits');
    assert.equal(storyStateBeat({ storyDay: 3 }), '', 'the day is not said in the picture');
  });

  it('stays on the shot through the slot\'s normalising', () => {
    const [slot] = normalizeDaySlots(
      [{ id: 'morning', label: 'Morning', state: { carries: ['keys'], storyDay: 2 } } as never],
      4
    );
    assert.deepEqual(slot?.state, { carries: [{ text: 'keys' }], storyDay: 2 });
  });
});
