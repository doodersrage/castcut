/**
 * Does the lifted 3D figure look like the picture it came from? Every one-person reference pose
 * (public/pose-references.json) and the starters are lifted into the rig, then checked three ways:
 *
 *  - editor: the figure through the editor's camera on open, against the source points;
 *  - director: "Her pose in the picture" in the Director (lift → straighten → level head →
 *    ground → the Director's camera framed like the still), against the source points;
 *  - posture: the 3D figure's posture (standing, seated, kneeling, crouched, bent over, lying)
 *    against the posture the reference is filed under (sit, kneel, lie, bend_pick…).
 *
 * Writes a JSON summary and, with --sheet DIR, SVG contact sheets (source | editor view | the
 * figure from its side | Director preview) of the worst poses.
 *
 *   node --import tsx scripts/pose-3d/lift-check.mts [--sheet DIR] [--worst 40] [--json FILE]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Vector3 } from 'three';
import {
  DEFAULT_CAMERA,
  liftBodies,
  makeCamera,
  openPoseWorld,
  projectFigure,
  projectPoint,
  figureWorld,
} from '../../src/lib/pose/rig3d-pose';
import type { NormalizedBody } from '../../src/lib/pose/library';
import type { PoseRig3dCamera, PoseRig3dFigure } from '../../src/lib/pose/rig3d';
import { POSE_STARTERS, poseStarterBody } from '../../src/lib/pose/starters';
import { stillPoseFigure } from '../../src/lib/director/poses';
import { frameDirection, framingCameraAt, readStillFraming } from '../../src/lib/director/framing';
import { DEFAULT_DIRECTOR_CAMERA } from '../../src/lib/director/types';
import { classifyPosture, expectedPostures, type Posture } from '../../src/lib/pose/rig3d-posture';

const ROOT = new URL('../..', import.meta.url).pathname;
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const sheetDir = arg('--sheet');
const worstCount = Number(arg('--worst') ?? 40);
const jsonOut = arg('--json');
const only = arg('--only');

type Case = { id: string; pose: string; aspect: number; body: NormalizedBody };
const refs = JSON.parse(readFileSync(join(ROOT, 'public/pose-references.json'), 'utf8')) as {
  references: Array<{ id: string; pose: string; aspect: number; people: NormalizedBody[] }>;
};
let cases: Case[] = [
  ...refs.references
    .filter(ref => ref.people.length === 1)
    .map(ref => ({ id: ref.id, pose: ref.pose, aspect: ref.aspect, body: ref.people[0]! })),
  ...POSE_STARTERS.map(s => ({
    id: `starter-${s.id}`,
    pose: s.id === 'lie' ? 'lie' : s.id,
    aspect: 2 / 3,
    body: poseStarterBody(s.id),
  })),
];
if (only) cases = cases.filter(c => only.split(',').some(o => c.id.startsWith(o)));

const err = (a: { x: number; y: number }, b: { x: number; y: number }, aspect: number) =>
  Math.hypot((a.x - b.x) * aspect, a.y - b.y);

function compare(source: NormalizedBody, got: NormalizedBody, aspect: number) {
  let sum = 0;
  let n = 0;
  let worst = 0;
  for (let i = 0; i < 14; i += 1) {
    const p = source[i];
    const q = got[i];
    if (!p || !q) continue;
    const d = err(p, q, aspect);
    sum += d;
    n += 1;
    worst = Math.max(worst, d);
  }
  let faceFlips = 0;
  for (const i of [0, 14, 15, 16, 17]) if (Boolean(source[i]) !== Boolean(got[i])) faceFlips += 1;
  return { mean: n ? sum / n : 0, worst, faceFlips };
}

/** Points through a camera, without the visibility rules (for drawing). */
function seen(figure: PoseRig3dFigure, camera: PoseRig3dCamera, aspect: number) {
  const cam = makeCamera(camera, aspect);
  return openPoseWorld(figure).map(p => projectPoint(cam, p));
}

/** The figure seen from its own left side (90° round from the camera), framed on the hips. */
function sideCamera(figure: PoseRig3dFigure, camera: PoseRig3dCamera): PoseRig3dCamera {
  const hips = figureWorld(figure).pos.hips!;
  const from = new Vector3(...camera.position).sub(hips);
  const flat = new Vector3(from.x, 0, from.z);
  const d = Math.max(3, flat.length());
  flat.normalize();
  // Rotate 90° about y.
  const side = new Vector3(flat.z, 0, -flat.x);
  return {
    position: hips
      .clone()
      .add(side.multiplyScalar(d))
      .add(new Vector3(0, 0.1, 0))
      .toArray() as [number, number, number],
    target: hips.toArray() as [number, number, number],
    fov: 30,
  };
}

