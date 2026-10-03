/**
 * Castcut node pack test vectors: the TypeScript pose check and mask repair run on a fixed set
 * of inputs, and their outputs are written where BOTH test suites read them —
 * `src/lib/castcut-vectors.test.ts` (the TS code still gives these answers) and
 * `comfyui-nodes/castcut/tests/test_castcut.py` (the Python port gives the same answers).
 *
 *   node --import tsx scripts/castcut-test-vectors.mts \
 *     [--dataset <pose-calibration.json>] [--every 5] \
 *     [--real-mask <still.png>:<birefnet-mask.png> ...]
 *
 * `--dataset` is the pose calibration set (scripts/pose-check-calibrate.mts format: rows of
 * { id, label, guide: { aspect, people }, openpose }); every Nth row is kept so the file stays
 * small. `--real-mask` adds a downscaled real still + its BiRefNet matte. Without options the
 * real rows already in the files are kept and only the synthetic cases are regenerated.
 *
 * Change the TS pose / mask code → rerun this → the Python tests say whether the port follows.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { synthesizeStickSkeleton } from '../src/lib/day-pose-guide';
import { compositeThroughMask, repairSubjectMask, type MaskRgb } from '../src/lib/isolate-mask';
import { stickToOpenPoseKeypoints } from '../src/lib/pose-guide-openpose';
import type { NormalizedBody } from '../src/lib/pose-library';
import { parseOpenPoseJson, scorePoseMatch } from '../src/lib/pose-score';

const ROOT = new URL('..', import.meta.url).pathname;
const VECTOR_DIR = join(ROOT, 'comfyui-nodes', 'castcut', 'tests', 'vectors');
const POSE_FILE = join(VECTOR_DIR, 'pose-score.json');
const MASK_FILE = join(VECTOR_DIR, 'mask-repair.json');

type PoseCase = {
  id: string;
  guide: { aspect: number; people: NormalizedBody[] };
  /** The DWPose frame as the node receives it (POSE_KEYPOINT / openpose_json). */
  openpose: unknown;
  method?: 'limb-angle' | 'joint-distance';
  expected: ReturnType<typeof scorePoseMatch> | null;
};

type MaskCase = {
  id: string;
  width: number;
  height: number;
  /** RGBA, base64. */
  rgba: string;
  /** Matte 0–255, base64. */
  alpha: string;
  regrowEdges: boolean;
  fill: MaskRgb;
  expected: {
    alpha: string;
    filledHolePixels: number;
    regrownPixels: number;
    backdrop: MaskRgb | null;
    plainBackdrop: boolean;
    composite: string;
  };
};

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const realMasks = args.flatMap((arg, i) => (args[i - 1] === '--real-mask' ? [arg] : []));

// ---------------------------------------------------------------------------------- pose

type Base = 'stand' | 'walk' | 'sit' | 'crouch' | 'kneel' | 'lie';
type Arm = 'down' | 'up' | 'out';

function figure(base: Base, arms: [Arm, Arm] = ['down', 'down'], centerX = 0.5): NormalizedBody {
  return stickToOpenPoseKeypoints(
    synthesizeStickSkeleton(
      {
        base,
        armLeft: arms[0],
        armRight: arms[1],
        lean: 0,
        stride: 0.2,
        seed: 11,
        people: 1,
        label: base,
      },
      { centerX }
    )
  ).map(p => (p ? { x: p.x / 512, y: p.y / 768 } : null));
}

/** People → a DWPose frame in pixels on a 512×768 canvas (what controlnet_aux emits). */
function frame(people: NormalizedBody[], width = 512, height = 768) {
  return {
    canvas_width: width,
    canvas_height: height,
    people: people.map(body => ({
      pose_keypoints_2d: Array.from({ length: 18 }, (_, i) => body[i] ?? null).flatMap(point =>
        point ? [point.x * width, point.y * height, 1] : [0, 0, 0]
      ),
    })),
  };
}

function jitter(body: NormalizedBody, amount: number): NormalizedBody {
  return body.map((p, i) =>
    p ? { x: p.x + Math.sin(i * 7.1) * amount, y: p.y + Math.cos(i * 3.3) * amount } : null
  );
}

