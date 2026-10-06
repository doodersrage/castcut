import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDuoCountGraph,
  DUO_COUNT_READ_IDS,
  duoStillDefects,
  likelierTwoTake,
  readDuoCountReplies,
  type DuoStillCounts,
} from './duo-still-check';

const clean: DuoStillCounts = { faces: 2, hands: 4, people: 2, wrists: 4, ankles: 3 };

describe('duoStillDefects', () => {
  it('counts nothing on a couple with two faces, two to four hands and two bodies', () => {
    assert.deepEqual(duoStillDefects(clean), { score: 0, reasons: [] });
    assert.equal(duoStillDefects({ ...clean, hands: 2, people: 1, ankles: 0 }).score, 0);
  });

  it('counts each oddity once, in words', () => {
    const odd = duoStillDefects({
      faces: 1,
      hands: 5,
      people: 3,
      wrists: 5,
      ankles: 6,
      penises: 2,
      vaginas: 2,
    });
    assert.equal(odd.score, 7);
    assert.deepEqual(odd.reasons, [
      'one face',
      'five hands',
      'three bodies',
      'five wrists',
      'six ankles',
      'more than one penis',
      'more than one vulva',
    ]);
    assert.deepEqual(duoStillDefects({ ...clean, faces: 3, hands: 1 }).reasons, [
      'three faces',
      'one hand',
    ]);
    assert.deepEqual(duoStillDefects({ ...clean, faces: 0 }).reasons, ['no faces']);
  });

  it('skips counts a detector did not produce', () => {
    assert.equal(
      duoStillDefects({ faces: null, hands: null, people: null, wrists: null, ankles: null }).score,
      0
    );
    assert.equal(duoStillDefects({ ...clean, penises: null, vaginas: 1 }).score, 0);
  });
});

describe('likelierTwoTake', () => {
  it('puts the take with fewer oddities first and says what the other counted', () => {
    const first = likelierTwoTake({ ...clean, faces: 1 }, clean);
    assert.equal(first?.pick, 'second');
    assert.match(first?.note ?? '', /counted one face/);
    assert.match(first?.note ?? '', /you pick/);
    const second = likelierTwoTake(clean, { ...clean, hands: 6, faces: 3 });
    assert.equal(second?.pick, 'first');
    assert.match(second?.note ?? '', /three faces, six hands/);
  });

  it('keeps the order on a tie or without counts', () => {
    assert.equal(likelierTwoTake(clean, clean), null);
    assert.equal(likelierTwoTake({ ...clean, faces: 1 }, { ...clean, hands: 7 }), null);
    assert.equal(likelierTwoTake(null, clean), null);
    assert.equal(likelierTwoTake(clean, undefined), null);
  });
});

describe('buildDuoCountGraph', () => {
  const detectorInputs = (image: [string, number]) => ({ image, detect_body: 'enable' });

  it('counts faces and hands into PreviewAny and reads DWPose body only', () => {
    const graph = buildDuoCountGraph({
      imageName: 'still.png',
      detectorNode: 'DWPreprocessor',
      detectorInputs,
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    assert.equal(graph['1']?.inputs.image, 'still.png');
    assert.equal(graph[DUO_COUNT_READ_IDS.pose]?.class_type, 'DWPreprocessor');
    assert.deepEqual(graph[DUO_COUNT_READ_IDS.pose]?.inputs.image, ['1', 0]);
    assert.equal(graph.fm?.inputs.model_name, 'bbox/face_yolov8m.pt');
    assert.equal(graph.hm?.inputs.model_name, 'bbox/hand_yolov8s.pt');
    assert.equal(graph.fs?.class_type, 'BboxDetectorSEGS');
    assert.equal(graph.fs?.inputs.threshold, 0.5);
    assert.deepEqual(graph.fc?.inputs.segs, ['fs', 0]);
    assert.equal(graph[DUO_COUNT_READ_IDS.faces]?.class_type, 'PreviewAny');
    assert.deepEqual(graph[DUO_COUNT_READ_IDS.hands]?.inputs.source, ['hc', 0]);
    // No part models asked for: none in the graph.
    assert.equal(graph[DUO_COUNT_READ_IDS.penises], undefined);
    assert.equal(graph[DUO_COUNT_READ_IDS.vaginas], undefined);
  });

  it('adds the nsfw part models as segm counters when installed', () => {
    const graph = buildDuoCountGraph({
      imageName: 'still.png',
      detectorNode: 'DWPreprocessor',
      detectorInputs,
      parts: { penis: true, vagina: true },
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    assert.equal(graph.ps?.class_type, 'SegmDetectorSEGS');
    assert.deepEqual(graph.ps?.inputs.segm_detector, ['pm', 1]);
    assert.equal(graph.vm?.inputs.model_name, 'segm/nsfw-seg-vagina-s.pt');
    assert.equal(graph[DUO_COUNT_READ_IDS.penises]?.class_type, 'PreviewAny');
  });
});

describe('readDuoCountReplies', () => {
  const body = (joints: Array<[number, number] | null>) =>
    joints.flatMap(point => (point ? [point[0], point[1], 0.9] : [0, 0, 0]));
  const full: Array<[number, number] | null> = Array.from({ length: 18 }, (_, i) => [
    0.3 + i * 0.01,
    0.1 + i * 0.04,
  ]);
  const openpose = (people: Array<Array<[number, number] | null>>) => ({
    canvas_width: 960,
    canvas_height: 1280,
    people: people.map(joints => ({ pose_keypoints_2d: body(joints) })),
  });

  it('reads the counts and the DWPose bodies, wrists and ankles', () => {
    const noLegs = full.map((point, i) => (i >= 9 ? null : point));
    const counts = readDuoCountReplies({
      [DUO_COUNT_READ_IDS.faces]: { text: ['2'] },
      [DUO_COUNT_READ_IDS.hands]: { text: [3] },
      [DUO_COUNT_READ_IDS.pose]: { openpose_json: [JSON.stringify(openpose([full, noLegs]))] },
    });
    assert.deepEqual(counts, { faces: 2, hands: 3, people: 2, wrists: 4, ankles: 2 });
  });

  it('counts only bodies with five or more joints, and keeps part counts when present', () => {
    const fragment = full.map((point, i) => (i < 3 ? point : null));
    const counts = readDuoCountReplies({
      [DUO_COUNT_READ_IDS.faces]: { text: ['1'] },
      [DUO_COUNT_READ_IDS.hands]: { text: ['5'] },
      [DUO_COUNT_READ_IDS.penises]: { text: ['0'] },
      [DUO_COUNT_READ_IDS.vaginas]: { text: ['2'] },
      [DUO_COUNT_READ_IDS.pose]: { openpose_json: [openpose([full, full, fragment])] },
    });
    assert.equal(counts?.people, 2);
    assert.equal(counts?.wrists, 4);
    assert.equal(counts?.penises, 0);
    assert.equal(counts?.vaginas, 2);
    assert.equal(duoStillDefects(counts!).score, 3);
  });

  it('is null when nothing came back, and leaves a missing detector null', () => {
    assert.equal(readDuoCountReplies(undefined), null);
    assert.equal(readDuoCountReplies({}), null);
    const counts = readDuoCountReplies({ [DUO_COUNT_READ_IDS.faces]: { text: ['2'] } });
    assert.deepEqual(counts, { faces: 2, hands: null, people: null, wrists: null, ankles: null });
    assert.equal(readDuoCountReplies({ [DUO_COUNT_READ_IDS.faces]: { text: ['x'] } }), null);
  });
});
