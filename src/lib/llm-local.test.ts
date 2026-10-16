import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { getLlmConfig, getVisionModel } from './llm-client';
import { ensureLocalLlmFor, LOCAL_LLM_ALIAS, registerLocalLlmHooks } from './llm-local';
import { LOCAL_LLM_MODELS, LOCAL_LLM_RELEASE, lmStudioCopy, localLlmAsset } from './llm-local-server';

describe('the built-in LLM', () => {
  afterEach(() => {
    registerLocalLlmHooks({ config: () => null, ensure: async () => {}, stop: async () => false });
  });

  it('picks the llama.cpp build for the machine, and says why there is none', () => {
    assert.deepEqual(localLlmAsset('linux', 'x64', true), {
      name: `llama-${LOCAL_LLM_RELEASE}-bin-ubuntu-vulkan-x64.tar.gz`,
    });
    assert.deepEqual(localLlmAsset('win32', 'x64', true), {
      name: `llama-${LOCAL_LLM_RELEASE}-bin-win-vulkan-x64.zip`,
    });
    assert.deepEqual(localLlmAsset('darwin', 'arm64', true), {
      name: `llama-${LOCAL_LLM_RELEASE}-bin-macos-arm64.tar.gz`,
    });
    // The Alpine Docker image (musl) can't run llama.cpp's builds.
    const alpine = localLlmAsset('linux', 'x64', false);
    assert.ok('unsupported' in alpine && /LLM_API_BASE_URL/.test(alpine.unsupported));
  });

  it("reuses a model LM Studio already downloaded (same repo layout)", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lmstudio-'));
    const choice = LOCAL_LLM_MODELS[0]!;
    assert.equal(lmStudioCopy(choice, home), null);
    const dir = path.join(home, '.lmstudio', 'models', ...choice.repo.split('/'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, choice.file), '');
    assert.equal(lmStudioCopy(choice, home), null, 'needs the vision projector too');
    fs.writeFileSync(path.join(dir, choice.mmproj), '');
    assert.deepEqual(lmStudioCopy(choice, home), {
      model: path.join(dir, choice.file),
      mmproj: path.join(dir, choice.mmproj),
    });
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('when on, LLM calls go to it — a hosted provider picked in the browser still wins', async () => {
    let started = 0;
    registerLocalLlmHooks({
      config: () => ({ baseUrl: 'http://127.0.0.1:8191/v1', model: LOCAL_LLM_ALIAS }),
      ensure: async () => {
        started += 1;
      },
      stop: async () => true,
    });
    assert.deepEqual(getLlmConfig(), {
      baseUrl: 'http://127.0.0.1:8191/v1',
      apiKey: '',
      model: LOCAL_LLM_ALIAS,
      visionModel: LOCAL_LLM_ALIAS,
    });
    assert.equal(getVisionModel(), LOCAL_LLM_ALIAS);
    assert.equal(
      getLlmConfig({ baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'k' }).baseUrl,
      'https://openrouter.ai/api/v1'
    );
    await ensureLocalLlmFor('http://127.0.0.1:8191/v1/');
    await ensureLocalLlmFor('https://openrouter.ai/api/v1');
    assert.equal(started, 1, 'only calls that go to it start it');
  });

  it('when off (or not installed), nothing changes', () => {
    process.env.LLM_API_BASE_URL = 'http://127.0.0.1:1234/v1';
    assert.equal(getLlmConfig().baseUrl, 'http://127.0.0.1:1234/v1');
    delete process.env.LLM_API_BASE_URL;
  });
});
