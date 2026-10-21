import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { llmOfflineNotice } from './offline-notice';

const down = {
  llm: { ok: false, enabled: true, baseUrl: 'http://localhost:1234/v1', error: 'fetch failed' },
  config: { llmEnabled: true },
};

describe('llmOfflineNotice', () => {
  it('shows when the LLM is on but not answering', () => {
    assert.deepEqual(llmOfflineNotice(down, {}), {
      baseUrl: 'http://localhost:1234/v1',
      error: 'fetch failed',
    });
  });

  it('stays hidden when the LLM answers, is off, or is not loaded yet', () => {
    assert.equal(llmOfflineNotice(null, {}), null);
    assert.equal(llmOfflineNotice({ llm: { ok: true } }, {}), null);
    assert.equal(llmOfflineNotice({ ...down, config: { llmEnabled: false } }, {}), null);
    assert.equal(llmOfflineNotice({ llm: { ...down.llm, enabled: false } }, {}), null);
  });

  it('respects this browser switching it off or using a hosted provider', () => {
    assert.equal(llmOfflineNotice(down, { sessionLlmEnabled: false }), null);
    assert.equal(llmOfflineNotice(down, { sessionLlmProvider: 'openrouter' }), null);
    assert.ok(llmOfflineNotice(down, { sessionLlmProvider: 'server' }));
  });
});