function syntheticPoseCases(): Array<Omit<PoseCase, 'expected'>> {
  const out: Array<Omit<PoseCase, 'expected'>> = [];
  const bases: Base[] = ['stand', 'walk', 'sit', 'crouch', 'kneel', 'lie'];
  const arms: Array<[Arm, Arm]> = [
    ['down', 'down'],
    ['up', 'up'],
    ['out', 'down'],
  ];
  for (const guideBase of bases) {
    for (const stillBase of bases) {
      const guideArms = arms[(bases.indexOf(guideBase) + bases.indexOf(stillBase)) % arms.length]!;
      out.push({
        id: `synthetic:${guideBase}-vs-${stillBase}`,
        guide: { aspect: 512 / 768, people: [figure(guideBase, guideArms)] },
        openpose: frame([jitter(figure(stillBase), 0.008)]),
      });
    }
  }
  const stand = figure('stand', ['up', 'down']);
  out.push(
    {
      id: 'synthetic:mirrored-one-arm',
      guide: { aspect: 512 / 768, people: [stand] },
      openpose: frame([stand.map(p => (p ? { x: 1 - p.x, y: p.y } : null))]),
    },
    {
      id: 'synthetic:legs-cut-at-frame-edge',
      guide: { aspect: 512 / 768, people: [figure('stand')] },
      openpose: frame([
        figure('stand').map((p, i) => ([9, 10, 12, 13].includes(i) ? { x: p!.x, y: 0.999 } : p)),
      ]),
    },
    {
      id: 'synthetic:duo-vs-two-and-a-bystander',
      guide: {
        aspect: 512 / 768,
        people: [figure('stand', ['down', 'down'], 0.3), figure('sit', ['up', 'up'], 0.7)],
      },
      openpose: frame([
        jitter(figure('sit', ['up', 'up'], 0.7), 0.01),
        figure('walk', ['down', 'down'], 0.95).map(p =>
          p ? { x: p.x, y: 0.1 + p.y * 0.2 } : null
        ),
        jitter(figure('stand', ['down', 'down'], 0.3), 0.01),
      ]),
    },
    {
      id: 'synthetic:duo-one-found',
      guide: {
        aspect: 512 / 768,
        people: [figure('kneel', ['down', 'down'], 0.3), figure('lie', ['out', 'down'], 0.7)],
      },
      openpose: frame([jitter(figure('kneel', ['down', 'down'], 0.3), 0.01)]),
    },
    {
      id: 'synthetic:nobody-found',
      guide: { aspect: 512 / 768, people: [figure('walk')] },
      openpose: frame([]),
    },
    {
      id: 'synthetic:few-joints-read',
      guide: { aspect: 512 / 768, people: [figure('crouch')] },
      openpose: frame([figure('crouch').map((p, i) => (i <= 2 ? p : null))]),
    },
    {
      id: 'synthetic:normalized-coordinates',
      guide: { aspect: 512 / 768, people: [figure('walk', ['out', 'out'])] },
      openpose: {
        canvas_width: 0,
        canvas_height: 0,
        people: [
          {
            pose_keypoints_2d: jitter(figure('walk'), 0.02).flatMap(p =>
              p ? [p.x, p.y, 0.9] : [0, 0, 0]
            ),
          },
        ],
      },
    },
    {
      id: 'synthetic:landscape-still-vs-portrait-guide',
      guide: { aspect: 512 / 768, people: [figure('lie')] },
      openpose: frame(
        [figure('lie').map(p => (p ? { x: 0.2 + p.x * 0.6, y: 0.1 + p.y * 0.8 } : null))],
        1024,
        768
      ),
    },
    {
      id: 'synthetic:joint-distance-method',
      guide: { aspect: 512 / 768, people: [figure('walk')] },
      openpose: frame([jitter(figure('walk'), 0.02)]),
      method: 'joint-distance',
    }
  );
  return out;
}

