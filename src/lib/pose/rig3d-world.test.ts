import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Vector3 } from 'three';
import {
  parsePoseReferences,
  poseReferencesFor,
  readPoseReferenceWorld,
  type PoseReference,
} from './references';
import {
  cameraAzimuthAround,
  cameraForChoice,
  cameraFromView,
  markLiftedView,
  turnedFromLiftedView,
} from './rig3d-camera';
import { DEFAULT_CAMERA, liftBodies, openPoseWorld, projectRig } from './rig3d-pose';
import { mirrorWorldReference, rigFromWorldReference } from './rig3d-world';
import { normalizePoseRig3d } from './rig3d';

const references = parsePoseReferences(
  JSON.parse(readFileSync(join(process.cwd(), 'public/pose-references.json'), 'utf8'))
);
const withWorld = references.filter(ref => ref.world);
const byId = (id: string) => references.find(ref => ref.id === id)!;

const BONES: Array<[number, number]> = [
  [1, 8],
  [1, 11],
  [2, 3],
  [3, 4],
  [5, 6],
  [6, 7],
  [8, 9],
  [9, 10],
  [11, 12],
  [12, 13],
];

function backView(ref: PoseReference) {
  const rig = rigFromWorldReference(ref.world!, 0.75, ['female']);
  const camera = cameraForChoice(
    rig,
    { direction: 'back', height: 'eye', shot: 'full', lens: 'normal' },
    0.75
  );
  return { rig: { ...rig, camera }, body: projectRig({ ...rig, camera }, 0.75)[0]! };
}

