/**
 * Pose check calibration: old joint-distance score vs limb-angle score + posture class on a
 * labelled set of stills.
 *
 *   node --import tsx scripts/pose-check-calibrate.mts <dataset.json> [--rows]
 *
 * The dataset is a JSON array of
 *   { id, label: 'R' | 'W', guide: { aspect, people: NormalizedBody[] }, openpose: <DWPose json> }
 * where `label` is the still judged by eye against its guide (R = pose right, W = wrong) and
 * `openpose` is the DWPose `openpose_json` of the still (as `/api/pose-detect` reads it).
 * Prints precision / recall for catching wrong poses and the false-alarm rate on right ones for
 * a sweep of thresholds.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import {
  DEFAULT_MIN_POSE_MATCH,
  JOINT_DISTANCE_MIN_POSE_MATCH,
  parseOpenPoseJson,
  scorePoseMatch,
} from '../src/lib/pose-score';

type Row = {
  id: string;
  label: 'R' | 'W';
  guide: { aspect: number; people: Array<Array<{ x: number; y: number } | null>> };
  openpose: unknown;
};

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('usage: pose-check-calibrate.mts <dataset.json> [--rows]');
  process.exit(1);
}
const rows = JSON.parse(readFileSync(file, 'utf8')) as Row[];

const scored = rows.flatMap(row => {
  const detected = parseOpenPoseJson(row.openpose);
  if (!detected || row.guide.people.length === 0) return [];
  const input = { guide: row.guide.people, guideAspect: row.guide.aspect, detected };
  const limb = scorePoseMatch({ ...input, method: 'limb-angle' });
  return [
    {
      id: row.id,
      wrong: row.label === 'W',
      joint: limb.jointScore,
      limb: limb.limbScore,
      score: limb.score,
      postureMiss: limb.postureMiss,
      gestureMiss: limb.gestureMiss,
      posture: limb.posture
        .map(
          p =>
            `${p.guide.posture}${p.guide.confident ? '' : '?'}→${p.still?.posture ?? '-'}${p.still?.confident ? '' : '?'}`
        )
        .join(' '),
      off: limb.offLimbs.slice(0, 3).join(','),
      deltas: limb.limbDeltas,
      postures: limb.posture,
    },
  ];
});

const dumpAt = flags.indexOf('--dump');
if (dumpAt >= 0 && flags[dumpAt + 1]) {
  writeFileSync(flags[dumpAt + 1]!, JSON.stringify(scored, null, 1));
}

if (flags.includes('--rows')) {
  for (const s of [...scored].sort((a, b) => a.limb - b.limb)) {
    console.log(
      `${s.wrong ? 'W' : 'R'}  joint ${s.joint.toFixed(2)}  limb ${s.limb.toFixed(2)}  score ${s.score.toFixed(2)}  ${s.postureMiss ? 'POSTURE ' : ''}${s.gestureMiss ? 'GESTURE ' : ''}${s.posture}  [${s.off}]  ${s.id}`
    );
  }
}

function stats(flag: (s: (typeof scored)[number]) => boolean) {
  const tp = scored.filter(s => s.wrong && flag(s)).length;
  const fp = scored.filter(s => !s.wrong && flag(s)).length;
  const wrong = scored.filter(s => s.wrong).length;
  const right = scored.length - wrong;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = wrong > 0 ? tp / wrong : 1;
  return { tp, fp, wrong, right, precision, recall, falseAlarm: right > 0 ? fp / right : 0 };
}

const pct = (value: number) => `${Math.round(value * 100)}%`.padStart(4);
const line = (name: string, s: ReturnType<typeof stats>) =>
  `${name.padEnd(34)} caught ${String(s.tp).padStart(2)}/${s.wrong}  recall ${pct(s.recall)}  precision ${pct(s.precision)}  false alarms ${String(s.fp).padStart(2)}/${s.right} (${pct(s.falseAlarm)})`;

console.log(
  `${scored.length} stills: ${scored.filter(s => s.wrong).length} wrong, ${scored.filter(s => !s.wrong).length} right\n`
);
for (const t of [0.4, 0.5, JOINT_DISTANCE_MIN_POSE_MATCH, 0.7]) {
  console.log(
    line(
      `joint-distance < ${t}`,
      stats(s => s.joint < t)
    )
  );
}
for (const t of [0.3, 0.4, 0.5, 0.6]) {
  console.log(
    line(
      `limb-angle score alone < ${t}`,
      stats(s => s.limb < t)
    )
  );
}
console.log(
  line(
    'posture class',
    stats(s => s.postureMiss)
  )
);
console.log(
  line(
    'gesture (3+ defining segments off)',
    stats(s => s.gestureMiss)
  )
);
console.log(
  line(
    `limb-angle check (score < ${DEFAULT_MIN_POSE_MATCH})`,
    stats(s => s.score < DEFAULT_MIN_POSE_MATCH)
  )
);
