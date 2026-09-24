import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeScenePoseSpec,
  planOpenPoseGuide,
  synthesizeSceneStickFigures,
  synthesizeStickSkeleton,
  type StickSkeleton,
} from './day-pose-guide';
import { stickToOpenPoseKeypoints } from './pose-guide-openpose';
import {
  bodyIsUsable,
  pickPoseLibraryEntry,
  placeLibraryPeople,
  poseLibraryKey,
  withPoseLibraryEntry,
  type NormalizedBody,
  type PoseLibraryEntry,
} from './pose-library';
import {
  describePoseMatch,
  parseOpenPoseJson,
  scoreBodyMatch,
  scorePoseMatch,
  type DetectedPose,
} from './pose-score';
import { decideSlotQuality, type SlotQualityReport } from './play-slot-quality';
import { buildDetectorInputs, parseComfyViewRef } from './pose-detect-server';
import { parseRoleplayScenes } from './roleplay';
import { poseGuidePromptBlock } from './pose-guide-prompt';

function figure(base: 'stand' | 'sit' | 'lie' | 'crouch' | 'walk', cx = 0.5): StickSkeleton {
  return synthesizeStickSkeleton(
    {
      base,
      armLeft: 'down',
      armRight: 'down',
      lean: 0,
      stride: 0.2,
      seed: 11,
      people: 1,
      label: base,
    },
    { centerX: cx }
  );
}

function normalized(skeleton: StickSkeleton): NormalizedBody {
  return stickToOpenPoseKeypoints(skeleton).map(p => (p ? { x: p.x / 512, y: p.y / 768 } : null));
}

function detectedFrom(bodies: NormalizedBody[]): DetectedPose {
  return { canvas: { width: 512, height: 768 }, people: bodies };
}

describe('pose-score parsing', () => {
  it('parses controlnet_aux openpose_json in pixels and in 0–1', () => {
    const body = normalized(figure('stand'));
    const flat = (scaleX: number, scaleY: number) =>
      body.flatMap(p => (p ? [p.x * scaleX, p.y * scaleY, 1] : [0, 0, 0]));
    const pixels = parseOpenPoseJson(
      JSON.stringify([
        { people: [{ pose_keypoints_2d: flat(512, 768) }], canvas_width: 512, canvas_height: 768 },
      ])
    );
    assert.equal(pixels?.people.length, 1);
    assert.ok(Math.abs(pixels!.people[0]![1]!.x - body[1]!.x) < 1e-6);
    const unit = parseOpenPoseJson({
      people: [{ pose_keypoints_2d: flat(1, 1) }],
      canvas_width: 512,
      canvas_height: 768,
    });
    assert.ok(Math.abs(unit!.people[0]![1]!.y - body[1]!.y) < 1e-6);
    assert.equal(parseOpenPoseJson('not json'), null);
  });
});

describe('pose-score matching', () => {
  it('scores the same pose near 1 and a different pose under the gate', () => {
    const aspects = { guide: 2 / 3, detected: 2 / 3 };
    const stand = normalized(figure('stand'));
    assert.ok(scoreBodyMatch(stand, stand, aspects)! > 0.99);
    // Kept the standing plate when the guide asked for a stride or lying down.
    for (const base of ['walk', 'lie'] as const) {
      const score = scoreBodyMatch(normalized(figure(base)), stand, aspects)!;
      assert.ok(score < 0.6, `${base} vs stand ${score}`);
    }
  });

  it('tolerates detection jitter on the same pose', () => {
    const guide = normalized(figure('crouch'));
    const jittered = guide.map((p, i) =>
      p ? { x: p.x + Math.sin(i * 7.1) * 0.02, y: p.y + Math.cos(i * 3.3) * 0.02 } : null
    );
    assert.ok(scoreBodyMatch(guide, jittered, { guide: 2 / 3, detected: 2 / 3 })! > 0.9);
  });

  it('ignores position and scale — only limb directions count', () => {
    const guide = normalized(figure('crouch'));
    const moved = guide.map(p => (p ? { x: p.x * 0.6 + 0.3, y: p.y * 0.6 + 0.1 } : null));
    const result = scorePoseMatch({
      guide: [guide],
      guideAspect: 2 / 3,
      detected: detectedFrom([moved]),
    });
    assert.ok(result.score > 0.95);
  });

  it('matches duo people by best assignment and zeroes a missing partner', () => {
    const a = normalized(figure('stand', 0.3));
    const b = normalized(figure('walk', 0.7));
    const both = scorePoseMatch({ guide: [a, b], guideAspect: 2 / 3, detected: detectedFrom([b, a]) });
    assert.ok(both.score > 0.95);
    assert.deepEqual(both.assignment, [1, 0]);
    const solo = scorePoseMatch({ guide: [a, b], guideAspect: 2 / 3, detected: detectedFrom([a]) });
    assert.ok(solo.score < 0.55);
    assert.equal(solo.detectedPeople, 1);
    assert.match(describePoseMatch(solo), /1 of 2 people found/);
  });
});

