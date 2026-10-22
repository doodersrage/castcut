import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { NormalizedBody } from './library';
import { DEFAULT_CAMERA, liftBody, openPoseWorld, projectFigure } from './rig3d-pose';
import { classifyPosture, expectedPostures } from './rig3d-posture';

const ROOT = join(__dirname, '..', '..', '..');

type Ref = { id: string; pose: string; aspect: number; people: NormalizedBody[] };
const refs = (
  JSON.parse(readFileSync(join(ROOT, 'public/pose-references.json'), 'utf8')) as {
    references: Ref[];
  }
).references.filter(ref => ref.people.length === 1);
const lifted = refs.map(ref => ({ ref, figure: liftBody(ref.people[0]!, ref.aspect) }));

// Measured 2026-10-22 over the 273 one-person references (scripts/pose-3d/lift-check.mts).
describe('lifting the reference library into the 3D body', () => {
  it('the face is shown or hidden as the picture has it (no head turned away from a face)', () => {
    let flips = 0;
    const away: string[] = [];
    for (const { ref, figure } of lifted) {
      const body = ref.people[0]!;
      const back = projectFigure(figure, DEFAULT_CAMERA, ref.aspect);
      for (const i of [0, 14, 15, 16, 17]) if (Boolean(body[i]) !== Boolean(back[i])) flips += 1;
      if (body[0] && !back[0]) away.push(ref.id);
    }
    // Before: 133 face points flipped, 26 heads turned away where the picture shows a face.
    assert.ok(flips <= 40, `face points flipped: ${flips}`);
    assert.ok(away.length <= 3, `turned away: ${away.join(', ')}`);
  });

  it('a standing figure stands about upright in depth', () => {
    const leans: number[] = [];
    for (const { ref, figure } of lifted) {
      if (expectedPostures(ref.pose)?.[0] !== 'stand') continue;
      const p = openPoseWorld(figure);
      const hips = p[8]!.clone().add(p[11]!).multiplyScalar(0.5);
      const spine = p[1]!.clone().sub(hips);
      const toCamera = hips.clone().negate().setX(0).setY(0);
      toCamera.z += DEFAULT_CAMERA.position[2];
      toCamera.normalize();
      leans.push(Math.abs((Math.atan2(spine.dot(toCamera), spine.y) * 180) / Math.PI));
    }
    const mean = leans.reduce((s, v) => s + v, 0) / leans.length;
    // Before: 18° on average, 31 of 51 past 15° (the torso's keypoints sat too far apart).
    assert.ok(mean < 11, `mean lean ${mean.toFixed(1)}°`);
    assert.ok(leans.filter(v => v > 15).length <= 12, `${leans.filter(v => v > 15).length} past 15°`);
  });

  it('the posture is the one the reference is filed under (sit, kneel, lie, bend…)', () => {
    const checked = lifted.filter(({ ref }) => expectedPostures(ref.pose));
    const wrong = checked.filter(
      ({ ref, figure }) => !expectedPostures(ref.pose)!.includes(classifyPosture(figure))
    );
    // 96 of 106; the rest are pictures that read either way (a kneel facing the camera).
    assert.ok(checked.length > 100);
    assert.ok(
      wrong.length <= 13,
      wrong.map(({ ref, figure }) => `${ref.id}:${classifyPosture(figure)}`).join(' ')
    );
  });
});
