import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildNewGpuEnvSnippet,
  parseAllowedHostsField,
  parseComfyGpuUrl,
} from './gpu-env-snippet';

describe('parseComfyGpuUrl', () => {
  it('strips trailing slashes and lowercases the hostname', () => {
    const parsed = parseComfyGpuUrl('http://127.0.0.1:8189/');
    assert.deepEqual(parsed, { url: 'http://127.0.0.1:8189', hostname: '127.0.0.1' });
  });

  it('rejects non-http URLs', () => {
    assert.equal(parseComfyGpuUrl('ftp://127.0.0.1:8188'), null);
    assert.equal(parseComfyGpuUrl('not-a-url'), null);
  });
});

describe('parseAllowedHostsField', () => {
  it('treats the unrestricted summary as empty', () => {
    assert.deepEqual(parseAllowedHostsField('any (no allowlist)'), []);
  });

  it('splits comma-separated hosts', () => {
    assert.deepEqual(parseAllowedHostsField('127.0.0.1, gpu-b.local'), ['127.0.0.1', 'gpu-b.local']);
  });
});

describe('buildNewGpuEnvSnippet', () => {
  it('merges the new host into pool and allowlist lines', () => {
    const result = buildNewGpuEnvSnippet({
      newUrl: 'http://192.168.1.20:8188',
      existingPoolUrls: ['http://127.0.0.1:8188'],
      existingAllowedHosts: ['127.0.0.1'],
    });
    assert.ok(!('error' in result));
    assert.equal(result.hostname, '192.168.1.20');
    assert.match(result.snippet, /COMFYUI_POOL=http:\/\/127\.0\.0\.1:8188,http:\/\/192\.168\.1\.20:8188/);
    assert.match(result.snippet, /COMFYUI_ALLOWED_HOSTS=127\.0\.0\.1,192\.168\.1\.20/);
    assert.match(result.snippet, /paste into \.env\.local/);
  });

  it('does not duplicate an already-listed URL', () => {
    const result = buildNewGpuEnvSnippet({
      newUrl: 'http://127.0.0.1:8188/',
      existingPoolUrls: ['http://127.0.0.1:8188'],
    });
    assert.ok(!('error' in result));
    assert.equal(result.snippet.includes('http://127.0.0.1:8188,http://127.0.0.1:8188'), false);
  });
});
