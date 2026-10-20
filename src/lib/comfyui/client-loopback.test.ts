import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { getComfyUiBaseUrl } from './client';

const saved = {
  api: process.env.COMFYUI_API_URL,
  allow: process.env.COMFYUI_ALLOW_CLIENT_URL,
};

afterEach(() => {
  if (saved.api === undefined) delete process.env.COMFYUI_API_URL;
  else process.env.COMFYUI_API_URL = saved.api;
  if (saved.allow === undefined) delete process.env.COMFYUI_ALLOW_CLIENT_URL;
  else process.env.COMFYUI_ALLOW_CLIENT_URL = saved.allow;
});

describe('getComfyUiBaseUrl — browser loopback vs server COMFYUI_API_URL', () => {
  it('uses the server ComfyUI when the browser sends the 127.0.0.1 default (Docker)', () => {
    process.env.COMFYUI_API_URL = 'http://192.168.1.50:8188';
    process.env.COMFYUI_ALLOW_CLIENT_URL = 'true';
    assert.equal(getComfyUiBaseUrl({ apiUrl: 'http://127.0.0.1:8188' }), 'http://192.168.1.50:8188');
    assert.equal(getComfyUiBaseUrl({ apiUrl: 'http://localhost:8188' }), 'http://192.168.1.50:8188');
  });

  it('keeps a non-loopback browser URL', () => {
    process.env.COMFYUI_API_URL = 'http://192.168.1.50:8188';
    process.env.COMFYUI_ALLOW_CLIENT_URL = 'true';
    assert.equal(getComfyUiBaseUrl({ apiUrl: 'http://192.168.1.60:8188' }), 'http://192.168.1.60:8188');
  });

  it('keeps a loopback browser URL when the server ComfyUI is loopback or unset', () => {
    process.env.COMFYUI_ALLOW_CLIENT_URL = 'true';
    process.env.COMFYUI_API_URL = 'http://127.0.0.1:8188';
    assert.equal(getComfyUiBaseUrl({ apiUrl: 'http://127.0.0.1:8000' }), 'http://127.0.0.1:8000');
    delete process.env.COMFYUI_API_URL;
    assert.equal(getComfyUiBaseUrl({ apiUrl: 'http://127.0.0.1:8000' }), 'http://127.0.0.1:8000');
  });
});
