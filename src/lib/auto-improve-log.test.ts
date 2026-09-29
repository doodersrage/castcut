import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarizeAutoImproveLog } from './auto-improve-log';
import { activeAutoImproveActions } from '../components/settings/panels/sections/SettingsComfyConnectionAutoImproveSection';

describe('auto-improve summary', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = 100 * day;

  it('counts only the last 7 days, largest kind first', () => {
    const summary = summarizeAutoImproveLog(
      [
        { at: now - 8 * day, kind: 'mutations', count: 9 },
        { at: now - 2 * day, kind: 'Final re-queues', count: 1 },
        { at: now - day, kind: 'mutations', count: 3 },
        { at: now - 3600, kind: 'mutations', count: 3 },
      ],
      now
    );
    assert.equal(summary.total, 7);
    assert.deepEqual(summary.byKind, [
      ['mutations', 6],
      ['Final re-queues', 1],
    ]);
    assert.equal(summarizeAutoImproveLog(null, now).total, 0);
  });

  it('lists what is on', () => {
    assert.deepEqual(
      activeAutoImproveActions({
        autoRequeueFinalOnHighRating: true,
        autoRequeueMaxOnFiveStar: true,
        autoMutateOnHighRating: true,
        autoSeedExperimentOnHighRating: true,
        autoRefineOnLowRating: true,
      } as never),
      ['Final on 4–5★', 'Max on 5★', 'mutations on 4–5★', 'seed experiments on 4–5★', 'open Refine on 1–2★']
    );
    assert.deepEqual(
      activeAutoImproveActions({ autoRequeueFinalOnHighRating: false, autoRequeueMaxOnFiveStar: false, autoRefineOnLowRating: false } as never),
      []
    );
  });
});
