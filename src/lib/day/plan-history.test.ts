import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EMPTY_PLAN_HISTORY,
  planChangeLabel,
  recordPlanStep,
  redoPlanStep,
  undoPlanStep,
} from './plan-history';
import type { DaySlot } from './planner';

const plan = (beat: string, place = 'park'): DaySlot[] =>
  [
    { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'coffee' },
    { id: 'afternoon', label: 'Afternoon', location: place, sceneHints: beat },
  ] as DaySlot[];

describe('day plan history', () => {
  it('undoes and redoes steps, and a new edit clears redo', () => {
    const a = plan('reads');
    const b = plan('runs');
    const c = plan('swims');
    let history = recordPlanStep(EMPTY_PLAN_HISTORY, a);
    history = recordPlanStep(history, b);
    const undone = undoPlanStep(history, c)!;
    assert.equal(undone.slots[1]!.sceneHints, 'runs');
    const redone = redoPlanStep(undone.history, undone.slots)!;
    assert.equal(redone.slots[1]!.sceneHints, 'swims');
    const branched = recordPlanStep(undone.history, undone.slots);
    assert.equal(branched.future.length, 0);
    assert.equal(undoPlanStep(EMPTY_PLAN_HISTORY, a), null);
    assert.equal(redoPlanStep(EMPTY_PLAN_HISTORY, a), null);
  });

  it('keeps the last 30 steps', () => {
    let history = EMPTY_PLAN_HISTORY;
    for (let i = 0; i < 40; i += 1) history = recordPlanStep(history, plan(`b${i}`));
    assert.equal(history.past.length, 30);
    assert.equal(history.past[0]![1]!.sceneHints, 'b10');
  });

  it('names what an undo brings back', () => {
    assert.equal(planChangeLabel(plan('runs'), plan('reads')), "Afternoon's beat");
    assert.equal(planChangeLabel(plan('runs', 'gym'), plan('reads')), 'Afternoon');
    assert.equal(planChangeLabel(plan('runs'), plan('runs').slice(0, 1)), 'the number of stills');
  });
});