describe('motion-capture references in 3D', () => {
  it('ships captured 3D for every motion-capture and drawn reference; photos only estimated', () => {
    for (const ref of references) {
      const captured = ref.source === 'cmu-mocap' || ref.source === 'drawn';
      if (captured) assert.ok(ref.world && !ref.world.estimated, ref.id);
      else if (ref.world) assert.equal(ref.world.estimated, true, ref.id);
    }
  });

  it('reads a photo pose’s 3D only when it is marked estimated', () => {
    const body = Array.from({ length: 18 }, (_, i) => [0, i / 10, 0] as [number, number, number]);
    const view = { azimuthDeg: 0, elevationDeg: 8 };
    const flat = byId('wave-1');
    const entry = (world: unknown) =>
      parsePoseReferences({ references: [{ ...flat, world }] })[0]!.world;
    assert.equal(entry({ people: [body], view }), undefined);
    assert.equal(entry({ people: [body], view, estimated: true })?.estimated, true);
  });

  it('builds each figure with its bones along the captured directions', () => {
    const off: string[] = [];
    for (const ref of withWorld) {
      const rig = rigFromWorldReference(ref.world!, ref.aspect, ['female', 'male']);
      ref.world!.people.forEach((captured, index) => {
        const posed = openPoseWorld(rig.figures[index]!);
        for (const [a, b] of BONES) {
          const pa = captured[a];
          const pb = captured[b];
          if (!pa || !pb) continue;
          const want = new Vector3(...pb).sub(new Vector3(...pa));
          const got = posed[b]!.clone().sub(posed[a]!);
          const degrees = (got.angleTo(want) * 180) / Math.PI;
          if (degrees > 15) off.push(`${ref.id}#${index} ${a}-${b}: ${degrees.toFixed(0)}°`);
        }
      });
    }
    assert.deepEqual(off, []);
  });

  it('turned round, a side-view bend keeps her legs under her (user report 2026-10-24)', () => {
    for (const id of ['bend_pick-1', 'bend_pick-3', 'bend_pick-5']) {
      const { rig, body } = backView(byId(id));
      const w = openPoseWorld(rig.figures[0]!);
      const across = w[11]!.clone().sub(w[8]!).setY(0).normalize();
      const hips = w[8]!.clone().add(w[11]!).multiplyScalar(0.5);
      const rAnkle = w[10]!.clone().sub(hips).dot(across);
      const lAnkle = w[13]!.clone().sub(hips).dot(across);
      // Right foot on her right, left on her left, neither swung out past a stride.
      assert.ok(rAnkle < 0 && lAnkle > 0, `${id}: feet crossed (${rAnkle}, ${lAnkle})`);
      assert.ok(Math.abs(rAnkle) < 0.4 && Math.abs(lAnkle) < 0.4, `${id}: feet splayed`);
      // Bent over, seen from behind: the head is hidden behind her back — no face drawn.
      assert.equal(body[0], null, `${id}: nose drawn through her back`);
      assert.equal(body[14], null);
      assert.equal(body[15], null);
    }
  });

  it('stands the camera where the reference was seen from', () => {
    for (const id of ['bend_pick-1', 'bend_pick-2', 'bend_pick-4']) {
      const ref = byId(id);
      const rig = rigFromWorldReference(ref.world!, ref.aspect, ['female']);
      const turn = cameraAzimuthAround(rig) - ref.world!.view.azimuthDeg;
      const wrapped = Math.abs(Math.atan2(Math.sin((turn * Math.PI) / 180), Math.cos((turn * Math.PI) / 180)));
      assert.ok((wrapped * 180) / Math.PI < 10, `${id}: camera ${cameraAzimuthAround(rig)}°`);
    }
  });

  it('lists a moment’s other views in the editor but leaves them out of “Try another”', () => {
    const extra = references.filter(ref => ref.editorOnly);
    assert.ok(extra.length > 0);
    assert.ok(extra.every(ref => ref.world && ref.source === 'cmu-mocap'));
    assert.ok(extra.some(ref => ref.pose === 'bend_pick'));
    const walked = poseReferencesFor(references, 'bend_pick', 1);
    assert.ok(walked.length > 0 && walked.every(ref => !ref.editorOnly));
  });

  it('mirrors a pose left for right, as the picture is mirrored', () => {
    const world = byId('dance-1').world!;
    assert.deepEqual(mirrorWorldReference(mirrorWorldReference(world)), world);
    const plain = projectRig(rigFromWorldReference(world, 1, ['female', 'male']), 1);
    const mirrored = projectRig(
      rigFromWorldReference(mirrorWorldReference(world), 1, ['female', 'male']),
      1
    );
    // The lead stands on the other side of her partner.
    const x = (body: (typeof plain)[number]) => (body[8]!.x + body[11]!.x) / 2;
    assert.notEqual(x(plain[0]!) < x(plain[1]!), x(mirrored[0]!) < x(mirrored[1]!));
  });

  it('reads only a whole 3D body with a view', () => {
    const body = Array.from({ length: 18 }, (_, i) => [0, i / 10, 0] as [number, number, number]);
    const view = { azimuthDeg: 90, elevationDeg: 8 };
    assert.ok(readPoseReferenceWorld({ people: [body], view }, 1));
    assert.equal(readPoseReferenceWorld({ people: [body], view }, 2), null);
    assert.equal(readPoseReferenceWorld({ people: [body.slice(0, 17)], view }, 1), null);
    const noHip = body.map((p, i) => (i === 8 ? null : p));
    assert.equal(readPoseReferenceWorld({ people: [noHip], view }, 1), null);
    assert.equal(readPoseReferenceWorld({ people: [body] }, 1), null);
  });
});

describe('a flat pose turned far from the view it was read in', () => {
  const ref = byId('bend_pick-1');
  const lifted = markLiftedView(
    liftBodies([ref.people[0]!], ref.aspect, ['female'], DEFAULT_CAMERA, { estimateCamera: false })
  );

  it('remembers its view and measures the turn from it', () => {
    assert.ok(lifted.liftedFrom);
    assert.ok(turnedFromLiftedView(lifted)! < 1);
    const behind = {
      ...lifted,
      camera: cameraFromView(
        lifted,
        { azimuthDeg: lifted.liftedFrom!.azimuthDeg + 180, elevationDeg: 0 },
        0.75
      ),
    };
    assert.ok(turnedFromLiftedView(behind)! > 170);
  });

  it('is not flagged when posed in 3D, and keeps the mark through saving', () => {
    assert.equal(turnedFromLiftedView(rigFromWorldReference(ref.world!, 0.75, ['female'])), null);
    const saved = normalizePoseRig3d(JSON.parse(JSON.stringify(lifted)), 1);
    assert.deepEqual(saved?.liftedFrom, lifted.liftedFrom);
    // Estimated 3D is marked as such, and that survives saving too.
    const estimated = markLiftedView(lifted, { estimated: true });
    assert.equal(estimated.liftedFrom?.estimated, true);
    assert.equal(normalizePoseRig3d(JSON.parse(JSON.stringify(estimated)), 1)?.liftedFrom?.estimated, true);
  });
});
