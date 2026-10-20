import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { galleryFailureSummary } from './failure-summary';

describe('galleryFailureSummary', () => {
  it('keeps the first clause of a long message', () => {
    assert.equal(
      galleryFailureSummary(
        'Job not found — ComfyUI no longer has it (it restarted or its queue was cleared). Queue it again.'
      ),
      'Job not found'
    );
    assert.equal(galleryFailureSummary('Cancelled'), 'Cancelled');
    assert.equal(
      galleryFailureSummary('Diffusers job not found (engine restarted or id lost).'),
      'Diffusers job not found (engine restarted or id lost)'
    );
  });

  it('shortens a traceback on a word boundary', () => {
    const out = galleryFailureSummary(
      'Error(s) in loading state_dict for QwenImageTransformer2DModel size mismatch for transformer_blocks.0.attn'
    );
    assert.ok(out.length <= 61, out);
    assert.ok(out.endsWith('…'));
  });

  it('says Failed when there is no message', () => {
    assert.equal(galleryFailureSummary(undefined), 'Failed');
    assert.equal(galleryFailureSummary('  '), 'Failed');
  });
});
