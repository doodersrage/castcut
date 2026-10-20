import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cutGenerateCanvas,
  cutGenerateClipPrompt,
  cutGenerateStillPrompt,
  cutGeneratedTitle,
} from './cut-generate';

describe('cut generated shots', () => {
  it('renders in the cut shape', () => {
    assert.deepEqual(cutGenerateCanvas('wide'), { width: 1472, height: 832 });
    assert.deepEqual(cutGenerateCanvas('vertical'), { width: 832, height: 1472 });
    for (const shape of ['wide', 'vertical', 'square'] as const) {
      const { width, height } = cutGenerateCanvas(shape);
      assert.equal(width % 16, 0);
      assert.equal(height % 16, 0);
    }
  });

  it('frames the words as a film still and a moving shot', () => {
    assert.equal(
      cutGenerateStillPrompt('  rain on a  café window.  '),
      'A cinematic film still: rain on a café window. Photoreal, natural light, shot on a cinema camera, one continuous frame.'
    );
    assert.match(cutGenerateClipPrompt('the harbour at dawn'), /^the harbour at dawn\. One continuous shot/);
    assert.equal(cutGeneratedTitle('x'.repeat(60)).length, 40);
  });
});
