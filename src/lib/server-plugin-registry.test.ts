import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { applyServerQueueHookMutation } from './server-plugin-hooks';
import {
  installServerPluginFromManifest,
  installServerPluginFromZip,
  listServerPlugins,
  removeServerPlugin,
  signPluginPayload,
  verifyPluginInstallSignature,
} from './server-plugin-registry';
import { extractPluginZip, normalizeZipPath, pickPluginManifestFromZip } from './plugin-zip';
import { normalizePluginManifest } from './plugin-manifest';

function buildStoreZip(files: Array<{ path: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.path, 'utf8');
    const compressed = deflateRawSync(file.data);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    parts.push(local, compressed);

    const cen = Buffer.alloc(46 + nameBuf.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(0, 16);
    cen.writeUInt32LE(compressed.length, 20);
    cen.writeUInt32LE(file.data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    nameBuf.copy(cen, 46);
    central.push(cen);
    offset += local.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, end]);
}

describe('phase6 server plugins', () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  const previousSecret = process.env.PROMPT_PLUGIN_HMAC_SECRET;
  let tempDir = '';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-plugins-'));
    process.env.PROMPT_DATA_DIR = tempDir;
    delete process.env.PROMPT_PLUGIN_HMAC_SECRET;
  });

  after(() => {
    if (previousDataDir) process.env.PROMPT_DATA_DIR = previousDataDir;
    else delete process.env.PROMPT_DATA_DIR;
    if (previousSecret) process.env.PROMPT_PLUGIN_HMAC_SECRET = previousSecret;
    else delete process.env.PROMPT_PLUGIN_HMAC_SECRET;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('normalizes zip paths and rejects traversal', () => {
    assert.equal(normalizeZipPath('manifest.json'), 'manifest.json');
    assert.equal(normalizeZipPath('../etc/passwd'), 'etc/passwd');
    assert.equal(normalizeZipPath('dir/'), 'dir/');
  });

  it('extracts a plugin ZIP and installs under PROMPT_DATA_DIR/plugins', () => {
    const manifest = {
      id: 'zip-demo',
      label: 'ZIP demo',
      version: '1.0.0',
      queueHooks: {
        url: '/api/plugin-hooks/denoise-rewrite',
        events: ['queue-preflight', 'queue-post'],
        privileges: ['rewrite-prompt', 'rewrite-workflow'],
      },
    };
    const zip = buildStoreZip([
      { path: 'manifest.json', data: Buffer.from(JSON.stringify(manifest), 'utf8') },
      { path: 'readme.txt', data: Buffer.from('hello', 'utf8') },
    ]);
    const entries = extractPluginZip(zip);
    assert.ok(entries.some(entry => entry.path === 'manifest.json'));
    const picked = pickPluginManifestFromZip(entries);
    assert.ok(picked.manifestRaw.includes('zip-demo'));

    const installed = installServerPluginFromZip(zip);
    assert.equal(installed.id, 'zip-demo');
    assert.ok(installed.privileges.includes('rewrite-workflow'));
    assert.ok(fs.existsSync(path.join(installed.installPath, 'manifest.json')));
    assert.ok(fs.existsSync(path.join(installed.installPath, 'readme.txt')));
    assert.equal(listServerPlugins().length, 1);
    assert.equal(removeServerPlugin('zip-demo'), true);
  });

  it('installs from manifest JSON and verifies HMAC when configured', () => {
    const record = installServerPluginFromManifest({
      id: 'json-demo',
      label: 'JSON demo',
      version: '0.2.0',
      queueHooks: { url: 'http://127.0.0.1:9/hook', events: ['queue-preflight'] },
    });
    assert.equal(record.id, 'json-demo');
    assert.deepEqual(record.privileges.sort(), ['rewrite-params', 'rewrite-prompt'].sort());

    process.env.PROMPT_PLUGIN_HMAC_SECRET = 'test-secret';
    const body = Buffer.from('payload');
    const sig = signPluginPayload(body);
    assert.equal(verifyPluginInstallSignature(body, sig).ok, true);
    assert.equal(verifyPluginInstallSignature(body, 'deadbeef').ok, false);
    const expected = createHmac('sha256', 'test-secret').update(body).digest('hex');
    assert.equal(sig, expected);
    delete process.env.PROMPT_PLUGIN_HMAC_SECRET;
    removeServerPlugin('json-demo');
  });

  it('applies privileged mutations and ignores disallowed workflow rewrite', () => {
    const base = {
      event: 'queue-preflight' as const,
      prompt: 'cat',
      denoise: 0.5,
      workflow: { '1': { class_type: 'CLIPTextEncode', inputs: { text: 'cat' } } },
    };
    const withWorkflow = applyServerQueueHookMutation(
      base,
      { prompt: 'dog', workflow: { '1': { class_type: 'CLIPTextEncode', inputs: { text: 'dog' } } } },
      ['rewrite-prompt']
    );
    assert.equal(withWorkflow.payload.prompt, 'dog');
    assert.deepEqual(withWorkflow.payload.workflow, base.workflow);

    const allowed = applyServerQueueHookMutation(
      base,
      {
        workflow: { '1': { class_type: 'CLIPTextEncode', inputs: { text: 'dog' } } },
        denoise: 0.8,
      },
      ['rewrite-workflow', 'rewrite-params']
    );
    assert.equal(allowed.payload.workflow?.['1'] && (allowed.payload.workflow['1'] as { inputs: { text: string } }).inputs.text, 'dog');
    assert.equal(allowed.payload.denoise, 0.8);
  });

  it('normalizes queueHook privileges on manifests', () => {
    const manifest = normalizePluginManifest({
      id: 'priv',
      label: 'Priv',
      version: '1',
      queueHooks: {
        url: '/api/hook',
        events: ['queue-preflight', 'queue-post'],
        privileges: ['rewrite-workflow', 'nope'],
      },
    });
    assert.deepEqual(manifest?.queueHooks?.privileges, ['rewrite-workflow']);
    assert.deepEqual(manifest?.queueHooks?.events, ['queue-preflight', 'queue-post']);
  });
});
