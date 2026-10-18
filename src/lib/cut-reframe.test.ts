import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import {
  cropWidthFraction,
  reframeCropX,
  reframePath,
  reframeSampleTimes,
  reframeScaleFilter,
} from './cut-reframe';

describe('cut reframe', () => {
  it('sizes the crop window from the two shapes', () => {
    assert.equal(cropWidthFraction({ width: 1920, height: 1080 }, { width: 1080, height: 1920 }).toFixed(4), '0.3164');
    assert.equal(cropWidthFraction({ width: 720, height: 1280 }, { width: 1080, height: 1920 }), 1);
  });

  it('centres on the face, inside the picture, holding still when it barely moves', () => {
    assert.equal(reframePath([{ t: 0, cx: null }], 0.3), null);
    assert.equal(reframePath([{ t: 0, cx: 0.5 }], 1), null);
    // Face at the far right: the window stops at the edge.
    assert.deepEqual(reframePath([{ t: 0, cx: 0.95 }, { t: 2, cx: 0.96 }], 0.3), [{ t: 0, x: 0.7 }]);
    // Face walks left to right: the window follows (smoothed), gaps take the nearest face.
    const path = reframePath(
      [
        { t: 0, cx: 0.2 },
        { t: 1.5, cx: null },
        { t: 3, cx: 0.5 },
        { t: 4.5, cx: 0.8 },
      ],
      0.3
    )!;
    assert.equal(path.length, 4);
    assert.ok(path[0]!.x < path[3]!.x);
    assert.ok(path.every(p => p.x >= 0 && p.x <= 0.7));
  });

  it('writes a crop ffmpeg accepts', () => {
    const path = [
      { t: 0, x: 0.1 },
      { t: 2, x: 0.4 },
      { t: 4, x: 0.6 },
    ];
    assert.equal(reframeCropX([{ t: 0, x: 0.25 }]), 'iw*0.25');
    const filter = reframeScaleFilter(path, { width: 270, height: 480 });
    try {
      // A left-to-right brightness ramp: the window moving right gets brighter.
      const out = execFileSync(
        'ffmpeg',
        [
          '-v', 'error', '-f', 'lavfi', '-i', 'nullsrc=s=640x360:d=5:r=10,geq=lum=X/2.6:cb=128:cr=128',
          '-filter_complex', `[0:v]${filter},signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-[v]`,
          '-map', '[v]', '-f', 'null', '-',
        ],
        { encoding: 'utf8' }
      );
      const luma = [...out.matchAll(/YAVG=([0-9.]+)/g)].map(m => Number(m[1]));
      assert.ok(luma.length > 10);
      assert.ok(luma[luma.length - 1]! > luma[0]! + 40, `${luma[0]} → ${luma[luma.length - 1]}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  });

  it('looks every ~1.5 s through a clip', () => {
    assert.deepEqual(reframeSampleTimes(0), [0]);
    assert.deepEqual(reframeSampleTimes(3), [0, 1.5, 2.95]);
    assert.equal(reframeSampleTimes(60).length, 8);
  });
});

describe('cut reframe at a moment', () => {
  it('reads the path as the crop expression moves', async () => {
    const { reframeXAt } = await import('./cut-reframe');
    const path = [
      { t: 1, x: 0.1 },
      { t: 3, x: 0.5 },
    ];
    assert.equal(reframeXAt(path, 0), 0.1);
    assert.equal(reframeXAt(path, 2), 0.30000000000000004);
    assert.equal(reframeXAt(path, 9), 0.5);
  });
});
