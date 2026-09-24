import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  drawDayPoseGuide,
  parsePoseGuideIntent,
  synthesizeIntimateStickFigures,
  synthesizeStickSkeleton,
  type StickSkeleton,
} from './day-pose-guide';
import {
  drawOpenPoseFigures,
  inferPoseFacing,
  OPENPOSE_KEYPOINT_NAMES,
  resolvePoseLeadPosition,
  stickToOpenPoseKeypoints,
} from './pose-guide-openpose';

const W = 512;
const H = 768;
const idx = (name: (typeof OPENPOSE_KEYPOINT_NAMES)[number]) =>
  OPENPOSE_KEYPOINT_NAMES.indexOf(name);

function standing(): StickSkeleton {
  return synthesizeStickSkeleton(
    {
      base: 'stand',
      armLeft: 'down',
      armRight: 'down',
      lean: 0,
      stride: 0.2,
      seed: 7,
      people: 1,
      label: 'test',
    },
    { centerX: 0.5 }
  );
}

function recordingContext() {
  const ops: Array<{ op: string; fill: string }> = [];
  const ctx = {
    fillStyle: '',
    fillRect() {
      ops.push({ op: 'fillRect', fill: String(this.fillStyle) });
    },
    beginPath() {},
    ellipse() {
      ops.push({ op: 'ellipse', fill: String(this.fillStyle) });
    },
    arc() {
      ops.push({ op: 'arc', fill: String(this.fillStyle) });
    },
    fill() {},
  };
  return { ops, ctx: ctx as unknown as CanvasRenderingContext2D };
}

describe('pose-guide-openpose keypoints', () => {
  it('maps a camera-facing figure to all 18 COCO keypoints, person-right on image-left', () => {
    const figure = standing();
    const kp = stickToOpenPoseKeypoints(figure, W, H);
    assert.equal(kp.length, 18);
    assert.ok(kp.every(Boolean), 'front view shows nose, both eyes and both ears');
    assert.ok(kp[idx('rShoulder')]!.x < kp[idx('lShoulder')]!.x);
    assert.ok(kp[idx('rEye')]!.x < kp[idx('lEye')]!.x);
    assert.ok(kp[idx('rEar')]!.x < kp[idx('rEye')]!.x, 'ears sit outside the eyes');
  });

  it('back view drops the face and swaps sides', () => {
    const figure: StickSkeleton = { ...standing(), facing: 'back' };
    const kp = stickToOpenPoseKeypoints(figure, W, H);
    assert.equal(kp[idx('nose')], null);
    assert.equal(kp[idx('rEye')], null);
    assert.equal(kp[idx('lEye')], null);
    assert.ok(kp[idx('rShoulder')]!.x > kp[idx('lShoulder')]!.x);
    assert.ok(kp[idx('rEar')]!.x > kp[idx('lEar')]!.x);
  });

  it('profile view points the nose that way and shows one eye', () => {
    const right = stickToOpenPoseKeypoints({ ...standing(), facing: 'right' }, W, H);
    const head = { x: standing().head.x * W };
    assert.ok(right[idx('nose')]!.x > head.x);
    assert.ok(right[idx('rEye')], 'facing image-right shows the right side');
    assert.equal(right[idx('lEye')], null);

    const left = stickToOpenPoseKeypoints({ ...standing(), facing: 'left' }, W, H);
    assert.ok(left[idx('nose')]!.x < head.x);
    assert.ok(left[idx('lEye')]);
    assert.equal(left[idx('rEye')], null);
  });

  it('infers profile for bent-over torsos and front for wide shoulders', () => {
    assert.equal(inferPoseFacing(standing(), W, H), 'front');
    const intent = parsePoseGuideIntent('on all fours on the bed', 0);
    const [lead, rear] = synthesizeIntimateStickFigures({ ...intent, intimate: 'bent', people: 2 });
    assert.equal(lead!.facing, undefined, 'all-fours lead relies on inference');
    assert.equal(inferPoseFacing(lead!, W, H), 'left');
    assert.equal(rear!.facing, 'left', 'rear partner faces the lead');
  });
});

describe('pose-guide-openpose layouts', () => {
  it('wall press draws both adults facing the wall, not face to face', () => {
    const intent = parsePoseGuideIntent('pinned against the wall from behind', 0);
    const figures = synthesizeIntimateStickFigures({ ...intent, intimate: 'wall', people: 2 });
    assert.equal(figures.length, 2);
    for (const figure of figures) {
      assert.equal(figure.facing, 'left');
    }
  });

  it('reverse straddle rider faces away from camera', () => {
    const intent = parsePoseGuideIntent('she rides him reverse cowgirl', 0);
    const figures = synthesizeIntimateStickFigures({
      ...intent,
      intimate: 'reverse_straddle',
      people: 2,
    });
    assert.ok(figures.some(figure => figure.facing === 'back'));
  });

  it('names the lead by position: underneath in missionary, left in side-by-side', () => {
    const intent = parsePoseGuideIntent('missionary on the bed', 0);
    const missionary = synthesizeIntimateStickFigures({
      ...intent,
      intimate: 'missionary',
      people: 2,
    });
    assert.equal(resolvePoseLeadPosition(missionary, W, H), 'lower');

    const a = standing();
    const b = { ...standing(), head: { x: 0.8, y: a.head.y } };
    const shift = (s: StickSkeleton, dx: number): StickSkeleton =>
      Object.fromEntries(
        Object.entries(s).map(([key, value]) =>
          typeof value === 'object' ? [key, { x: value.x + dx, y: value.y }] : [key, value]
        )
      ) as StickSkeleton;
    assert.equal(resolvePoseLeadPosition([shift(a, -0.2), shift(b, 0.2)], W, H), 'left');
    assert.equal(resolvePoseLeadPosition([a], W, H), null);
  });
});

describe('pose-guide-openpose drawing', () => {
  it('paints a black map with limb ellipses and joint dots', () => {
    const { ops, ctx } = recordingContext();
    drawOpenPoseFigures(ctx, [standing()], W, H);
    assert.equal(ops[0]!.op, 'fillRect');
    assert.equal(ops[0]!.fill, '#000000');
    assert.equal(ops.filter(op => op.op === 'ellipse').length, 17);
    assert.equal(ops.filter(op => op.op === 'arc').length, 18);
    // Neck→right-shoulder limb uses the standard OpenPose red at 60%.
    assert.equal(ops.find(op => op.op === 'ellipse')!.fill, 'rgb(153, 0, 0)');
  });

  it('drawDayPoseGuide renders OpenPose on request', () => {
    const { ops, ctx } = recordingContext();
    drawDayPoseGuide(ctx, 'morning', 'openpose');
    assert.equal(ops[0]!.fill, '#000000');
    assert.ok(ops.some(op => op.op === 'ellipse'));
  });
});
