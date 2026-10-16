import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

describe('jobs-finished email: one per batch', async () => {
  const sent: Record<string, unknown>[] = [];
  let active = 0;
  beforeEach(() => {
    sent.length = 0;
    active = 0;
    (globalThis as { window?: unknown }).window = {};
    mock.timers.enable({ apis: ['setTimeout'] });
    (globalThis as { fetch?: unknown }).fetch = async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body) as Record<string, unknown>);
      return new Response('{}');
    };
  });
  afterEach(() => {
    mock.timers.reset();
    delete (globalThis as { window?: unknown }).window;
  });
  const email = await import('./job-completion-email');
  email.setJobCompletionEmailActiveCounter(() => active);
  const finish = (status: 'completed' | 'error' = 'completed') =>
    email.noteJobCompletionEmail({ promptId: 'p', status, prompt: 'a still' });

  it('a Day queued slot by slot is one email, sent when its last still lands', async () => {
    const release = email.holdJobCompletionEmail('Your Day', '/day');
    finish(); // morning lands while the afternoon is still being prepared — the queue is empty
    mock.timers.tick(60_000);
    assert.equal(sent.length, 0, 'the hold keeps it');
    active = 2; // afternoon and evening queued
    release();
    finish();
    active = 1;
    mock.timers.tick(60_000);
    assert.equal(sent.length, 0, 'a job still rendering keeps it');
    active = 0;
    finish('error');
    mock.timers.tick(8_000);
    await Promise.resolve();
    assert.equal(sent.length, 1);
    assert.deepEqual(
      { ...sent[0], lastPrompt: undefined },
      { completed: 2, failed: 1, title: 'Your Day', path: '/day', lastPrompt: undefined }
    );
  });

  it('a lone render still gets its email after a quiet moment', async () => {
    finish();
    mock.timers.tick(8_000);
    await Promise.resolve();
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.completed, 1);
    assert.equal(sent[0]!.title, undefined);
  });
});
