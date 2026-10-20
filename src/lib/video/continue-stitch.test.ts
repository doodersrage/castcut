import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  continueStitchShots,
  peekContinueStitch,
  registerContinueStitch,
  takeContinueStitch,
} from './continue-stitch';

describe('video-continue-stitch', () => {
  it('registers and takes a pending stitch by child prompt id', () => {
    registerContinueStitch({
      childPromptId: 'child-1',
      parentUrl: 'https://example.com/parent.mp4',
    });
    assert.equal(peekContinueStitch('child-1')?.parentUrl, 'https://example.com/parent.mp4');
    const taken = takeContinueStitch('child-1');
    assert.equal(taken?.parentUrl, 'https://example.com/parent.mp4');
    assert.equal(peekContinueStitch('child-1'), null);
  });

  it('builds parent then child stitch shots', () => {
    assert.deepEqual(continueStitchShots('https://a/p.mp4', 'https://a/c.mp4'), [
      { url: 'https://a/p.mp4', title: 'Parent clip', kind: 'clip' },
      { url: 'https://a/c.mp4', title: 'Continue take', kind: 'clip' },
    ]);
  });
});
