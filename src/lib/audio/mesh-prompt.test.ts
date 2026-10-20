import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUDIO_MESH_WORKFLOW_TOKENS,
  AUDIO_SECONDS_TOKEN,
  MESH_RESOLUTION_TOKEN,
  buildAudioPrompt,
  buildMeshPrompt,
} from './mesh-prompt';

describe('audio-mesh-prompt', () => {
  it('exposes the AUDIO_SECONDS_TOKEN and MESH_RESOLUTION_TOKEN placeholder strings', () => {
    assert.equal(AUDIO_SECONDS_TOKEN, '{{AUDIO_SECONDS}}');
    assert.equal(MESH_RESOLUTION_TOKEN, '{{MESH_RESOLUTION}}');
  });

  it('bundles both tokens into AUDIO_MESH_WORKFLOW_TOKENS', () => {
    assert.deepEqual(AUDIO_MESH_WORKFLOW_TOKENS, ['{{AUDIO_SECONDS}}', '{{MESH_RESOLUTION}}']);
  });

  describe('buildAudioPrompt', () => {
    it('returns just the trimmed subject when nothing else is given', () => {
      assert.equal(buildAudioPrompt({ subject: '  rain on a tin roof  ' }), 'rain on a tin roof');
    });

    it('appends mood, instruments, and duration parts when present', () => {
      const result = buildAudioPrompt({
        subject: 'a jazz cafe',
        mood: 'relaxed',
        instruments: 'piano, upright bass',
        durationSec: 30,
      });
      assert.equal(
        result,
        'a jazz cafe. mood: relaxed. instruments: piano, upright bass. duration about 30s'
      );
    });

    it('omits blank/whitespace-only mood and instruments', () => {
      const result = buildAudioPrompt({ subject: 'wind chimes', mood: '   ', instruments: '' });
      assert.equal(result, 'wind chimes');
    });

    it('omits the duration part when durationSec is zero or negative', () => {
      assert.equal(buildAudioPrompt({ subject: 'x', durationSec: 0 }), 'x');
      assert.equal(buildAudioPrompt({ subject: 'x', durationSec: -5 }), 'x');
    });
  });

  describe('buildMeshPrompt', () => {
    it('always appends the "clean topology, readable silhouette" suffix', () => {
      const result = buildMeshPrompt({ subject: 'a small robot' });
      assert.equal(result, 'a small robot. clean topology, readable silhouette');
    });

    it('appends materials and style parts when present', () => {
      const result = buildMeshPrompt({
        subject: 'a wooden chair',
        materials: 'oak, brass',
        style: 'mid-century',
      });
      assert.equal(
        result,
        'a wooden chair. materials: oak, brass. style: mid-century. clean topology, readable silhouette'
      );
    });

    it('omits blank/whitespace-only materials and style', () => {
      const result = buildMeshPrompt({ subject: 'a vase', materials: '  ', style: undefined });
      assert.equal(result, 'a vase. clean topology, readable silhouette');
    });

    it('trims the subject before use', () => {
      const result = buildMeshPrompt({ subject: '  a lamp  ' });
      assert.equal(result, 'a lamp. clean topology, readable silhouette');
    });
  });
});
