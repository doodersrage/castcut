import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLOUD_ENGINE_OPTIONS } from '../engine/capabilities';
import {
  SHARED_SECRET_FIELDS,
  extrasWithoutSecrets,
  settingsWithLocalSecrets,
  settingsWithoutSecrets,
  sharedWithLocalSecrets,
  sharedWithoutSecrets,
  webhookWithLocalSecret,
  webhookWithoutSecret,
} from './secret-fields';

describe('secret settings fields (R3)', () => {
  it("lists every cloud engine's key field and the LLM key", () => {
    const fields = new Set<string>(SHARED_SECRET_FIELDS);
    for (const option of CLOUD_ENGINE_OPTIONS) {
      assert.ok(fields.has(option.sessionTokenField), option.sessionTokenField);
    }
    assert.ok(fields.has('sessionLlmApiKey'));
  });

  it('strips credentials from what leaves, keeping everything else', () => {
    const shared = { sessionFalApiKey: 'fal-1', sessionLlmApiKey: 'llm-1', expandWildcards: false };
    assert.deepEqual(sharedWithoutSecrets(shared), { expandWildcards: false });
    assert.equal(sharedWithoutSecrets(shared).expandWildcards, false);
    const plain = { expandWildcards: true };
    assert.equal(sharedWithoutSecrets(plain), plain, 'same object when there is nothing to strip');

    const cache = { shared, tools: { day: { slots: [] } }, updatedAt: 5 };
    const out = settingsWithoutSecrets(cache);
    assert.equal(JSON.stringify(out).includes('fal-1'), false);
    assert.equal(JSON.stringify(out).includes('llm-1'), false);
    assert.equal(out.tools, cache.tools);
    assert.equal(cache.shared.sessionFalApiKey, 'fal-1', 'the local copy is untouched');
  });

  it("keeps this browser's credentials over an incoming copy's", () => {
    const incoming = { sessionFalApiKey: 'old-backup-key', sessionGrokApiKey: 'x', loraStack: 'a' };
    const local = { sessionFalApiKey: 'mine', sessionRunwayApiKey: '  ' };
    assert.deepEqual(sharedWithLocalSecrets(incoming, local), {
      loraStack: 'a',
      sessionFalApiKey: 'mine',
    });
    // No local keys: the incoming copy's are dropped, not adopted.
    assert.deepEqual(sharedWithLocalSecrets(incoming, undefined), { loraStack: 'a' });

    const merged = settingsWithLocalSecrets(
      { shared: { sessionLlmApiKey: 'server' }, tools: {} },
      { shared: { sessionLlmApiKey: 'mine' } }
    );
    assert.equal(merged.shared.sessionLlmApiKey, 'mine');
  });

  it("keeps the webhook signing secret this browser's", () => {
    const settings = { enabled: true, url: 'https://hooks.example/x', secret: 's3cret' };
    assert.deepEqual(webhookWithoutSecret(settings), {
      enabled: true,
      url: 'https://hooks.example/x',
    });
    assert.equal(webhookWithLocalSecret(settings, { secret: 'mine' }).secret, 'mine');
    assert.equal('secret' in webhookWithLocalSecret(settings, { secret: '' }), false);

    const extras = { updatedAt: 1, webhookSettings: settings, galleryElo: {} };
    const out = extrasWithoutSecrets(extras);
    assert.equal(JSON.stringify(out).includes('s3cret'), false);
    assert.equal(out.galleryElo, extras.galleryElo);
    const none = { updatedAt: 1 };
    assert.equal(extrasWithoutSecrets(none), none);
  });
});