function realPoseCases(): Array<Omit<PoseCase, 'expected'>> {
  const dataset = option('--dataset');
  if (!dataset) {
    const previous = existsSync(POSE_FILE)
      ? (JSON.parse(readFileSync(POSE_FILE, 'utf8')) as { cases: PoseCase[] }).cases
      : [];
    return previous.filter(entry => !entry.id.startsWith('synthetic:'));
  }
  const every = Math.max(1, Number(option('--every') ?? '5'));
  const rows = JSON.parse(readFileSync(dataset, 'utf8')) as Array<{
    id: string;
    label: string;
    guide: { aspect: number; people: NormalizedBody[] };
    openpose: unknown;
  }>;
  return rows
    .filter((_, index) => index % every === 0)
    .map(row => {
      const raw = typeof row.openpose === 'string' ? JSON.parse(row.openpose) : row.openpose;
      return {
        id: `real:${row.label}:${row.id}`,
        guide: row.guide,
        // A list of frames (as openpose_json carries it); the node takes the frame itself.
        openpose: Array.isArray(raw) ? raw[0] : raw,
      };
    });
}

// ---------------------------------------------------------------------------------- mask

const b64 = (bytes: Uint8Array | Uint8ClampedArray) =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
const fromB64 = (text: string) => new Uint8Array(Buffer.from(text, 'base64'));

function syntheticMaskInputs(): Array<Omit<MaskCase, 'expected'>> {
  const cases: Array<Omit<MaskCase, 'expected'>> = [];
  const make = (
    id: string,
    width: number,
    height: number,
    pixel: (x: number, y: number) => [number, number, number, number],
    matte: (x: number, y: number) => number,
    regrowEdges: boolean,
    fill: MaskRgb = { r: 255, g: 255, b: 255 }
  ) => {
    const rgba = new Uint8Array(width * height * 4);
    const alpha = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        const [r, g, b, a] = pixel(x, y);
        rgba[o] = r;
        rgba[o + 1] = g;
        rgba[o + 2] = b;
        rgba[o + 3] = a;
        alpha[y * width + x] = matte(x, y);
      }
    }
    cases.push({ id, width, height, rgba: b64(rgba), alpha: b64(alpha), regrowEdges, fill });
  };
  const box = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) =>
    x >= x0 && x < x1 && y >= y0 && y < y1;
  // A person (skin) on a white wall with a dark cape the matte dropped (an enclosed hole), and a
  // gap between arm and hip that IS the wall (stays out).
  make(
    'synthetic:cape-hole-and-arm-gap',
    40,
    48,
    (x, y) =>
      box(x, y, 14, 14, 22, 26)
        ? [20, 20, 30, 255]
        : box(x, y, 24, 20, 27, 30)
          ? [250, 250, 250, 255]
          : box(x, y, 10, 6, 30, 44)
            ? [200, 150, 120, 255]
            : [250, 250, 250, 255],
    (x, y) =>
      box(x, y, 14, 14, 22, 26) || box(x, y, 24, 20, 27, 30)
        ? 10
        : box(x, y, 10, 6, 30, 44)
          ? (x + y) % 7 === 0
            ? 210
            : 255
          : 0,
    false
  );
  // Plain backdrop with dark jeans the matte left out at the bottom (touching the person).
  make(
    'synthetic:plain-backdrop-regrow',
    36,
    44,
    (x, y) =>
      box(x, y, 12, 30, 24, 44)
        ? [30, 40, 70, 255]
        : box(x, y, 10, 4, 26, 30)
          ? [190, 140, 110, 255]
          : [240, 240, 236, 255],
    (x, y) => (box(x, y, 10, 4, 26, 30) ? 255 : box(x, y, 12, 30, 24, 44) ? 60 : 4),
    true,
    { r: 0, g: 177, b: 64 }
  );
  // Noisy backdrop (not plain): no regrowth even when asked; soft rim values; source alpha.
  make(
    'synthetic:noisy-backdrop-source-alpha',
    32,
    32,
    (x, y) =>
      box(x, y, 8, 6, 24, 28)
        ? [120, 90, 200, x < 12 ? 128 : 255]
        : [(x * 37) % 256, (y * 53) % 256, ((x + y) * 29) % 256, 255],
    (x, y) =>
      box(x, y, 8, 6, 24, 28) ? (box(x, y, 14, 12, 18, 18) ? 90 : 230) : x === 7 ? 150 : 0,
    true
  );
  // Tiny image: under 16 pixels, returned as is.
  make(
    'synthetic:tiny',
    3,
    3,
    () => [10, 20, 30, 255],
    (x, y) => (x + y) * 40,
    true
  );
  return cases;
}

