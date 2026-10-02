import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pollIntervalForActiveJobs } from './comfyui-gallery-client';

describe('pollIntervalForActiveJobs', () => {
  it('keeps the 2 s poll for one or two jobs and spreads out as more wait', () => {
    assert.equal(pollIntervalForActiveJobs(2000, 0), 2000);
    assert.equal(pollIntervalForActiveJobs(2000, 1), 2000);
    assert.equal(pollIntervalForActiveJobs(2000, 2), 2000);
    assert.equal(pollIntervalForActiveJobs(2000, 8), 5600);
    assert.equal(pollIntervalForActiveJobs(2000, 20), 14000);
  });

  it('stays under the 120-a-minute API limit however many jobs wait', () => {
    for (const jobs of [1, 3, 4, 8, 16, 40]) {
      const perMinute = (60_000 / pollIntervalForActiveJobs(2000, jobs)) * jobs;
      assert.ok(perMinute <= 90, `${jobs} jobs → ${perMinute.toFixed(0)} polls a minute`);
    }
  });
});
