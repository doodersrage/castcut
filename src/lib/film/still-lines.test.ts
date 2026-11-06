import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stillLineOf } from './still-lines';

describe('reading the lines on stills', () => {
  it('reads the lead’s line, else the other person’s from the beat, on stills only', () => {
    assert.deepEqual(stillLineOf({ kind: 'still', spoken: 'Coffee first.' }), {
      text: 'Coffee first.',
      speaker: { lead: true },
    });
    assert.deepEqual(
      stillLineOf({ kind: 'still', caption: 'He leans on the counter. Rob says: “You came back.”' }),
      { text: 'You came back.', speaker: { lead: false, name: 'Rob' } }
    );
    assert.equal(stillLineOf({ kind: 'clip', spoken: 'Coffee first.' }), null);
    assert.equal(stillLineOf({ kind: 'still', caption: 'She looks out to sea.' }), null);
  });
});
