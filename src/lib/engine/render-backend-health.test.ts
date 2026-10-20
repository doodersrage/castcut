import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderBackendFromHealth, settleRenderBackend } from './render-backend-health';
import { comfyFetchErrorText } from '../server/service-health';

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
  it('names the address the server tried and why, when offline', () => {
    const status = renderBackendFromHealth({
      comfyui: { ok: false, url: 'http://192.168.12.43:8188', error: 'connection refused' },
    });
    assert.equal(status.comfyUrl, 'http://192.168.12.43:8188');
    assert.equal(status.error, 'connection refused');
    assert.equal(renderBackendFromHealth({ comfyui: { ok: true, url: 'x' } }).comfyUrl, undefined);
  });
});

describe('settleRenderBackend: one slow answer is not offline', () => {
  const online = { state: 'online' as const, llmOk: true };
  const miss = { state: 'offline' as const, llmOk: true, error: 'no answer within 8 seconds' };
  it('stays online after one miss, goes offline on the second, back online at once', () => {
    const first = settleRenderBackend(online, 0, miss);
    assert.equal(first.status.state, 'online');
    const second = settleRenderBackend(first.status, first.failures, miss);
    assert.equal(second.status.state, 'offline');
    assert.equal(second.status.error, 'no answer within 8 seconds');
    assert.equal(settleRenderBackend(second.status, second.failures, online).status.state, 'online');
  });
  it('the app server not answering counts the same way', () => {
    const first = settleRenderBackend(online, 0, renderBackendFromHealth(null));
    assert.equal(first.status.state, 'online');
  });
});

describe('comfyFetchErrorText', () => {
  it('says why in words', () => {
    const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    assert.match(comfyFetchErrorText(refused), /connection refused/);
    const timeout = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    assert.match(comfyFetchErrorText(timeout), /no answer within 8 seconds/);
    const other = Object.assign(new TypeError('fetch failed'), { cause: { code: 'EPROTO' } });
    assert.equal(comfyFetchErrorText(other), 'fetch failed (EPROTO)');
  });
});
