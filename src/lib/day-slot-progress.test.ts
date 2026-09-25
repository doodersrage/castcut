import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { daySlotJobProgress } from './day-slot-progress';

describe('Day slot job progress', () => {
  it('is null for idle, done and failed stills', () => {
    assert.equal(daySlotJobProgress({}), null);
    assert.equal(daySlotJobProgress({ stillStatus: 'completed' }), null);
    assert.equal(daySlotJobProgress({ stillStatus: 'error' }), null);
  });

  it('shows the queue position while waiting', () => {
    assert.equal(
      daySlotJobProgress({ stillStatus: 'queued', entry: { queuePosition: 3 } })?.label,
      '#3 in queue'
    );
    assert.equal(
      daySlotJobProgress({ stillStatus: 'queued', entry: { queuePosition: 1 } })?.label,
      'Next in queue'
    );
    assert.equal(daySlotJobProgress({ stillStatus: 'queued' })?.label, 'Queueing…');
  });

  it('says rendering once ComfyUI is on it, with a percentage when steps report', () => {
    assert.deepEqual(
      daySlotJobProgress({
        stillStatus: 'queued',
        entry: { status: 'running', progressValue: 9, progressMax: 20 },
      }),
      { phase: 'rendering', label: 'Rendering · 45%', percent: 45 }
    );
    assert.equal(
      daySlotJobProgress({ stillStatus: 'queued', entry: { queuePosition: 0 } })?.label,
      'Rendering…'
    );
    assert.equal(daySlotJobProgress({ stillStatus: 'running' })?.label, 'Rendering…');
    assert.equal(
      daySlotJobProgress({ stillStatus: 'queued', livePreview: true })?.phase,
      'rendering'
    );
  });
});
