import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderBackendFromHealth } from './render-backend-health';

describe('renderBackendFromHealth', () => {
  it('offline when ComfyUI (and Diffusers) do not answer, or the app server itself did not', () => {
    assert.equal(renderBackendFromHealth({ comfyui: { ok: false }, llm: { ok: true } }).state, 'offline');
    assert.equal(renderBackendFromHealth(null).state, 'offline');
  });
  it('online with ComfyUI, with Diffusers, or on a cloud engine', () => {
    assert.equal(renderBackendFromHealth({ comfyui: { ok: true } }).state, 'online');
    assert.equal(renderBackendFromHealth({ comfyui: { ok: false }, diffusers: { ok: true } }).state, 'online');
    assert.equal(renderBackendFromHealth({ comfyui: { ok: false } }, { cloudEngine: true }).state, 'online');
  });
  it('reports the LLM separately', () => {
    assert.equal(renderBackendFromHealth({ comfyui: { ok: true }, llm: { ok: false } }).llmOk, false);
  });
});
