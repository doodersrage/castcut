import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectComfyPoolUrls,
  formatPoolQueueStrip,
  summarizePoolQueueDepth,
  waitForComfyUiHostReady,
} from './host-ready';

describe('waitForComfyUiHostReady', () => {
  it('returns ok on the first successful probe', async () => {
    let now = 0;
    let probes = 0;
    const result = await waitForComfyUiHostReady({
      probe: async () => {
        probes += 1;
        return probes >= 3;
      },
      timeoutMs: 10_000,
      intervalMs: 50,
      initialDelayMs: 0,
      sleep: async ms => {
        now += ms;
      },
      now: () => now,
    });
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 3);
    assert.ok(result.waitedMs >= 100);
  });

  it('times out when the host never answers', async () => {
    let now = 0;
    const result = await waitForComfyUiHostReady({
      probe: async () => false,
      timeoutMs: 200,
      intervalMs: 50,
      initialDelayMs: 0,
      sleep: async ms => {
        now += ms;
      },
      now: () => now,
    });
    assert.equal(result.ok, false);
    assert.ok(result.attempts >= 1);
    assert.ok(result.waitedMs >= 200);
  });

  it('treats a throwing probe as still down', async () => {
    let now = 0;
    let probes = 0;
    const result = await waitForComfyUiHostReady({
      probe: async () => {
        probes += 1;
        if (probes < 2) {
          throw new Error('ECONNREFUSED');
        }
        return true;
      },
      timeoutMs: 5_000,
      intervalMs: 10,
      initialDelayMs: 0,
      sleep: async ms => {
        now += ms;
      },
      now: () => now,
    });
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
  });
});

describe('summarizePoolQueueDepth', () => {
  it('sums running/pending across pool hosts', () => {
    const summary = summarizePoolQueueDepth([
      { url: 'http://127.0.0.1:8188', ok: true, queueRunning: 1, queuePending: 2 },
      { url: 'http://127.0.0.1:8189/', ok: true, queueRunning: 0, queuePending: 1 },
    ]);
    assert.equal(summary.totalRunning, 1);
    assert.equal(summary.totalPending, 3);
    assert.match(formatPoolQueueStrip(summary), /Pool 1 running · 3 pending/);
    assert.match(formatPoolQueueStrip(summary), /127\.0\.0\.1:8188 1\/2/);
  });

  it('falls back to a single host when the pool is empty', () => {
    const summary = summarizePoolQueueDepth(
      [],
      { url: 'http://127.0.0.1:8188', ok: true, queueRunning: 2, queuePending: 0 }
    );
    assert.equal(summary.hosts.length, 1);
    assert.equal(formatPoolQueueStrip(summary), 'ComfyUI queue: 2 running · 0 pending');
  });
});

describe('collectComfyPoolUrls', () => {
  it('dedupes trailing slashes and case', () => {
    assert.deepEqual(
      collectComfyPoolUrls({
        primary: 'http://127.0.0.1:8188/',
        settingsUrl: 'http://127.0.0.1:8188',
        extras: ['http://127.0.0.1:8189/', ''],
        healthUrls: ['HTTP://127.0.0.1:8189', 'http://10.0.0.5:8188'],
      }),
      ['http://127.0.0.1:8188', 'http://127.0.0.1:8189', 'http://10.0.0.5:8188']
    );
  });
});
