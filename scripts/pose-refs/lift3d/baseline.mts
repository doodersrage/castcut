/**
 * Today's lift of every one-person reference (as the 3D editor opens a real pose without 3D:
 * toward its filed posture, the camera read from the picture), in the own frame — for
 * evaluate.py to score against the capture's true 3D and the trained lifter.
 *
 *   node --import tsx scripts/pose-refs/lift3d/baseline.mts OUT.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { parsePoseReferences } from '../../../src/lib/pose/references';
import { DEFAULT_CAMERA, liftBodies, openPoseWorld } from '../../../src/lib/pose/rig3d-pose';
import { figureFacing } from '../../../src/lib/pose/rig3d-camera';
import { posturesForReference } from '../../../src/lib/pose/rig3d-posture-points';

const refs = parsePoseReferences(JSON.parse(readFileSync('public/pose-references.json', 'utf8')));
const out: Record<string, number[][]> = {};
for (const ref of refs) {
  if (ref.people.length !== 1 || ref.editorOnly) continue;
  const rig = liftBodies([ref.people[0]!], ref.aspect, ['female'], DEFAULT_CAMERA, {
    postures: [posturesForReference(ref)],
    estimateCamera: true,
  });
  const figure = rig.figures[0]!;
  const w = openPoseWorld(figure);
  const hip = w[8]!.clone().add(w[11]!).multiplyScalar(0.5);
  const f = figureFacing(figure);
  const yaw = Math.atan2(f.x, f.z);
  out[ref.id] = w.map(p => {
    const v = new Vector3(p.x - hip.x, p.y, p.z - hip.z).applyAxisAngle(new Vector3(0, 1, 0), -yaw);
    return [v.x, v.y, v.z];
  });
}
writeFileSync(process.argv[2]!, JSON.stringify(out));
console.log(`${Object.keys(out).length} lifted`);
