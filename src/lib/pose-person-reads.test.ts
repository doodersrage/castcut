import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPersonReadGraph,
  mergePersonReadReplies,
  PERSON_READ_COUNT,
  PERSON_SEGMENT_MODEL,
  personReadNodeId,
} from './pose-person-reads';

type Node = { class_type: string; inputs: Record<string, unknown> };

/** A standing body centred on `cx` px in a 1000×1000 frame, as an openpose row. */
function row(cx: number, score = 0.9): { pose_keypoints_2d: number[] } {
  const points: Array<[number, number]> = [
    [cx, 120],
    [cx, 200],
    [cx - 60, 200],
    [cx - 80, 330],
    [cx - 80, 450],
    [cx + 60, 200],
    [cx + 80, 330],
    [cx + 80, 450],
    [cx - 40, 500],
    [cx - 40, 700],
    [cx - 40, 900],
    [cx + 40, 500],
    [cx + 40, 700],
    [cx + 40, 900],
    [cx - 15, 100],
    [cx + 15, 100],
    [cx - 30, 110],
    [cx + 30, 110],
  ];
  return { pose_keypoints_2d: points.flatMap(([x, y]) => [x, y, score]) };
}

function reply(people: Array<{ pose_keypoints_2d: number[] }>): string {
  return JSON.stringify([{ people, canvas_width: 1000, canvas_height: 1000 }]);
}

describe('buildPersonReadGraph', () => {
  const graph = buildPersonReadGraph({
    imageName: 'still.png',
    detectorNode: 'DWPreprocessor',
    detectorInputs: image => ({ image, detect_body: 'enable' }),
  }) as Record<string, Node>;

  it('segments people and reads each of the largest alone on grey', () => {
    assert.equal(graph['2']!.inputs.model_name, PERSON_SEGMENT_MODEL);
    for (let index = 0; index < PERSON_READ_COUNT; index += 1) {
      const read = graph[personReadNodeId(index)]!;
      assert.equal(read.class_type, 'DWPreprocessor');
      const [aloneId] = read.inputs.image as [string, number];
      const alone = graph[aloneId]!;
      assert.equal(alone.class_type, 'ImageCompositeMasked');
      // The person over a grey canvas the still's size.
      assert.deepEqual(alone.inputs.destination, ['5', 0]);
      assert.equal(graph['5']!.class_type, 'EmptyImage');
      assert.deepEqual(alone.inputs.source, ['1', 0]);
      const [maskId] = alone.inputs.mask as [string, number];
      const [filterId] = graph[maskId]!.inputs.segs as [string, number];
      assert.equal(graph[filterId]!.inputs.take_start, index);
      assert.equal(graph[filterId]!.inputs.take_count, 1);
    }
  });
});

describe('mergePersonReadReplies', () => {
  it('two reads → two people, normalized', () => {
    const pose = mergePersonReadReplies([[reply([row(300)])], [reply([row(700)])]]);
    assert.ok(pose);
    assert.deepEqual(pose.canvas, { width: 1000, height: 1000 });
    assert.equal(pose.people.length, 2);
    assert.ok(pose.people.every(body => body.every(point => point && point.x <= 1)));
  });

  it('drops a second read of the same body and keeps each read’s largest body', () => {
    const fragment = { pose_keypoints_2d: row(700).pose_keypoints_2d.map((v, i) => (i < 6 ? v : 0)) };
    const pose = mergePersonReadReplies([
      [reply([row(300), fragment])],
      [reply([row(302)])],
    ]);
    assert.equal(pose?.people.length, 1);
  });

  it('an empty read (one person segmented) leaves one body; no canvas → null', () => {
    const pose = mergePersonReadReplies([[reply([row(500)])], [reply([])]]);
    assert.equal(pose?.people.length, 1);
    assert.equal(mergePersonReadReplies([undefined, 'not json']), null);
  });

  it('reads 0–1 coordinates too', () => {
    const normalized = {
      pose_keypoints_2d: row(500).pose_keypoints_2d.map((v, i) => (i % 3 === 2 ? v : v / 1000)),
    };
    const pose = mergePersonReadReplies([[reply([normalized])]]);
    assert.ok(Math.abs((pose?.people[0]?.[1]?.x ?? 0) - 0.5) < 1e-9);
  });
});
