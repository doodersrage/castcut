import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bodyFacesAway,
  bodySeenFromBehind,
  fittingBackViewPose,
  photoPoseSeenFromBehind,
  rigSeenFromOtherSide,
} from '@/lib/fitting/back-pose';
import { cameraFromView } from '@/lib/pose/rig3d-camera';
import { projectRig, restFigure, DEFAULT_CAMERA } from '@/lib/pose/rig3d-pose';
import { RIG3D_VERSION, type PoseRig3d } from '@/lib/pose/rig3d';
import { customPoseWords } from '@/lib/pose/describe';
import type { NormalizedBody } from '@/lib/pose/library';
import type { PhotoPose } from '@/lib/pose/types';

/** COCO-18, facing the camera: her right shoulder (2) on the picture's left, her right arm up. */
function armUpFacing(): NormalizedBody {
  const body: NormalizedBody = Array.from({ length: 18 }, () => null);
  body[0] = { x: 0.5, y: 0.12 };
  body[1] = { x: 0.5, y: 0.22 };
  body[2] = { x: 0.42, y: 0.22 };
  body[3] = { x: 0.38, y: 0.12 };
  body[4] = { x: 0.37, y: 0.03 };
  body[5] = { x: 0.58, y: 0.22 };
  body[6] = { x: 0.6, y: 0.34 };
  body[7] = { x: 0.61, y: 0.45 };
  body[8] = { x: 0.45, y: 0.5 };
  body[9] = { x: 0.45, y: 0.7 };
  body[10] = { x: 0.45, y: 0.9 };
  body[11] = { x: 0.55, y: 0.5 };
  body[12] = { x: 0.55, y: 0.7 };
  body[13] = { x: 0.55, y: 0.9 };
  body[14] = { x: 0.48, y: 0.1 };
  body[15] = { x: 0.52, y: 0.1 };
  body[16] = { x: 0.46, y: 0.11 };
  body[17] = { x: 0.54, y: 0.11 };
  return body;
}

describe('bodySeenFromBehind', () => {
  it('mirrors the figure, keeps each joint its own, and drops the face', () => {
    const turned = bodySeenFromBehind(armUpFacing());
    // Her right wrist was on the picture's left; from behind it is on the right, still hers.
    assert.ok(Math.abs(turned[4]!.x - 0.63) < 1e-9);
    assert.equal(turned[4]!.y, 0.03);
    assert.ok(turned[2]!.x > turned[5]!.x);
    assert.equal(turned[0], null);
    assert.equal(turned[14], null);
    assert.equal(turned[15], null);
    // The ears stay: the back of the head.
    assert.ok(turned[16] && turned[17]);
    assert.equal(bodyFacesAway(turned), true);
  });

  it('turns a figure that already faces away to face the camera', () => {
    const away = bodySeenFromBehind(armUpFacing());
    const front = bodySeenFromBehind(away);
    assert.equal(bodyFacesAway(front), false);
    assert.ok(Math.abs(front[2]!.x - 0.42) < 1e-9);
  });
});

describe('photoPoseSeenFromBehind', () => {
  const pose: PhotoPose = {
    aspect: 2 / 3,
    people: [armUpFacing(), armUpFacing()],
    source: 'edited',
    words: 'waving: one arm raised high',
    rig3d: { figures: [] } as unknown as PhotoPose['rig3d'],
  };

  it('keeps the lead only, its name and source, never the 3D rig', () => {
    const turned = photoPoseSeenFromBehind(pose);
    assert.equal(turned.people.length, 1);
    assert.equal(turned.words, pose.words);
    assert.equal(turned.source, 'edited');
    assert.equal('rig3d' in turned, false);
  });

  it('reads as her back to the camera in words', () => {
    const words = customPoseWords({
      photo: { ...photoPoseSeenFromBehind(pose), words: undefined },
      lead: 'she',
    });
    assert.match(words, /back to the camera/);
  });

  it('fittingBackViewPose saves a lean copy (lead only, no rig)', () => {
    const saved = fittingBackViewPose(pose)!;
    assert.equal(saved.people.length, 1);
    assert.equal('rig3d' in saved, false);
    assert.equal(fittingBackViewPose(undefined), undefined);
    assert.equal(fittingBackViewPose({ aspect: 1, people: [] }), undefined);
  });
});

describe('the other side of a pose made in 3D', () => {
  const posedFromBehind = (): PhotoPose => {
    const base: PoseRig3d = {
      version: RIG3D_VERSION,
      figures: [restFigure('female')],
      camera: DEFAULT_CAMERA,
    };
    const rig = { ...base, camera: cameraFromView(base, { azimuthDeg: 180, elevationDeg: 0 }, 0.75) };
    return { aspect: 0.75, people: projectRig(rig, 0.75), source: 'edited', rig3d: rig };
  };

  it('posed from behind, the other side is her front, face and all (user report 2026-10-24)', () => {
    const pose = posedFromBehind();
    assert.equal(pose.people[0]![0], null, 'from behind: no nose');
    const other = rigSeenFromOtherSide(pose)!;
    assert.ok(other.people[0]![0], 'the front shows her face');
    assert.equal(other.people.length, 1);
    assert.equal(bodyFacesAway(other.people[0]), false);
    assert.equal('rig3d' in other, false);
  });

  it('needs the rig: a flat pose has none', () => {
    const { rig3d: _rig, ...flat } = posedFromBehind();
    assert.equal(rigSeenFromOtherSide(flat), undefined);
    assert.equal(rigSeenFromOtherSide(undefined), undefined);
  });
});
