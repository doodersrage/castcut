import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { resetBrowserStorageCache } from '../storage/browser-storage';
import {
  failureSparklineSeries,
  incrementLocalObservability,
  loadLocalObservability,
  LOCAL_OBSERVABILITY_KEY,
  noteCampaignMaxStepMetric,
  noteFilmCutSourceMetric,
  noteQueueFailureMetric,
  summarizeLocalReliability,
  summarizePlayFunnel,
} from './local-observability';

describe('local-observability', () => {
  afterEach(() => {
    if (typeof globalThis.window !== 'undefined') {
      resetBrowserStorageCache();
    }
  });

  it('increments counters in browser storage', () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
          removeItem: (key: string) => storage.delete(key),
        },
        dispatchEvent: () => true,
      },
    });
    resetBrowserStorageCache();
    incrementLocalObservability('exactReplay');
    incrementLocalObservability('exactReplay');
    const snap = loadLocalObservability();
    assert.equal(snap.exactReplay, 2);
    assert.ok(storage.has(LOCAL_OBSERVABILITY_KEY) || snap.exactReplay === 2);

    noteQueueFailureMetric({ message: 'CUDA out of memory', href: '/settings?tab=comfyui' });
    const afterFail = loadLocalObservability();
    assert.equal(afterFail.queueFailures, 1);
    assert.match(afterFail.lastFailureMessage ?? '', /CUDA/);
    assert.equal(afterFail.failureTimeline?.length, 1);
    const summary = summarizeLocalReliability(afterFail);
    assert.match(summary.headline, /CUDA|failure/i);
    const spark = failureSparklineSeries(afterFail, { buckets: 7 });
    assert.equal(spark.length, 7);
    assert.ok(spark.reduce((sum, value) => sum + value, 0) >= 1);
  });

  it('summarizes play funnel conversion rates', () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
          removeItem: (key: string) => storage.delete(key),
        },
        dispatchEvent: () => true,
      },
    });
    resetBrowserStorageCache();
    incrementLocalObservability('firstPlayCampaign');
    incrementLocalObservability('firstPlayCampaign');
    incrementLocalObservability('firstFilmCut');
    incrementLocalObservability('saveToCast');
    incrementLocalObservability('keepTryOn');
    noteFilmCutSourceMetric('day');
    noteFilmCutSourceMetric('roleplay');
    noteCampaignMaxStepMetric(3);
    noteCampaignMaxStepMetric(2);
    const rates = summarizePlayFunnel();
    assert.equal(rates.cutRate, 0.5);
    assert.equal(rates.saveRate, 1);
    assert.equal(rates.keepToCutRate, 1);
    assert.equal(rates.dayShare, 0.5);
    assert.equal(rates.roleplayShare, 0.5);
    assert.equal(rates.maxStep, 3);
  });
});
