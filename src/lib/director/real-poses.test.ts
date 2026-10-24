import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parsePoseReferences } from '@/lib/pose/references';
import { openPoseWorld, projectRig } from '@/lib/pose/rig3d-pose';
import { rigFromWorldReference } from '@/lib/pose/rig3d-world';
import {
  starterFigure,
  knownStillPoseFigure,
  realPoseFigure,
  referenceStillPoseFigure,
  shapeError,
} from './poses';
import { mirrorWorldReference } from '@/lib/pose/rig3d-world';
import { RIG3D_VERSION, type PoseRig3d } from '@/lib/pose/rig3d';
import { DEFAULT_CAMERA } from '@/lib/pose/rig3d-pose';

const ROOT = join(__dirname, '..', '..', '..');
const references = parsePoseReferences(
  JSON.parse(readFileSync(join(ROOT, 'public/pose-references.json'), 'utf8'))
);
const ref = (id: string) => references.find(r => r.id === id)!;

describe('Director: real poses from motion capture', () => {
  it('a real pose beat is the captured body, on the floor in her own frame', () => {
    const figure = realPoseFigure(ref('bend_pick-1').world!, 'female');
    const w = openPoseWorld(figure);
    const hips = w[8]!.clone().add(w[11]!).multiplyScalar(0.5);
    assert.ok(Math.hypot(hips.x, hips.z) < 0.05, 'hips over the origin');
    assert.ok(Math.min(w[10]!.y, w[13]!.y) < 0.15, 'feet down');
    // Bent over: the neck no higher than the hips (a lift from her side read it standing tall).
    assert.ok(w[1]!.y < hips.y + 0.25, `neck ${w[1]!.y} hips ${hips.y}`);
    // Her right foot on her right, her left on her left.
    const across = w[11]!.clone().sub(w[8]!).setY(0).normalize();
    assert.ok(w[10]!.clone().sub(hips).dot(across) < 0);
    assert.ok(w[13]!.clone().sub(hips).dot(across) > 0);
  });

  it('starts from the 3D pose the still was posed with when the still shows it', () => {
    const rig = rigFromWorldReference(ref('bend_pick-1').world!, 0.75, ['female']);
    const still = projectRig(rig, 0.75)[0]!;
    const known = knownStillPoseFigure(rig, still, 0.75, 'female');
    assert.ok(known, 'the 3D pose is used');
    // Seen from her side, as the still is.
    assert.ok(known.turned > 60 && known.turned < 120, `${known.turned}`);
  });

  it('lifts the still instead when it shows another pose, or another body', () => {
    const rig = rigFromWorldReference(ref('bend_pick-1').world!, 0.75, ['female']);
    const standing: PoseRig3d = {
      version: RIG3D_VERSION,
      figures: [starterFigure('stand', 'female')],
      camera: DEFAULT_CAMERA,
    };
    const stillOfStanding = projectRig(standing, 0.75)[0]!;
    assert.equal(knownStillPoseFigure(rig, stillOfStanding, 0.75, 'female'), null);
    assert.equal(knownStillPoseFigure(rig, projectRig(rig, 0.75)[0]!, 0.75, 'male'), null);
  });

  it('compares shapes, not framing', () => {
    const body = ref('bend_pick-2').people[0]!;
    const moved = body.map(p => (p ? { x: 0.2 + p.x * 0.5, y: 0.1 + p.y * 0.5 } : null));
    assert.ok(shapeError(body, moved, 0.8) < 1e-6);
    assert.ok(shapeError(body, ref('stretch-1').people[0]!, 0.8) > 0.12);
  });

  it('finds the real pose a Try-another still was made from, mirrored or not', () => {
    const world = ref('bend_pick-2').world!;
    for (const shown of [world, mirrorWorldReference(world)]) {
      const rig = rigFromWorldReference(shown, 0.75, ['female']);
      const still = projectRig(rig, 0.75)[0]!;
      assert.ok(referenceStillPoseFigure(references, 'bend_pick', still, 0.75, 'female'));
      // Not a pose the slot was picked as: lifted instead.
      assert.equal(referenceStillPoseFigure(references, 'wave', still, 0.75, 'female'), null);
    }
    assert.equal(referenceStillPoseFigure(references, undefined, ref('bend_pick-2').people[0]!, 0.75, 'female'), null);
  });
});
