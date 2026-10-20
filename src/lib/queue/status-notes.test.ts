import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatComfyHostLabel, joinQueueStatusNotes } from './status-notes';

describe('formatComfyHostLabel', () => {
  it('returns null for a blank/undefined url', () => {
    assert.equal(formatComfyHostLabel(undefined), null);
    assert.equal(formatComfyHostLabel('   '), null);
  });

  it('extracts host:port when a port is present', () => {
    assert.equal(formatComfyHostLabel('http://192.168.1.5:8188'), '192.168.1.5:8188');
  });

  it('adds a default scheme when one is missing, and omits the port when absent', () => {
    assert.equal(formatComfyHostLabel('example.com'), 'example.com');
  });

  it('falls back to the trimmed-of-trailing-slashes raw string when URL parsing fails', () => {
    assert.equal(formatComfyHostLabel('not a valid url///'), 'not a valid url');
  });
});

describe('joinQueueStatusNotes', () => {
  it('joins only the non-empty base parts when there is no pipeline', () => {
    assert.equal(joinQueueStatusNotes(['queued', null, undefined, 'variation']), 'queued · variation');
  });

  it('appends a host label derived from pipeline.comfyUrl', () => {
    const result = joinQueueStatusNotes(['queued'], { comfyUrl: 'http://127.0.0.1:8188' });
    assert.equal(result, 'queued · host 127.0.0.1:8188');
  });

  it('appends pipeline quality-profile notes after the host label', () => {
    const result = joinQueueStatusNotes([], { qualityProfile: 'final', comfyUrl: '127.0.0.1:8188' });
    // For an unspecified model, the final/max branch of
    // formatQueuePipelineStatusNotes also appends an upscale note (neural
    // vs Lanczos, decided by profileUsesNeuralUpscaleEnrich for the empty
    // model string) -- verified against the real output rather than assumed.
    assert.equal(result, 'host 127.0.0.1:8188 · Good · neural → ~1.25×');
  });

  it('surfaces a VRAM-downgraded note instead of the plain profile label', () => {
    const result = joinQueueStatusNotes([], { qualityProfile: 'max', vramDowngraded: true });
    assert.equal(result, 'Best → Good (VRAM) · neural → ~1.5×');
  });

  it('returns an empty string when there is nothing to join', () => {
    assert.equal(joinQueueStatusNotes([]), '');
  });

  it('includes a sampler-memory note when samplerMemory is set', () => {
    const result = joinQueueStatusNotes([], { samplerMemory: true });
    assert.equal(result, 'sampler memory');
  });
});
