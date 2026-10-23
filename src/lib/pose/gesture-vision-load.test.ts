import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VISION_LOAD_RETRY_WAITS_MS,
  retryOnVisionLoadFailure,
  visionModelLoadFailed,
} from './gesture-vision-client';

test('LM Studio "Failed to load model" is the error worth freeing ComfyUI for', () => {
  assert.equal(
    visionModelLoadFailed(
      'LLM request failed (400): Failed to load model "nsfwvision-qwen3-vl-8b-v3". Error: Model loading aborted'
    ),
    true
  );
  assert.equal(visionModelLoadFailed('LLM request failed (500): context length exceeded'), false);
  assert.equal(visionModelLoadFailed(undefined), false);
});

const LOAD_FAILED = {
  response: { ok: false },
  data: { error: 'LLM request failed (400): Failed to load model "nsfwvision-qwen3-vl-8b-v3".' },
};
const ANSWERED = { response: { ok: true }, data: { error: undefined } };

function harness(replies: Array<typeof LOAD_FAILED | typeof ANSWERED>) {
  const log: string[] = [];
  let index = 0;
  return {
    log,
    askOnce: async () => {
      log.push('ask');
      return replies[Math.min(index++, replies.length - 1)]!;
    },
    free: async () => {
      log.push('free');
    },
    sleep: async (ms: number) => {
      log.push(`wait ${ms}`);
    },
  };
}

test('a vision model that will not load is retried across a render, freeing ComfyUI each time', async () => {
  // The live Noct-Q miss: both of the old two tries failed while the next slot rendered.
  const run = harness([LOAD_FAILED, LOAD_FAILED, ANSWERED]);
  const reply = await retryOnVisionLoadFailure(run.askOnce, run);
  assert.equal(reply, ANSWERED);
  assert.deepEqual(run.log, ['ask', 'free', 'wait 4000', 'ask', 'free', 'wait 12000', 'ask']);
});

test('the retries stop after the last wait; other errors and answers are not retried', async () => {
  const never = harness([LOAD_FAILED]);
  assert.equal(await retryOnVisionLoadFailure(never.askOnce, never), LOAD_FAILED);
  assert.equal(never.log.filter(entry => entry === 'ask').length, 1 + VISION_LOAD_RETRY_WAITS_MS.length);

  const other = { response: { ok: false }, data: { error: 'context length exceeded' } };
  const once = harness([other]);
  assert.equal(await retryOnVisionLoadFailure(once.askOnce, once), other);
  assert.deepEqual(once.log, ['ask']);

  const answered = harness([ANSWERED]);
  await retryOnVisionLoadFailure(answered.askOnce, answered);
  assert.deepEqual(answered.log, ['ask']);
});
