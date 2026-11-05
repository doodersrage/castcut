import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { storyScriptBlocks, storyStoryboardFrames } from './story-sheets';

describe('Story sheets', () => {
  it('maps a Story to a screenplay and a storyboard', () => {
    const beats = [
      { id: 'a', at: 1, title: 'The train', blurb: 'She steps off into the rain.', narration: 'I came back.', line: 'Hello?', replyLine: 'You came.', imageUrl: '/a.png' },
      { id: 'b', at: 2, title: '', blurb: '' },
    ];
    const blocks = storyScriptBlocks(beats as never, { lead: 'Rae', partner: 'Tom' });
    assert.deepEqual(blocks.slice(0, 5), [
      { kind: 'heading', text: '1. The train' },
      { kind: 'action', text: 'She steps off into the rain.' },
      { kind: 'dialogue', character: 'Rae (V.O.)', text: 'I came back.' },
      { kind: 'dialogue', character: 'Rae', text: 'Hello?' },
      { kind: 'dialogue', character: 'Tom', text: 'You came.' },
    ]);
    assert.deepEqual(blocks.slice(-2), [
      { kind: 'heading', text: '2. Scene' },
      { kind: 'transition', text: 'Fade out.' },
    ]);
    const [frame] = storyStoryboardFrames(beats as never);
    assert.equal(frame!.heading, 'The train');
    assert.equal(frame!.image, '/a.png');
  });
});
