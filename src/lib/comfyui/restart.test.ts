import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMFYUI_RESTART_UNAVAILABLE,
  requestComfyUiRestart,
} from './restart';

describe('requestComfyUiRestart', () => {
  it('uses the first Manager reboot path that returns ok', async () => {
    const calls: string[] = [];
    const result = await requestComfyUiRestart('http://127.0.0.1:8188', (async url => {
      calls.push(String(url));
      return new Response('{}', { status: 200 });
    }) as typeof fetch);
    assert.deepEqual(result, { ok: true, via: '/api/manager/reboot' });
    assert.deepEqual(calls, ['http://127.0.0.1:8188/api/manager/reboot']);
  });

  it('falls through 404s and reports Manager missing', async () => {
    const result = await requestComfyUiRestart('http://10.0.0.5:8188/', (async () => {
      return new Response('nope', { status: 404 });
    }) as typeof fetch);
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error('expected failure');
    }
    assert.equal(result.missingManager, true);
    assert.equal(result.error, COMFYUI_RESTART_UNAVAILABLE);
  });

  it('treats connection reset as a restart in progress', async () => {
    const result = await requestComfyUiRestart('http://127.0.0.1:8188', (async () => {
      throw new Error('ECONNRESET');
    }) as typeof fetch);
    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error('expected success');
    }
    assert.equal(result.via, '/api/manager/reboot');
  });
});
