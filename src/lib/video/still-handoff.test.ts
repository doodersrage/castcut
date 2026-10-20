import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveVideoStillHandoffEngine } from './still-handoff';

describe('video still handoff', () => {
  it('keeps the current Fal or Replicate engine', () => {
    assert.equal(
      resolveVideoStillHandoffEngine({
        engine: 'fal',
        comfyOk: true,
        falReady: true,
        replicateReady: true,
      }),
      'fal'
    );
    assert.equal(
      resolveVideoStillHandoffEngine({
        engine: 'replicate',
        comfyOk: false,
        falReady: true,
        replicateReady: true,
      }),
      'replicate'
    );
  });

  it('does not steal OpenAI / Gemini / Grok', () => {
    assert.equal(
      resolveVideoStillHandoffEngine({
        engine: 'openai',
        comfyOk: false,
        falReady: true,
        replicateReady: true,
      }),
      null
    );
  });

  it('prefers Fal when Comfy is down and both keys exist, else Replicate', () => {
    assert.equal(
      resolveVideoStillHandoffEngine({
        engine: 'comfyui',
        comfyOk: false,
        falReady: true,
        replicateReady: true,
      }),
      'fal'
    );
    assert.equal(
      resolveVideoStillHandoffEngine({
        engine: 'comfyui',
        comfyOk: false,
        falReady: false,
        replicateReady: true,
      }),
      'replicate'
    );
    assert.equal(
      resolveVideoStillHandoffEngine({
        engine: 'comfyui',
        comfyOk: true,
        falReady: true,
        replicateReady: true,
      }),
      null
    );
  });
});
