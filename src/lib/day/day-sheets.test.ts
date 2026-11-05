import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayCallSheetRows, dayStoryboardFrames } from './day-sheets';

describe('Day sheets', () => {
  it('maps a Day to frames and call sheet rows', () => {
    const slots = [
      {
        id: 'morning',
        label: 'Morning',
        location: 'kitchen',
        sceneHints: 'pours coffee',
        line: 'Hi',
        poseCamera: { height: 'low' as const },
        state: { carries: [{ text: 'a mug' }], emotion: 'sleepy' },
        thirdCastId: 'tom',
        wardrobeId: 'kit-1',
      },
      { id: 'noon', label: 'Noon' },
    ];
    const stills = [{ slotId: 'morning', status: 'completed' as const, imageUrl: '/m.png', promptId: 'p' }];
    const input = {
      slots: slots as never,
      stills: stills as never,
      lead: 'Rae',
      castNames: { tom: 'Tom' },
      outfitName: (id: string) => `Outfit ${id}`,
    };
    const [first, second] = dayStoryboardFrames(input);
    assert.equal(first!.heading, 'Morning — kitchen');
    assert.equal(first!.image, '/m.png');
    assert.ok(first!.notes.some(([label, text]) => label === 'State' && text === 'carries a mug · sleepy'));
    assert.equal(second!.image, undefined);
    const [row, empty] = dayCallSheetRows(input);
    assert.equal(row!.cast, 'Rae, Tom');
    assert.equal(row!.outfit, 'Outfit kit-1');
    assert.equal(row!.status, 'Still');
    assert.equal(empty!.status, 'Not shot');
  });
});
