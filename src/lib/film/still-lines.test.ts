import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createScene, sceneCutShots } from '../day/scenes';
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

  it('finds the lead’s line on a Scene’s kept still, as Cut gets it (not only on clips)', () => {
    // The overnight episode read only Rob's lines: a Scene's still never carried hers.
    const scene = {
      ...createScene({ castId: 'lena', name: '2B KITCHEN · Dialogue', id: 'scene-l', now: 1 }),
      takes: [{ id: 'k', promptId: 'k', imageUrl: '/k.png', at: 1 }],
      keptTakeId: 'k',
    };
    scene.slot = { ...scene.slot, line: 'You didn’t bring the recipe.' };
    const [shot] = sceneCutShots([scene], 'lena');
    assert.equal(shot!.kind, 'still');
    assert.equal(shot!.spoken, undefined, 'not heard or subtitled unless it is read');
    assert.deepEqual(stillLineOf(shot!), {
      text: 'You didn’t bring the recipe.',
      speaker: { lead: true },
    });
  });
});
