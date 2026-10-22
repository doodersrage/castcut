import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { NormalizedBody } from '@/lib/pose/library';
import { projectFigure } from '@/lib/pose/rig3d-pose';
import { frameDirection, framingCameraAt, readStillFraming } from './framing';
import { stillPoseFigure } from './poses';
import { DEFAULT_DIRECTOR_CAMERA, normalizeDirectorCamera } from './types';

const ROOT = join(__dirname, '..', '..', '..');

function meanError(a: NormalizedBody, b: NormalizedBody, aspect: number) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < 14; i += 1) {
    const p = a[i];
    const q = b[i];
    if (!p || !q) continue;
    sum += Math.hypot((p.x - q.x) * aspect, p.y - q.y);
    count += 1;
  }
  return sum / Math.max(1, count);
}

describe('Director: her pose in the picture', () => {
  it('the preview’s first frame matches the still’s pose, across the reference poses', () => {
    const refs = JSON.parse(readFileSync(join(ROOT, 'public/pose-references.json'), 'utf8')) as {
      references: Array<{ id: string; aspect: number; people: NormalizedBody[] }>;
    };
    const solo = refs.references.filter(ref => ref.people.length === 1 && ref.people[0]![1]);
    assert.ok(solo.length > 200);
    let sum = 0;
    const off: string[] = [];
    for (const ref of solo) {
      const body = ref.people[0]!;
      const { figure, view } = stillPoseFigure(body, ref.aspect, 'female');
      const framing = frameDirection({
        frames: [figure],
        camera: { ...DEFAULT_DIRECTOR_CAMERA, view },
        aspect: ref.aspect,
        still: readStillFraming(body),
      });
      const error = meanError(
        body,
        projectFigure(figure, framingCameraAt(framing, 0), ref.aspect),
        ref.aspect
      );
      sum += error;
      if (error > 0.03) off.push(`${ref.id} ${(error * 100).toFixed(1)}%`);
    }
    // Measured 2026-10-22: 0.63% of the picture height on average, 272 of 273 within 3%. Before
    // (the still's direction rounded to front / three-quarter / side, the head set level, the
    // camera pulled back from a still that crops her) it was 8.75%, 92 of 273.
    assert.ok(sum / solo.length < 0.012, `mean ${sum / solo.length}`);
    assert.ok(off.length <= solo.length * 0.03, `off: ${off.join(', ')}`);
  });

  it('the still’s camera survives storage', () => {
    const view = { position: [0.1, 0.9, 4] as [number, number, number], target: [0, 0.9, 0] as [number, number, number], fov: 30 };
    assert.deepEqual(normalizeDirectorCamera({ ...DEFAULT_DIRECTOR_CAMERA, view }).view, view);
    assert.equal(normalizeDirectorCamera({ ...DEFAULT_DIRECTOR_CAMERA, view: { fov: 30 } }).view, undefined);
  });
});
