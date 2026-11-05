import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dialogueListRows } from './dialogue-list';

describe('dialogue list', () => {
  it('lists on-screen lines and voice-overs in film order', () => {
    const rows = dialogueListRows([
      { title: 'Morning', kind: 'clip', spoken: 'Hi.', speaker: 'Rae' },
      { title: 'Noon', kind: 'still', spoken: 'Wait!', narrationText: 'I knew then.', speaker: 'Rae' },
      { title: 'Quiet', kind: 'still' },
    ]);
    assert.deepEqual(rows, [
      ['1', 'Morning', 'Rae', 'Hi.', 'On screen', 'Talking clip'],
      ['2', 'Noon', 'Rae', 'Wait!', 'On screen', 'Still — animate it to hear it'],
      ['2', 'Noon', 'Rae (V.O.)', 'I knew then.', 'Voice-over', 'Recorded when the film is cut'],
    ]);
  });
});
