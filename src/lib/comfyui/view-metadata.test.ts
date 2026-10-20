import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractSafetensorsTriggerPhrase } from './view-metadata';

describe('extractSafetensorsTriggerPhrase', () => {
  it('prefers modelspec.trigger_phrase', () => {
    assert.equal(
      extractSafetensorsTriggerPhrase({
        'modelspec.trigger_phrase': 'ohwx woman',
        ss_output_name: 'portrait',
      }),
      'ohwx woman'
    );
  });

  it('reads nested Kohya ss_tag_frequency', () => {
    const phrase = extractSafetensorsTriggerPhrase({
      ss_tag_frequency: JSON.stringify({
        img_dir: { '1girl': 120, solo: 80, smile: 10 },
      }),
    });
    assert.equal(phrase, '1girl, solo, smile');
  });

  it('reads a flat tag-frequency map', () => {
    const phrase = extractSafetensorsTriggerPhrase({
      ss_tag_frequency: JSON.stringify({ cyberpunk: 50, neon: 20 }),
    });
    assert.equal(phrase, 'cyberpunk, neon');
  });

  it('returns empty for missing or garbage metadata', () => {
    assert.equal(extractSafetensorsTriggerPhrase(null), '');
    assert.equal(extractSafetensorsTriggerPhrase({ ss_tag_frequency: 'not-json' }), '');
  });
});
