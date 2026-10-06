/**
 * Two-person intimate stills: a defect COUNT (pure), and the ComfyUI graph that reads the counts.
 *
 * The pose checks can't judge two-person sex stills (DWPose merges the two bodies on ~40%), so
 * this counts what does not need the bodies told apart: faces, hands, read bodies, wrists and
 * ankles, and (when the Impact Pack ships the nsfw part models) genitals. Each count outside what
 * a couple has is one oddity: not two faces, fewer than two or more than four hands, more than
 * four wrists or ankles, more than two bodies, more than one of a part.
 *
 * Measured 2026-10-05 on the user's own intimate duo stills (343 with a kept / deleted-or-redone
 * label, 60 judged by eye in the limb study): no count, and no combination of the counts, face /
 * person-mask and skin-region signals (per-person DWPose reads, mask overlap and splits, skin
 * connectivity), reached the bar for automatic redos (60% of bad stills caught at 10% false
 * alarms) — the best rule caught 17–33% at 10%, and a learned combination (cross-validated)
 * 18–22%. The oddity count orders a bad / good pair right 35–47% of the time, ties 28–44%, wrong
 * 20–25%. So nothing is redone on it: it only puts the likelier-good take of an intimate still's
 * two takes first on the card (day-two-takes.ts), as a hint — the player still picks.
 */

import { parseOpenPoseJson } from '@/lib/pose-score';

/** What was counted on a still (null = that detector did not run). */
export type DuoStillCounts = {
  /** Faces (YOLO face boxes, confidence ≥ 0.5). */
  faces: number | null;
  /** Hands (YOLO hand boxes, confidence ≥ 0.5). */
  hands: number | null;
  /** Bodies DWPose read with at least five joints. */
  people: number | null;
  /** Wrists DWPose read, over every body. */
  wrists: number | null;
  /** Ankles DWPose read, over every body. */
  ankles: number | null;
  /** Nsfw part models (segm/nsfw-seg-*), when installed. */
  penises?: number | null;
  vaginas?: number | null;
};

export type DuoStillCheckResult =
  { available: true; counts: DuoStillCounts } | { available: false; reason: string };

export type DuoStillDefects = {
  /** Oddities counted (0 = every count as a couple has it). */
  score: number;
  /** One short phrase per oddity ("one face", "five hands"). */
  reasons: string[];
};

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function words(count: number, noun: string, plural = `${noun}s`): string {
  const word = WORDS[count] ?? String(count);
  return `${word} ${count === 1 ? noun : plural}`;
}

/** The oddities in a still's counts (a couple: two faces, two to four hands, ≤ 2 bodies…). */
export function duoStillDefects(counts: DuoStillCounts): DuoStillDefects {
  const reasons: string[] = [];
  const { faces, hands, people, wrists, ankles, penises, vaginas } = counts;
  if (faces !== null && faces !== undefined && faces !== 2) reasons.push(words(faces, 'face'));
  if (hands !== null && hands !== undefined && (hands < 2 || hands > 4)) {
    reasons.push(words(hands, 'hand'));
  }
  if (people !== null && people !== undefined && people > 2)
    reasons.push(words(people, 'body', 'bodies'));
  if (wrists !== null && wrists !== undefined && wrists > 4) reasons.push(words(wrists, 'wrist'));
  if (ankles !== null && ankles !== undefined && ankles > 4) reasons.push(words(ankles, 'ankle'));
  if (penises !== null && penises !== undefined && penises > 1) reasons.push('more than one penis');
  if (vaginas !== null && vaginas !== undefined && vaginas > 1) reasons.push('more than one vulva');
  return { score: reasons.length, reasons };
}

export type TwoTakesLikelier = {
  pick: 'first' | 'second';
  /** The card's note under the take shown first. */
  note: string;
};

/**
 * Which of two takes to show first: the one with fewer counted oddities. Null on a tie or when
 * either take has no counts — the takes keep their order, no note.
 */
export function likelierTwoTake(
  first: DuoStillCounts | null | undefined,
  second: DuoStillCounts | null | undefined
): TwoTakesLikelier | null {
  if (!first || !second) return null;
  const a = duoStillDefects(first);
  const b = duoStillDefects(second);
  if (a.score === b.score) return null;
  const other = a.score < b.score ? b : a;
  const pick = a.score < b.score ? 'first' : 'second';
  return {
    pick,
    note: `Shown first — the other take counted ${other.reasons.join(', ')}. A hint only: you pick.`,
  };
}

// ── The ComfyUI graph ─────────────────────────────────────────────────────────────────────

/** Impact Pack nodes the count graph needs, besides DWPose and PreviewAny. */
export const DUO_COUNT_NODES = [
  'UltralyticsDetectorProvider',
  'BboxDetectorSEGS',
  'ImpactCount_Elts_in_SEGS',
] as const;

export const DUO_FACE_MODEL = 'bbox/face_yolov8m.pt';
export const DUO_HAND_MODEL = 'bbox/hand_yolov8s.pt';
export const DUO_PENIS_MODEL = 'segm/nsfw-seg-penis-s.pt';
export const DUO_VAGINA_MODEL = 'segm/nsfw-seg-vagina-s.pt';

