/**
 * Pose bench: scorePoseMatch for run_jobs.py results (variant experiments), against the
 * reference skeleton of each row's `target` (public/pose-references.json).
 *
 *   node --import tsx scripts/pose-bench/score_jobs.mts <results.jsonl> <scores.json>
 *
 * Rows without a reference target (Day's own poses, the camera bench) are skipped.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  DEFAULT_MIN_POSE_MATCH,
  scorePoseMatch,
  type DetectedPose,
} from '../../src/lib/pose/score';

type Body = Array<{ x: number; y: number } | null>;
type Ref = { id: string; aspect: number; people: Body[] };
const refs = new Map(
  (
    JSON.parse(readFileSync('public/pose-references.json', 'utf8')) as { references: Ref[] }
  ).references.map(ref => [ref.id, ref])
);
const [input, output] = process.argv.slice(2) as [string, string];
const scores: Record<string, unknown> = {};
for (const line of readFileSync(input, 'utf8').split('\n').filter(Boolean)) {
  const row = JSON.parse(line) as { key: string; target: string; detected?: DetectedPose | null };
  const ref = refs.get(row.target);
  if (!ref) continue;
  if (!row.detected?.people?.length) {
    scores[row.key] = { score: null, note: 'nobody detected' };
    continue;
  }
  const match = scorePoseMatch({
    guide: ref.people as never,
    guideAspect: ref.aspect,
    detected: row.detected,
    customPose: true,
  });
  scores[row.key] = {
    score: Math.round(match.score * 1000) / 1000,
    limbScore: match.limbScore == null ? null : Math.round(match.limbScore * 1000) / 1000,
    pass: match.score >= DEFAULT_MIN_POSE_MATCH,
    postureMiss: match.postureMiss,
  };
}
writeFileSync(output, JSON.stringify(scores, null, 1));
console.log('scored', Object.keys(scores).length);
