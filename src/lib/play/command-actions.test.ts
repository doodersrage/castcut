import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PLAY_COMMAND_ACTION_IDS, dayCommandActions } from './command-actions';

const base = {
  completedShotCount: 0,
  busy: false,
  queueBlocked: false,
  canAnimateAll: false,
  renderOffline: false,
  queueAll: () => {},
  animateAll: () => {},
};

describe('dayCommandActions (desktop and phone Day)', () => {
  it('offers Queue the Day, and Animate all only once there is something to animate', () => {
    const [queue, animate] = dayCommandActions(base);
    assert.equal(queue?.id, PLAY_COMMAND_ACTION_IDS.queueDay);
    assert.equal(queue?.label, 'Queue the Day');
    assert.equal(queue?.available?.(), true);
    assert.equal(animate?.id, PLAY_COMMAND_ACTION_IDS.animateAll);
    assert.equal(animate?.available?.(), false);
    const [rest, ready] = dayCommandActions({ ...base, completedShotCount: 2, canAnimateAll: true });
    assert.equal(rest?.label, 'Queue the rest of the Day');
    assert.equal(ready?.available?.(), true);
  });

  it('gates both on busy, the queue on a block reason, and Animate all on ComfyUI offline', () => {
    const busy = dayCommandActions({ ...base, busy: true, canAnimateAll: true });
    assert.deepEqual(
      busy.map(action => action.available?.()),
      [false, false]
    );
    const blocked = dayCommandActions({ ...base, queueBlocked: true, canAnimateAll: true });
    assert.deepEqual(
      blocked.map(action => action.available?.()),
      [false, true]
    );
    const offline = dayCommandActions({ ...base, renderOffline: true, canAnimateAll: true });
    assert.equal(offline[1]?.available?.(), false);
  });

  it('runs the screen’s own handlers', () => {
    const ran: string[] = [];
    const actions = dayCommandActions({
      ...base,
      queueAll: () => ran.push('queue'),
      animateAll: () => ran.push('animate'),
    });
    for (const action of actions) void action.run?.({} as never);
    assert.deepEqual(ran, ['queue', 'animate']);
  });
});
