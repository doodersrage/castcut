import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { likenessModelLabel, likenessTrend, type LikenessEntry } from './likeness-trend';

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date(2026, 9, 1, 12).getTime();

function still(day: number, face: number, extra: Partial<LikenessEntry> = {}): LikenessEntry {
  return {
    characterId: 'nora',
    lookId: 'everyday',
    model: 'qwen_image_edit_2511_fp8mixed.safetensors',
    completedAt: t0 + day * DAY,
    playChecks: { face },
    ...extra,
  };
}

describe('likenessTrend', () => {
  it('takes the median per day for this Cast and look only', () => {
    const trend = likenessTrend({
      characterId: 'nora',
      lookId: 'everyday',
      entries: [
        still(0, 0.6),
        still(0, 0.7),
        still(0, 0.9),
        still(1, 0.65),
        still(1, 0.2, { lookId: 'gala' }),
        still(1, 0.2, { characterId: 'sam' }),
        { ...still(2, 0.5), playChecks: {} },
      ],
    });
    assert.deepEqual(
      trend.points.map(point => [Math.round(point.face * 100), point.count]),
      [
        [70, 3],
        [65, 1],
      ]
    );
    assert.equal(trend.warn, false);
    assert.equal(trend.drift, null);
  });

  it('counts entries with no look for the Cast’s current look', () => {
    const trend = likenessTrend({
      characterId: 'nora',
      lookId: 'everyday',
      defaultLookId: 'everyday',
      entries: [{ ...still(0, 0.6), lookId: undefined }],
    });
    assert.equal(trend.points.length, 1);
  });

  it('warns on a clear fall after a plate change, and marks the change', () => {
    const before = Array.from({ length: 8 }, (_, index) => still(index, 0.68));
    const after = Array.from({ length: 6 }, (_, index) => still(10 + index, 0.58));
    const trend = likenessTrend({
      characterId: 'nora',
      lookId: 'everyday',
      entries: [...before, ...after],
      plateHistory: [{ replacedAt: t0 + 9 * DAY + 3600_000 }],
    });
    assert.equal(trend.warn, true);
    assert.equal(Math.round(trend.drift!.before * 100), 68);
    assert.equal(Math.round(trend.drift!.recent * 100), 58);
    assert.equal(trend.plateChanges.length, 1);
  });

  it('warns when recent stills sit under the Day warn bar', () => {
    const trend = likenessTrend({
      characterId: 'nora',
      lookId: 'everyday',
      entries: [still(0, 0.5), still(1, 0.52), still(2, 0.48)],
    });
    assert.equal(trend.warn, true);
  });

  it('names engines', () => {
    assert.equal(likenessModelLabel('Qwen-Rapid-AIO-SFW-v23.safetensors'), 'Rapid AIO');
    assert.equal(likenessModelLabel('qwen_image_edit_2511_fp8mixed.safetensors'), 'Edit 2511');
  });
});