describe('pose library', () => {
  const body = normalized(figure('sit'));
  const entry = (id: string, score: number, createdAt: number): PoseLibraryEntry => ({
    id,
    key: 'sit:1',
    aspect: 2 / 3,
    people: [body],
    score,
    createdAt,
  });

  it('keys by layout and headcount', () => {
    assert.equal(poseLibraryKey({ base: 'sit', people: 1 }), 'sit:1');
    assert.equal(poseLibraryKey({ intimate: 'bent', base: 'crouch', people: 2 }), 'bent:2');
  });

  it('keeps the best poses per key', () => {
    let list: PoseLibraryEntry[] = [];
    for (let i = 0; i < 15; i += 1) {
      list = withPoseLibraryEntry(list, entry(`e${i}`, 0.8 + i / 100, i));
    }
    assert.equal(list.length, 12);
    assert.ok(!list.some(e => e.id === 'e0'), 'lowest score dropped');
  });

  it('only sometimes swaps in a library pose, and always on odd rerolls', () => {
    const list = [entry('a', 0.9, 1)];
    assert.equal(pickPoseLibraryEntry(list, 'stand:1', 5, 1), null);
    assert.equal(pickPoseLibraryEntry(list, 'sit:1', 0, 1)?.id, 'a');
    assert.equal(pickPoseLibraryEntry(list, 'sit:1', 0, 0), null);
    assert.equal(pickPoseLibraryEntry(list, 'sit:1', 2, 0)?.id, 'a');
  });

  it('places a library pose without stretching and validates bodies', () => {
    const [person] = placeLibraryPeople(entry('a', 0.9, 1), 768, 768);
    const neck = person!.body[1]!;
    assert.ok(Math.abs(neck.x - (body[1]!.x * (2 / 3) * 768 + 128)) < 1e-6);
    assert.equal(bodyIsUsable(body), true);
    assert.equal(bodyIsUsable(body.map((p, i) => (i < 8 ? null : p))), false);
  });
});

describe('guide planning', () => {
  it('draws at the Image 1 aspect and reports normalized keypoints', () => {
    const { intent, figures } = synthesizeSceneStickFigures('sitting on a bench', 0, {
      allowIntimate: false,
      forcePeople: 1,
    });
    const plan = planOpenPoseGuide({
      intent,
      figures,
      sceneText: 'sitting on a bench',
      aspect: { width: 1024, height: 1024 },
    });
    assert.deepEqual(plan.canvas, { width: 768, height: 768 });
    assert.equal(plan.keypoints.length, 1);
    assert.ok(plan.keypoints[0]!.every(p => !p || (p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)));
    assert.equal(plan.poseKey.endsWith(':1'), true);
  });

  it('uses a library pose for the same layout on an odd reroll', () => {
    const { intent, figures } = synthesizeSceneStickFigures('sitting on a bench', 0, {
      allowIntimate: false,
      forcePeople: 1,
    });
    const key = poseLibraryKey({ ...intent, people: 1 });
    const library: PoseLibraryEntry[] = [
      { id: 'lib', key, aspect: 2 / 3, people: [normalized(figure('sit'))], score: 0.9, createdAt: 1 },
    ];
    const plan = planOpenPoseGuide({ intent, figures, library, variant: 1 });
    assert.equal(plan.libraryEntryId, 'lib');
  });

  it('mirrors odd variants so a reroll tries a different arrangement', () => {
    const base = synthesizeSceneStickFigures('missionary on the bed', 0, { forcePeople: 2 });
    const flipped = synthesizeSceneStickFigures('missionary on the bed', 0, {
      forcePeople: 2,
      variant: 1,
    });
    assert.equal(flipped.intent.intimate, 'missionary');
    assert.ok(Math.abs(flipped.figures[0]!.head.x - (1 - base.figures[0]!.head.x)) < 0.05);
  });
});

