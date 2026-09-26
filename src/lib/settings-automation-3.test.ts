import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  checkEngineKey,
  interpretKeyCheck,
  KEY_CHECK_ENGINES,
  keyCheckRequest,
  resolveKeyToCheck,
} from './engine-key-check';
import { CLOUD_ENGINE_IDS } from './engine/capabilities';
import { gpuSettingsPatch, gpuSettingsSuggestion } from './gpu-settings-match';
import { DEFAULT_SHARED_SETTINGS } from './settings-cache';

const GB = 1e9;

describe('match settings to the GPU', () => {
  it('sizes render and quality to the card', () => {
    assert.deepEqual(
      [8, 12, 16, 24, 48].map(gb => {
        const s = gpuSettingsSuggestion(gb * GB)!;
        return `${s.sizeTier}/${s.qualityProfile}`;
      }),
      ['small/draft', 'small/final', 'medium/final', 'max/final', 'max/max']
    );
    assert.equal(
      gpuSettingsSuggestion(24 * GB)?.label,
      '24 GB card → Max size · Final quality'
    );
    assert.equal(gpuSettingsSuggestion(undefined), null);
  });

  it('only changes settings still at their defaults', () => {
    const suggestion = gpuSettingsSuggestion(24 * GB)!;
    assert.deepEqual(gpuSettingsPatch({ ...DEFAULT_SHARED_SETTINGS }, DEFAULT_SHARED_SETTINGS, suggestion), {
      modelResolutionSizeTier: 'max',
      queueQualityProfile: 'final',
    });
    assert.deepEqual(
      gpuSettingsPatch(
        { ...DEFAULT_SHARED_SETTINGS, queueQualityProfile: 'draft' },
        DEFAULT_SHARED_SETTINGS,
        suggestion
      ),
      { modelResolutionSizeTier: 'max' },
      'a quality you picked stays'
    );
    assert.deepEqual(
      gpuSettingsPatch(
        { ...DEFAULT_SHARED_SETTINGS, modelResolutionSizeTier: 'small', queueQualityProfile: 'max' },
        DEFAULT_SHARED_SETTINGS,
        suggestion
      ),
      {}
    );
  });
});

describe('check hosted-engine keys', () => {
  const realFetch = globalThis.fetch;
  const savedFal = process.env.FAL_KEY;
  afterEach(() => {
    globalThis.fetch = realFetch;
    if (savedFal === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = savedFal;
  });

  it('covers every cloud engine with an authenticated, free request', () => {
    assert.deepEqual([...KEY_CHECK_ENGINES].sort(), [...CLOUD_ENGINE_IDS].sort());
    for (const engine of KEY_CHECK_ENGINES) {
      const request = keyCheckRequest(engine, 'k-123');
      assert.match(request.url, /^https:\/\//, engine);
      assert.ok(Object.values(request.headers).some(value => value.includes('k-123')), engine);
    }
    assert.equal(keyCheckRequest('fal', 'k').headers.Authorization, 'Key k');
    assert.equal(keyCheckRequest('runway', 'k').headers['X-Runway-Version'], '2024-11-06');
    assert.equal(keyCheckRequest('gemini', 'k').headers['x-goog-api-key'], 'k');
  });

  it('reads works / rejected / unsure from the answer', () => {
    assert.equal(interpretKeyCheck('openai', 200).ok, true);
    assert.equal(interpretKeyCheck('openai', 401).ok, false);
    assert.equal(interpretKeyCheck('replicate', 403).ok, false);
    assert.equal(interpretKeyCheck('fal', 404).ok, true, 'fal: good key, unknown request');
    assert.equal(interpretKeyCheck('gemini', 400, '{"error":"API key not valid."}').ok, false);
    assert.equal(interpretKeyCheck('grok', 429).ok, true);
    assert.match(interpretKeyCheck('luma', 402).message, /credit/);
    assert.equal(interpretKeyCheck('runway', 503).ok, null);
  });

  it('checks the typed key, else the server key, else says there is none', async () => {
    process.env.FAL_KEY = 'server-fal';
    assert.deepEqual(resolveKeyToCheck('fal', ' typed '), { key: 'typed', source: 'settings' });
    assert.deepEqual(resolveKeyToCheck('fal', ''), { key: 'server-fal', source: 'server' });
    delete process.env.FAL_KEY;
    const none = await checkEngineKey('fal', '');
    assert.equal(none.ok, false);
    assert.match(none.message, /No key/);
  });

  it('asks the provider and reports its answer', async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push(`${String(input)} ${JSON.stringify(init?.headers)}`);
      return new Response('{}', { status: String(input).includes('openai') ? 200 : 401 });
    }) as typeof fetch;
    assert.equal((await checkEngineKey('openai', 'good')).ok, true);
    const bad = await checkEngineKey('replicate', 'bad');
    assert.equal(bad.ok, false);
    assert.equal(bad.source, 'settings');
    assert.ok(seen[0]!.includes('api.openai.com/v1/models') && seen[0]!.includes('Bearer good'));
  });
});
