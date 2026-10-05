/**
 * Per-person pose reads inside ComfyUI (pure: the graph and the reply parser). DWPose alone
 * reads one body out of two on ~40% of two-person sex stills (its person boxes merge the pair);
 * here each person is segmented first (Impact Pack's `person_yolov8m-seg.pt`), the two largest
 * are put alone on a grey canvas one at a time, and DWPose reads each by itself. The reads are
 * merged by `mergePersonReads` (pose-reference-duo.ts), which drops a second read of one body.
 *
 * The same idea as the reference harvester's `scripts/pose-refs/people.py`, as one utility graph
 * the app can queue (pose-detect-server.ts `detectPeopleInComfyStill`).
 */

import type { NormalizedBody } from '@/lib/pose-library';
import { mergePersonReads, READ_SCORE, type PersonRead } from '@/lib/pose-reference-duo';
import type { DetectedPose } from '@/lib/pose-score';

/** Impact Pack nodes the per-person read needs, besides DWPose. */
export const PERSON_READ_NODES = [
  'UltralyticsDetectorProvider',
  'SegmDetectorSEGS',
  'ImpactSEGSOrderedFilter',
  'SegsToCombinedMask',
  'GetImageSize',
] as const;

export const PERSON_SEGMENT_MODEL = 'segm/person_yolov8m-seg.pt';

/** People read one at a time (largest masks first). */
export const PERSON_READ_COUNT = 2;

/** Node id of person `index`'s DWPose read in {@link buildPersonReadGraph}. */
export function personReadNodeId(index: number): string {
  return `20${index}`;
}

/**
 * LoadImage → person masks → each of the {@link PERSON_READ_COUNT} largest alone on grey →
 * DWPose. `detector` is the DWPose node's filled inputs minus the image (pose-detect-server
 * fills them from object_info).
 */
export function buildPersonReadGraph(input: {
  imageName: string;
  detectorNode: string;
  detectorInputs: (image: [string, number]) => Record<string, unknown>;
}): Record<string, unknown> {
  const graph: Record<string, unknown> = {
    '1': { class_type: 'LoadImage', inputs: { image: input.imageName } },
    '2': {
      class_type: 'UltralyticsDetectorProvider',
      inputs: { model_name: PERSON_SEGMENT_MODEL },
    },
    '3': {
      class_type: 'SegmDetectorSEGS',
      inputs: {
        segm_detector: ['2', 1],
        image: ['1', 0],
        threshold: 0.35,
        // A few pixels of grow, so a hand resting on the other body stays with its owner.
        dilation: 6,
        crop_factor: 1,
        drop_size: 40,
        labels: 'all',
      },
    },
    '4': { class_type: 'GetImageSize', inputs: { image: ['1', 0] } },
    '5': {
      class_type: 'EmptyImage',
      inputs: { width: ['4', 0], height: ['4', 1], batch_size: 1, color: 0x808080 },
    },
  };
  for (let index = 0; index < PERSON_READ_COUNT; index += 1) {
    const filter = `17${index}`;
    const mask = `18${index}`;
    const alone = `19${index}`;
    const read = personReadNodeId(index);
    graph[filter] = {
      class_type: 'ImpactSEGSOrderedFilter',
      inputs: {
        segs: ['3', 0],
        target: 'area(=w*h)',
        order: true,
        take_start: index,
        take_count: 1,
      },
    };
    graph[mask] = { class_type: 'SegsToCombinedMask', inputs: { segs: [filter, 0] } };
    graph[alone] = {
      class_type: 'ImageCompositeMasked',
      inputs: {
        destination: ['5', 0],
        source: ['1', 0],
        x: 0,
        y: 0,
        resize_source: false,
        mask: [mask, 0],
      },
    };
    graph[read] = { class_type: input.detectorNode, inputs: input.detectorInputs([alone, 0]) };
    graph[`21${index}`] = { class_type: 'PreviewImage', inputs: { images: [read, 0] } };
  }
  return graph;
}

type OpenPoseFrame = {
  people?: Array<{ pose_keypoints_2d?: unknown }>;
  canvas_width?: number;
  canvas_height?: number;
};

function readFrame(raw: unknown): OpenPoseFrame | null {
  let value: unknown = raw;
  if (Array.isArray(value)) value = value[0];
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) value = value[0];
  return value && typeof value === 'object' ? (value as OpenPoseFrame) : null;
}

/** One DWPose reply's bodies as scored joints in image pixels (null when unreadable). */
function framePeople(
  frame: OpenPoseFrame,
  size: { width: number; height: number }
): Array<PersonRead['joints']> {
  const rows = Array.isArray(frame.people) ? frame.people : [];
  return rows
    .map(row => {
      const raw = Array.isArray(row.pose_keypoints_2d) ? (row.pose_keypoints_2d as unknown[]) : [];
      if (raw.length < 18 * 3) return null;
      const values = raw.slice(0, 54).map(Number);
      // Some builds emit 0–1, others pixels.
      const normalized = values.filter((_, i) => i % 3 !== 2).every(n => n <= 1.5);
      const joints: Array<readonly [number, number, number] | null> = [];
      for (let i = 0; i < 18; i += 1) {
        const x = values[i * 3]!;
        const y = values[i * 3 + 1]!;
        const c = values[i * 3 + 2]!;
        if (![x, y, c].every(Number.isFinite) || c <= 0 || (x === 0 && y === 0)) {
          joints.push(null);
          continue;
        }
        joints.push(normalized ? [x * size.width, y * size.height, c] : [x, y, c]);
      }
      return joints;
    })
    .filter((joints): joints is Array<readonly [number, number, number] | null> =>
      Boolean(joints?.some(Boolean))
    );
}

/**
 * The per-person replies (one `openpose_json` per read node) → the still's people, merged and
 * normalized like `parseOpenPoseJson`. Each read keeps its largest body only (the grey canvas
 * leaves one person, but a stray limb of the other can still be read as a fragment). Null when
 * no reply carries a canvas size.
 */
export function mergePersonReadReplies(replies: readonly unknown[]): DetectedPose | null {
  const frames = replies.map(readFrame);
  const sized = frames.find(
    frame => Number(frame?.canvas_width) > 0 && Number(frame?.canvas_height) > 0
  );
  if (!sized) return null;
  const size = { width: Number(sized.canvas_width), height: Number(sized.canvas_height) };
  const reads: PersonRead[] = [];
  for (const frame of frames) {
    if (!frame) continue;
    const bodies = framePeople(frame, size);
    const largest = bodies
      .map(joints => ({ joints, read: joints.filter(j => j && j[2] >= READ_SCORE).length }))
      .sort((a, b) => b.read - a.read)[0];
    if (largest && largest.read > 0) reads.push({ joints: largest.joints, crop: { x: 0, y: 0 } });
  }
  const people: NormalizedBody[] = mergePersonReads(reads).map(body =>
    body.map(joint =>
      joint && joint.score >= READ_SCORE
        ? { x: joint.x / size.width, y: joint.y / size.height }
        : null
    )
  );
  return { canvas: size, people: people.filter(body => body.some(Boolean)) };
}