describe('scene pose spec (LLM)', () => {
  it('keeps only known values', () => {
    assert.deepEqual(normalizeScenePoseSpec({ body: 'Sit', people: 2, act: 'none' }), {
      body: 'sit',
      people: 2,
      act: 'none',
    });
    assert.deepEqual(normalizeScenePoseSpec({ act: 'reverse straddle' }), {
      act: 'reverse_straddle',
    });
    assert.equal(normalizeScenePoseSpec({ body: 'backflip', people: 9 }), undefined);
    assert.equal(normalizeScenePoseSpec('sit'), undefined);
  });

  it('outranks the text read', () => {
    const text = 'leaning on the balcony rail at dusk';
    const fromText = synthesizeSceneStickFigures(text, 0);
    const fromSpec = synthesizeSceneStickFigures(text, 0, { pose: { body: 'sit', act: 'none' } });
    assert.notEqual(fromText.intent.base, 'sit');
    assert.equal(fromSpec.intent.base, 'sit');
    const act = synthesizeSceneStickFigures('in the hotel room', 0, {
      pose: { act: 'wall', people: 2 },
    });
    assert.equal(act.intent.intimate, 'wall');
    assert.equal(act.figures.length, 2);
    const blocked = synthesizeSceneStickFigures('in the hotel room', 0, {
      pose: { act: 'wall' },
      allowIntimate: false,
    });
    assert.equal(blocked.intent.intimate ?? null, null);
  });

  it('parses the pose object off Story scenes', () => {
    const [scene] = parseRoleplayScenes({
      scenes: [{ title: 'Rooftop', blurb: 'She sits on the ledge', pose: { body: 'sit', people: 1 } }],
    });
    assert.deepEqual(scene!.pose, { body: 'sit', people: 1 });
  });
});

describe('pose match in the Day quality gate', () => {
  const clean: SlotQualityReport = {
    faceIntegrity: 5,
    outfitMatch: 5,
    anatomy: 5,
    flags: [],
    note: '',
  };

  it('rerolls a still that ignored its guide and keeps one that followed it', () => {
    const miss = decideSlotQuality(clean, 0, undefined, { poseMatch: 0.4 });
    assert.equal(miss.action, 'reroll');
    assert.equal(miss.poseMiss, true);
    assert.match(miss.reasons[0]!, /pose match 40%/);
    assert.equal(decideSlotQuality(clean, 0, undefined, { poseMatch: 0.85 }).action, 'keep');
    assert.equal(decideSlotQuality(clean, 0).action, 'keep');
    assert.equal(decideSlotQuality(clean, 2, undefined, { poseMatch: 0.2 }).action, 'flag');
  });
});

describe('pose detect server helpers', () => {
  it('reads ComfyUI view refs from proxy URLs', () => {
    assert.deepEqual(
      parseComfyViewRef('/api/comfyui/view?filename=a.png&subfolder=day&type=output'),
      { filename: 'a.png', subfolder: 'day', type: 'output' }
    );
    assert.equal(parseComfyViewRef('/gallery/a.png'), null);
  });

  it('fills detector widgets from object_info and pins body-only detection', () => {
    const inputs = buildDetectorInputs(
      {
        input: {
          required: {
            image: ['IMAGE'],
            detect_hand: [['enable', 'disable'], { default: 'enable' }],
            detect_body: [['enable', 'disable'], { default: 'enable' }],
            detect_face: [['enable', 'disable'], { default: 'enable' }],
            resolution: ['INT', { default: 512 }],
            bbox_detector: [['yolox_l.onnx', 'None']],
          },
        },
      },
      ['1', 0]
    );
    assert.deepEqual(inputs, {
      image: ['1', 0],
      detect_hand: 'disable',
      detect_body: 'enable',
      detect_face: 'disable',
      resolution: 512,
      bbox_detector: 'yolox_l.onnx',
    });
  });
});

describe('hands prompt cue', () => {
  it('adds the hand line only for OpenPose + hands', () => {
    assert.match(
      poseGuidePromptBlock('realistic', { headcount: 1, style: 'openpose-hands' }),
      /hand keypoints/i
    );
    assert.doesNotMatch(poseGuidePromptBlock('realistic', { headcount: 1 }), /hand keypoints/i);
  });
});
