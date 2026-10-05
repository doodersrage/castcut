import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  headsSameEnd,
  KEPT_INTIMATE_ID_PREFIX,
  keptIntimateGuide,
  keptIntimateLayout,
  keptIntimateLibraryEntry,
} from './pose-kept-intimate';
import type { NormalizedBody } from './pose-library';
import type { DetectedPose } from './pose-score';

function detectedFrom(people: NormalizedBody[], aspect: number): DetectedPose {
  return { canvas: { width: Math.round(1000 * aspect), height: 1000 }, people };
}

describe('keptIntimateLayout', () => {
  it('learns the one-shape two-person layouts only', () => {
    assert.equal(keptIntimateLayout('missionary'), 'missionary');
    assert.equal(keptIntimateLayout('straddle'), 'straddle');
    assert.equal(keptIntimateLayout('spoon'), 'spoon');
    // Words change the shape under one key, or Rapid draws another pose.
    for (const layout of ['oral', 'wall', 'bent', 'sixty_nine', 'facesit']) {
      assert.equal(keptIntimateLayout(layout), null, layout);
    }
    for (const layout of ['solo', 'kneel', 'walk', '', null, undefined]) {
      assert.equal(keptIntimateLayout(layout), null, String(layout));
    }
  });
});

describe('keptIntimateLibraryEntry', () => {
  for (const layout of ['missionary', 'straddle', 'reverse_straddle', 'spoon', 'lap'] as const) {
    it(`files a two-body read that holds the ${layout} drawing, lead first`, () => {
      const guide = keptIntimateGuide(layout);
      assert.equal(guide.keypoints.length, 2);
      // The read comes back partner first (largest body first): the entry puts the lead first.
      const read = keptIntimateLibraryEntry({
        layout,
        detected: detectedFrom([guide.keypoints[1]!, guide.keypoints[0]!], guide.aspect),
        takeId: 'abc-123',
        now: 5,
      });
      assert.equal(read.ok, true, JSON.stringify(read));
      if (!read.ok) return;
      assert.equal(read.entry.key, `${layout}:2`);
      assert.ok(read.entry.id.startsWith(KEPT_INTIMATE_ID_PREFIX));
      assert.ok(read.entry.id.endsWith('-abc-123'));
      assert.deepEqual(read.entry.people, guide.keypoints);
      assert.equal(read.entry.score, 1);
      assert.equal(read.entry.createdAt, 5);
    });
  }

  it('skips a merged read (one body) and a half-read body', () => {
    const guide = keptIntimateGuide('missionary');
    const one = keptIntimateLibraryEntry({
      layout: 'missionary',
      detected: detectedFrom([guide.keypoints[0]!], guide.aspect),
    });
    assert.deepEqual(one, { ok: false, why: 'people' });
    const legless = guide.keypoints[1]!.map((point, index) =>
      [9, 10, 12, 13].includes(index) ? null : point
    );
    const partial = keptIntimateLibraryEntry({
      layout: 'missionary',
      detected: detectedFrom([guide.keypoints[0]!, legless], guide.aspect),
    });
    assert.deepEqual(partial, { ok: false, why: 'partial' });
  });

  it('skips a read whose bodies hold another layout', () => {
    // Two standing bodies filed as missionary: a still that isn't the layout (or a bad read).
    const standing = keptIntimateGuide('standing');
    const wrong = keptIntimateLibraryEntry({
      layout: 'missionary',
      detected: detectedFrom(standing.keypoints, standing.aspect),
    });
    assert.deepEqual(wrong, { ok: false, why: 'posture' });
  });

  it('skips a lying couple head to head (his body running the other way)', () => {
    const guide = keptIntimateGuide('missionary');
    const [lead, partner] = guide.keypoints as [NormalizedBody, NormalizedBody];
    // Turn the partner end for end about his own hips' centre.
    const hips = [partner[8], partner[11]].filter(Boolean) as Array<{ x: number; y: number }>;
    const cx = hips.reduce((sum, p) => sum + p.x, 0) / hips.length;
    const flipped = partner.map(p => (p ? { x: 2 * cx - p.x, y: p.y } : null));
    const read = keptIntimateLibraryEntry({
      layout: 'missionary',
      detected: detectedFrom([lead, flipped], guide.aspect),
      guide,
    });
    assert.equal(read.ok, false);
    assert.ok(headsSameEnd(lead, partner, { width: 2, height: 3 }));
    assert.ok(!headsSameEnd(lead, flipped, { width: 2, height: 3 }));
  });

  it('never learns a layout outside the list', () => {
    const guide = keptIntimateGuide('missionary');
    assert.deepEqual(
      keptIntimateLibraryEntry({
        layout: 'oral',
        detected: detectedFrom(guide.keypoints, guide.aspect),
      }),
      { ok: false, why: 'layout' }
    );
  });
});
