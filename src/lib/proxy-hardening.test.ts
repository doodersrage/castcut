import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { rateLimitClientKey } from './api-rate-limit';
import { isComfyClientUrlAllowed } from './url-safety';
import { assertPublicFetchUrl } from './url-safety-server';

const saved = { ...process.env };
afterEach(() => {
  for (const key of ['TRUST_PROXY_HEADERS', 'COMFYUI_ALLOW_CLIENT_URL', 'PROMPT_AUTH_ENABLED']) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('behind a reverse proxy', () => {
  it('keys a client on the address the proxy saw, not the one the visitor wrote', () => {
    process.env.TRUST_PROXY_HEADERS = 'true';
    const spoofed = new Request('http://x/api/auth/login', {
      headers: { 'x-forwarded-for': '1.2.3.4, 198.51.100.9' },
    });
    assert.equal(rateLimitClientKey(spoofed), '198.51.100.9');
    const realIp = new Request('http://x/', {
      headers: { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '198.51.100.20' },
    });
    assert.equal(rateLimitClientKey(realIp), '198.51.100.20');
    delete process.env.TRUST_PROXY_HEADERS;
    assert.equal(rateLimitClientKey(spoofed), 'local');
  });

  it('only lets a request pick its ComfyUI address with login off, unless set', () => {
    delete process.env.COMFYUI_ALLOW_CLIENT_URL;
    process.env.PROMPT_AUTH_ENABLED = 'true';
    assert.equal(isComfyClientUrlAllowed(), false);
    process.env.PROMPT_AUTH_ENABLED = 'false';
    assert.equal(isComfyClientUrlAllowed(), true);
    process.env.PROMPT_AUTH_ENABLED = 'true';
    process.env.COMFYUI_ALLOW_CLIENT_URL = 'true';
    assert.equal(isComfyClientUrlAllowed(), true);
  });

  it('refuses server fetches to private or local addresses unless named', async () => {
    for (const url of ['http://127.0.0.1:8188/prompt', 'http://192.168.1.1/', 'http://[::1]/', 'http://localhost/x']) {
      await assert.rejects(assertPublicFetchUrl(url), /private or local|not allowed/i, url);
    }
    await assert.rejects(assertPublicFetchUrl('http://169.254.169.254/latest/meta-data'));
    const ok = await assertPublicFetchUrl('http://127.0.0.1:8188/view', {
      allowOrigins: ['http://127.0.0.1:8188'],
    });
    assert.equal(ok.hostname, '127.0.0.1');
    // The allowed origin is exact: another port on the same host is still refused.
    await assert.rejects(
      assertPublicFetchUrl('http://127.0.0.1:1234/v1/models', { allowOrigins: ['http://127.0.0.1:8188'] })
    );
    const pub = await assertPublicFetchUrl('http://93.184.216.34/');
    assert.equal(pub.hostname, '93.184.216.34');
  });
});
