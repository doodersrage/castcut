import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { browserComfyUrl } from './open-in-comfy';

describe('Open in ComfyUI link as the browser can reach it', () => {
  it('keeps loopback on this machine', () => {
    assert.equal(
      browserComfyUrl('http://127.0.0.1:8188/?template=castcut-x&source=castcut-nodes', 'localhost'),
      'http://127.0.0.1:8188/?template=castcut-x&source=castcut-nodes'
    );
  });
  it('swaps a loopback ComfyUI for the host the page came from', () => {
    assert.equal(browserComfyUrl('http://127.0.0.1:8188/', '192.168.1.20'), 'http://192.168.1.20:8188/');
    assert.equal(browserComfyUrl('http://localhost:8188', 'studio.lan'), 'http://studio.lan:8188/');
  });
  it('leaves a real address alone', () => {
    assert.equal(browserComfyUrl('http://gpu-box:8188/', '192.168.1.20'), 'http://gpu-box:8188/');
  });
});