type Row = {
  id: string;
  pose: string;
  editor: ReturnType<typeof compare>;
  director: ReturnType<typeof compare> | null;
  posture: Posture;
  expected: Posture[] | null;
  postureOk: boolean | null;
  /** The spine's lean toward (+) or away from (−) the camera, degrees. */
  lean: number;
  /** How much the limbs point along the line of sight (0 flat to the picture, 1 straight at it). */
  depthiness: number;
};

const rows: Row[] = [];
const drawings = new Map<
  string,
  {
    c: Case;
    panels: Array<{
      label: string;
      pts: Array<{ x: number; y: number } | null>;
      under?: NormalizedBody;
      aspect: number;
    }>;
  }
>();

for (const c of cases) {
  const rig = liftBodies([c.body], c.aspect, ['female']);
  const figure = rig.figures[0]!;
  const editorView = projectFigure(figure, rig.camera, c.aspect);
  const editor = compare(c.body, editorView, c.aspect);
  const posture = classifyPosture(figure);
  const world = openPoseWorld(figure);
  const eye = new Vector3(...rig.camera.position);
  const hipMid = world[8]!.clone().add(world[11]!).multiplyScalar(0.5);
  const toEye = eye.clone().sub(hipMid).setY(0).normalize();
  const spine = world[1]!.clone().sub(hipMid);
  const lean = (Math.atan2(spine.dot(toEye), spine.y) * 180) / Math.PI;
  const LIMB_PAIRS: Array<[number, number]> = [
    [2, 3],
    [3, 4],
    [5, 6],
    [6, 7],
    [8, 9],
    [9, 10],
    [11, 12],
    [12, 13],
  ];
  const depthiness =
    LIMB_PAIRS.reduce(
      (s, [a, b]) =>
        s +
        Math.abs(world[a]!.distanceTo(eye) - world[b]!.distanceTo(eye)) /
          Math.max(1e-6, world[a]!.distanceTo(world[b]!)),
      0
    ) / LIMB_PAIRS.length;
  const expected = expectedPostures(c.pose);
  // Director: "Her pose in the picture".
  let director: Row['director'] = null;
  let directorPts: NormalizedBody | null = null;
  const still = readStillFraming(c.body);
  if (c.body[1]) {
    const { figure: start, side, turned, view } = stillPoseFigure(c.body, c.aspect, 'female');
    const facing =
      turned < 22.5 ? 'front' : turned < 65 ? 'three-quarter' : turned < 125 ? 'side' : 'back';
    const framing = frameDirection({
      frames: [start],
      camera: { ...DEFAULT_DIRECTOR_CAMERA, direction: facing, side, shot: 'picture', view },
      aspect: c.aspect,
      still,
    });
    // The preview's first frame: the still's framing, when the move eases back from it.
    directorPts = projectFigure(start, framingCameraAt(framing, 0), c.aspect);
    director = compare(c.body, directorPts, c.aspect);
  }
  rows.push({
    id: c.id,
    pose: c.pose,
    editor,
    director,
    posture,
    expected,
    postureOk: expected ? expected.includes(posture) : null,
    lean,
    depthiness,
  });
  if (sheetDir) {
    drawings.set(c.id, {
      c,
      panels: [
        { label: 'source', pts: c.body, aspect: c.aspect },
        { label: 'editor', pts: editorView, under: c.body, aspect: c.aspect },
        {
          label: `side (${posture})`,
          pts: seen(figure, sideCamera(figure, rig.camera), c.aspect),
          aspect: c.aspect,
        },
        ...(directorPts
          ? [{ label: 'director', pts: directorPts, under: c.body, aspect: c.aspect }]
          : []),
      ],
    });
  }
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const refRows = rows.filter(r => !r.id.startsWith('starter-'));
const checked = refRows.filter(r => r.postureOk !== null);
const MATCH = 0.03; // mean joint error under 3% of the picture height reads as "the same pose"
const summary = {
  poses: refRows.length,
  editor: {
    mean: mean(refRows.map(r => r.editor.mean)),
    worst: Math.max(...refRows.map(r => r.editor.worst)),
    meanWorst: mean(refRows.map(r => r.editor.worst)),
    faceFlips: refRows.reduce((s, r) => s + r.editor.faceFlips, 0),
  },
  director: {
    mean: mean(refRows.filter(r => r.director).map(r => r.director!.mean)),
    meanWorst: mean(refRows.filter(r => r.director).map(r => r.director!.worst)),
    matching: refRows.filter(r => r.director && r.director.mean < MATCH).length,
    of: refRows.filter(r => r.director).length,
  },
  posture: {
    checked: checked.length,
    ok: checked.filter(r => r.postureOk).length,
    wrong: checked.filter(r => !r.postureOk).map(r => `${r.id}:${r.posture}`),
  },
  starters: rows
    .filter(r => r.id.startsWith('starter-'))
    .map(
      r =>
        `${r.id}: ${r.posture} editor ${pct(r.editor.mean)} director ${r.director ? pct(r.director.mean) : '-'}`
    ),
};
console.log(`${summary.poses} one-person references`);
console.log(
  `editor view: mean ${pct(summary.editor.mean)}, mean worst joint ${pct(summary.editor.meanWorst)}, worst ${pct(summary.editor.worst)}, face points flipped ${summary.editor.faceFlips}`
);
console.log(
  `director view: mean ${pct(summary.director.mean)}, mean worst joint ${pct(summary.director.meanWorst)}, ${summary.director.matching}/${summary.director.of} under ${pct(MATCH)}`
);
console.log(`posture: ${summary.posture.ok}/${summary.posture.checked} as filed`);
const standing = refRows.filter(r => r.expected?.[0] === 'stand');
console.log(
  `standing poses: spine leans in depth ${mean(standing.map(r => Math.abs(r.lean))).toFixed(1)}° on average, ${standing.filter(r => Math.abs(r.lean) > 15).length}/${standing.length} over 15°; limbs along the line of sight ${(mean(refRows.map(r => r.depthiness)) * 100).toFixed(1)}%`
);
console.log(`  wrong: ${summary.posture.wrong.join(' ')}`);
for (const s of summary.starters) console.log(`  ${s}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ summary, rows }, null, 1));

// ── Sheets ─────────────────────────────────────────────────────────────────────────────
const LIMBS: Array<[number, number, string]> = [
  [1, 2, '#c00'],
  [2, 3, '#c60'],
  [3, 4, '#cc0'],
  [1, 5, '#6c0'],
  [5, 6, '#0c0'],
  [6, 7, '#0c6'],
  [1, 8, '#0cc'],
  [8, 9, '#06c'],
  [9, 10, '#00c'],
  [1, 11, '#60c'],
  [11, 12, '#c0c'],
  [12, 13, '#c06'],
  [1, 0, '#888'],
  [0, 14, '#888'],
  [0, 15, '#888'],
  [14, 16, '#888'],
  [15, 17, '#888'],
];
function skeleton(
  pts: Array<{ x: number; y: number } | null>,
  w: number,
  h: number,
  faint = false
) {
  let s = '';
  for (const [a, b, color] of LIMBS) {
    const p = pts[a];
    const q = pts[b];
    if (!p || !q) continue;
    s += `<line x1="${(p.x * w).toFixed(1)}" y1="${(p.y * h).toFixed(1)}" x2="${(q.x * w).toFixed(1)}" y2="${(q.y * h).toFixed(1)}" stroke="${faint ? '#bbb' : color}" stroke-width="${faint ? 5 : 3}" stroke-linecap="round"/>`;
  }
  return s;
}
if (sheetDir) {
  mkdirSync(sheetDir, { recursive: true });
  const score = (r: Row) =>
    (r.postureOk === false ? 1 : 0) + (r.director?.mean ?? 0) * 10 + r.editor.mean * 10;
  const pick = only ? rows : [...rows].sort((a, b) => score(b) - score(a)).slice(0, worstCount);
  const H = 220;
  const perRow = 2;
  const blocks = pick.map(r => {
    const d = drawings.get(r.id)!;
    const w = Math.round(H * d.c.aspect);
    const cell = Math.max(w, 120);
    let x = 0;
    let svg = '';
    for (const panel of d.panels) {
      svg += `<g transform="translate(${x},16)"><rect width="${cell}" height="${H}" fill="#fafafa" stroke="#ddd"/>`;
      svg += `<g transform="translate(${(cell - w) / 2},0)">`;
      if (panel.under) svg += skeleton(panel.under, w, H, true);
      svg += skeleton(panel.pts, w, H);
      svg += `</g><text x="3" y="${H - 4}" font-size="10" fill="#555">${panel.label}</text></g>`;
      x += cell + 4;
    }
    const title = `${r.id}  ed ${pct(r.editor.mean)}  dir ${r.director ? pct(r.director.mean) : '-'}  ${r.posture}${r.expected ? ` (want ${r.expected.join('/')})` : ''}`;
    return {
      width: x,
      svg: `<text x="0" y="11" font-size="11" font-family="sans-serif">${title}</text>${svg}`,
    };
  });
  const colW = Math.max(...blocks.map(b => b.width)) + 16;
  const rowH = H + 24;
  let body = '';
  blocks.forEach((b, i) => {
    body += `<g transform="translate(${(i % perRow) * colW + 8},${Math.floor(i / perRow) * rowH + 8})">${b.svg}</g>`;
  });
  const total = `<svg xmlns="http://www.w3.org/2000/svg" width="${colW * perRow + 16}" height="${Math.ceil(blocks.length / perRow) * rowH + 16}" font-family="sans-serif"><rect width="100%" height="100%" fill="#fff"/>${body}</svg>`;
  writeFileSync(join(sheetDir, 'sheet.svg'), total);
  console.log(`sheet: ${join(sheetDir, 'sheet.svg')} (${blocks.length} poses)`);
}