/** Box confidence the counts use (what was measured). */
export const DUO_COUNT_THRESHOLD = 0.5;

/** Node ids whose PreviewAny text carries each count, and the DWPose read. */
export const DUO_COUNT_READ_IDS = {
  faces: 'ft',
  hands: 'ht',
  penises: 'pt',
  vaginas: 'vt',
  pose: 'dw',
} as const;

/**
 * LoadImage → YOLO face / hand boxes (and the nsfw part models when `parts` lists them) each
 * counted into a PreviewAny, plus DWPose (body only) for bodies, wrists and ankles. `detector`
 * is the DWPose node and its filled inputs minus the image (pose-detect-server fills them).
 */
export function buildDuoCountGraph(input: {
  imageName: string;
  detectorNode: string;
  detectorInputs: (image: [string, number]) => Record<string, unknown>;
  /** Installed nsfw part models (UltralyticsDetectorProvider options). */
  parts?: { penis?: boolean; vagina?: boolean };
}): Record<string, unknown> {
  const graph: Record<string, unknown> = {
    '1': { class_type: 'LoadImage', inputs: { image: input.imageName } },
    [DUO_COUNT_READ_IDS.pose]: {
      class_type: input.detectorNode,
      inputs: input.detectorInputs(['1', 0]),
    },
    dp: { class_type: 'PreviewImage', inputs: { images: [DUO_COUNT_READ_IDS.pose, 0] } },
  };
  const counter = (prefix: string, model: string, segm: boolean, readId: string) => {
    graph[`${prefix}m`] = {
      class_type: 'UltralyticsDetectorProvider',
      inputs: { model_name: model },
    };
    graph[`${prefix}s`] = {
      class_type: segm ? 'SegmDetectorSEGS' : 'BboxDetectorSEGS',
      inputs: {
        [segm ? 'segm_detector' : 'bbox_detector']: [`${prefix}m`, segm ? 1 : 0],
        image: ['1', 0],
        threshold: DUO_COUNT_THRESHOLD,
        dilation: 0,
        crop_factor: 1,
        drop_size: 10,
        labels: 'all',
      },
    };
    graph[`${prefix}c`] = {
      class_type: 'ImpactCount_Elts_in_SEGS',
      inputs: { segs: [`${prefix}s`, 0] },
    };
    graph[readId] = { class_type: 'PreviewAny', inputs: { source: [`${prefix}c`, 0] } };
  };
  counter('f', DUO_FACE_MODEL, false, DUO_COUNT_READ_IDS.faces);
  counter('h', DUO_HAND_MODEL, false, DUO_COUNT_READ_IDS.hands);
  if (input.parts?.penis) counter('p', DUO_PENIS_MODEL, true, DUO_COUNT_READ_IDS.penises);
  if (input.parts?.vagina) counter('v', DUO_VAGINA_MODEL, true, DUO_COUNT_READ_IDS.vaginas);
  return graph;
}

/** PreviewAny shows its source as text: `{ text: ["3"] }`. */
function readCount(raw: unknown): number | null {
  const text = (raw as { text?: unknown } | undefined)?.text;
  const value = Array.isArray(text) ? text[0] : text;
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

const WRISTS = [4, 7] as const;
const ANKLES = [10, 13] as const;
const MIN_BODY_JOINTS = 5;

/**
 * The job's outputs → counts. Null when neither a count nor the pose read came back (the graph
 * did not run). A missing part count stays null (model not installed, or not asked for).
 */
export function readDuoCountReplies(
  outputs: Record<string, unknown> | undefined
): DuoStillCounts | null {
  if (!outputs) return null;
  const faces = readCount(outputs[DUO_COUNT_READ_IDS.faces]);
  const hands = readCount(outputs[DUO_COUNT_READ_IDS.hands]);
  const penises = readCount(outputs[DUO_COUNT_READ_IDS.penises]);
  const vaginas = readCount(outputs[DUO_COUNT_READ_IDS.vaginas]);
  const poseRaw = (outputs[DUO_COUNT_READ_IDS.pose] as { openpose_json?: unknown[] } | undefined)
    ?.openpose_json?.[0];
  const pose = poseRaw === undefined ? null : parseOpenPoseJson(poseRaw);
  if (faces === null && hands === null && !pose) return null;
  let people: number | null = null;
  let wrists: number | null = null;
  let ankles: number | null = null;
  if (pose) {
    people = 0;
    wrists = 0;
    ankles = 0;
    for (const body of pose.people) {
      if (body.filter(Boolean).length >= MIN_BODY_JOINTS) people += 1;
      wrists += WRISTS.filter(index => body[index]).length;
      ankles += ANKLES.filter(index => body[index]).length;
    }
  }
  return {
    faces,
    hands,
    people,
    wrists,
    ankles,
    ...(penises !== null ? { penises } : {}),
    ...(vaginas !== null ? { vaginas } : {}),
  };
}
