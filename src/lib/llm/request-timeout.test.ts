import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_LLM_REQUEST_TIMEOUT_MS,
  fetchLlm,
  llmRequestTimeoutMs,
  LlmTimeoutError,
} from './request-timeout';

/** A fetch that answers after `ms`, or never; it honours the abort signal. */
const slowFetch = (ms: number | null) =>
  ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const timer = ms === null ? null : setTimeout(() => resolve(new Response('ok')), ms);
      init?.signal?.addEventListener('abort', () => {
        if (timer) clearTimeout(timer);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    })) as typeof fetch;

describe('LLM request timeout', () => {
  it('a model that never answers fails with a plain reason instead of hanging', async () => {
    await assert.rejects(fetchLlm('http://llm/x', {}, 30, slowFetch(null)), (error: unknown) => {
      assert.ok(error instanceof LlmTimeoutError);
      assert.match(String((error as Error).message), /didn't start answering.*LM Studio/);
      return true;
    });
  });

  it('an answer in time comes through; the caller can still cancel', async () => {
    const response = await fetchLlm('http://llm/x', {}, 200, slowFetch(5));
    assert.equal(await response.text(), 'ok');
    const caller = new AbortController();
    const pending = fetchLlm('http://llm/x', { signal: caller.signal }, 1000, slowFetch(null));
    caller.abort();
    await assert.rejects(pending, (error: unknown) => !(error instanceof LlmTimeoutError));
  });

  it('LLM_REQUEST_TIMEOUT_MS sets the limit; 0 means none', () => {
    assert.equal(llmRequestTimeoutMs({}), DEFAULT_LLM_REQUEST_TIMEOUT_MS);
    assert.equal(llmRequestTimeoutMs({ LLM_REQUEST_TIMEOUT_MS: '60000' }), 60000);
    assert.equal(llmRequestTimeoutMs({ LLM_REQUEST_TIMEOUT_MS: '0' }), 0);
    assert.equal(llmRequestTimeoutMs({ LLM_REQUEST_TIMEOUT_MS: 'soon' }), DEFAULT_LLM_REQUEST_TIMEOUT_MS);
  });
});