async function realMaskInputs(): Promise<Array<Omit<MaskCase, 'expected'>>> {
  if (realMasks.length === 0) {
    const previous = existsSync(MASK_FILE)
      ? (JSON.parse(readFileSync(MASK_FILE, 'utf8')) as { cases: MaskCase[] }).cases
      : [];
    return previous.filter(entry => !entry.id.startsWith('synthetic:'));
  }
  const out: Array<Omit<MaskCase, 'expected'>> = [];
  for (const pair of realMasks) {
    const [still, matte] = pair.split(':');
    if (!still || !matte) continue;
    const meta = await sharp(still).metadata();
    const width = 48;
    const height = Math.round((48 * (meta.height ?? 64)) / (meta.width ?? 48));
    const rgba = await sharp(still)
      .ensureAlpha()
      .resize(width, height, { fit: 'fill' })
      .raw()
      .toBuffer();
    const alpha = await sharp(matte)
      .removeAlpha()
      .greyscale()
      .resize(width, height, { fit: 'fill' })
      .raw()
      .toBuffer();
    const name = still.split('/').pop() ?? still;
    for (const regrowEdges of [false, true]) {
      out.push({
        id: `real:${name}:${regrowEdges ? 'regrow' : 'birefnet'}`,
        width,
        height,
        rgba: b64(new Uint8Array(rgba)),
        alpha: b64(new Uint8Array(alpha)),
        regrowEdges,
        fill: { r: 255, g: 255, b: 255 },
      });
    }
  }
  return out;
}

function expectMask(input: Omit<MaskCase, 'expected'>): MaskCase {
  const rgba = fromB64(input.rgba);
  const alpha = fromB64(input.alpha);
  const repaired = repairSubjectMask(alpha, rgba, input.width, input.height, {
    regrowEdges: input.regrowEdges,
  });
  return {
    ...input,
    expected: {
      alpha: b64(repaired.alpha),
      filledHolePixels: repaired.filledHolePixels,
      regrownPixels: repaired.regrownPixels,
      backdrop: repaired.backdrop,
      plainBackdrop: repaired.plainBackdrop,
      composite: b64(compositeThroughMask(rgba, repaired.alpha, input.fill)),
    },
  };
}

function expectPose(input: Omit<PoseCase, 'expected'>): PoseCase {
  // The node's own parse step is part of what is checked: the frame goes in raw.
  const detected = parseOpenPoseJson(input.openpose);
  return {
    ...input,
    expected: detected
      ? scorePoseMatch({
          guide: input.guide.people,
          guideAspect: input.guide.aspect,
          detected,
          ...(input.method ? { method: input.method } : {}),
        })
      : null,
  };
}

const poseCases = [...syntheticPoseCases(), ...realPoseCases()].map(expectPose);
const maskCases = [...syntheticMaskInputs(), ...(await realMaskInputs())].map(expectMask);

const header = {
  generator: 'scripts/castcut-test-vectors.mts',
  note: 'Generated from the TypeScript implementation — regenerate, do not edit by hand.',
};
writeFileSync(POSE_FILE, `${JSON.stringify({ ...header, cases: poseCases })}\n`);
writeFileSync(MASK_FILE, `${JSON.stringify({ ...header, cases: maskCases })}\n`);
console.log(
  `pose: ${poseCases.length} cases (${poseCases.filter(c => c.id.startsWith('real:')).length} real) → ${POSE_FILE}`
);
console.log(
  `mask: ${maskCases.length} cases (${maskCases.filter(c => c.id.startsWith('real:')).length} real) → ${MASK_FILE}`
);
