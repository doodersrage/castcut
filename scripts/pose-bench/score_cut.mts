/**
 * Pose bench: does the pose check still pass a still cut to a picked close shot
 * (pose/shot-reframe.ts)? Scores each cut still's DWPose read against the uncut still's own read
 * as the guide — the same pose, so a pass is right and a miss is the crop's fault.
 *
 *   node --import tsx scripts/pose-bench/score_cut.mts <rows.jsonl>
 *
 * Each row: { key, uncut: DetectedPose, cut: DetectedPose } (the uncut and cut stills' reads).
 * Scored twice: as a planned pose (posture verdict) and as a custom pose (limbs judged too).
 */
import { readFileSync } from 'node:fs';
import {
  DEFAULT_MIN_POSE_MATCH,
  scorePoseMatch,
  type DetectedPose,
} from '../../src/lib/pose/score';

const rows = readFileSync(process.argv[2]!, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(line => JSON.parse(line) as { key: string; uncut?: DetectedPose; cut?: DetectedPose });
let planned = 0;
let custom = 0;
let total = 0;
for (const row of rows) {
  if (!row.uncut?.people?.length || !row.cut?.people?.length) {
    console.log(row.key, 'nobody read');
    continue;
  }
  const guide = row.uncut.people.slice(0, 1);
  const aspect = row.uncut.canvas.width / row.uncut.canvas.height;
  const asPlanned = scorePoseMatch({
    guide: guide as never,
    guideAspect: aspect,
    detected: row.cut,
  });
  const asCustom = scorePoseMatch({
    guide: guide as never,
    guideAspect: aspect,
    detected: row.cut,
    customPose: true,
  });
  total += 1;
  if (asPlanned.score >= DEFAULT_MIN_POSE_MATCH) planned += 1;
  if (asCustom.score >= DEFAULT_MIN_POSE_MATCH) custom += 1;
  console.log(
    row.key.padEnd(48),
    'planned',
    asPlanned.score.toFixed(2),
    asPlanned.posture[0]?.guide.posture,
    '→',
    asPlanned.posture[0]?.still?.posture,
    asPlanned.postureMiss ? 'POSTURE MISS' : '',
    '| custom',
    asCustom.score.toFixed(2),
    `limbs ${asCustom.limbScore}`,
    asCustom.limbMiss ? 'LIMB MISS' : ''
  );
}
console.log(`pass: planned ${planned}/${total}, custom ${custom}/${total}`);
