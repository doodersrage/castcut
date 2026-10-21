/**
 * Pose bench, step 3: the app's own pose check on every rendered still, and (photo mode) the
 * detected skeleton against the reference skeleton before anything was rendered.
 *
 *   node --import tsx scripts/pose-bench/score.mts <work-dir>
 *
 * Reads <work-dir>/results.jsonl and the captures, writes <work-dir>/scores.json: per still the
 * scorePoseMatch result against the target skeleton (limb angles + posture class, the score
 * Day's redo gate compares with DEFAULT_MIN_POSE_MATCH), and per photo target the stored
 * PhotoPose (detected skeleton + vision posture) scored against the reference and the words
 * describePhotoPose makes from the reference skeleton alone (what "custom joints" would say).
 * The vision gesture step Day adds for a passing still (checkStillPoseVision) is not run.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_MIN_POSE_MATCH,
  scorePoseMatch,
  type DetectedPose,
} from '../../src/lib/pose/score';
import { describePhotoPose } from '../../src/lib/pose/describe';
import { classifyPosture } from '../../src/lib/pose/posture';
import type { PhotoPose } from '../../src/lib/pose/types';

type Body = Array<{ x: number; y: number } | null>;
type Ref = { id: string; aspect: number; people: Body[]; source: string };
const work = process.argv[2]!;
const refs = new Map(
  (
    JSON.parse(readFileSync('public/pose-references.json', 'utf8')) as { references: Ref[] }
  ).references.map(ref => [ref.id, ref])
);

type Result = {
  engine: string;
  mode: string;
  target: string;
  seed: number;
  file?: string;
  detected?: DetectedPose | null;
  error?: string;
  [key: string]: unknown;
};
const results: Result[] = existsSync(join(work, 'results.jsonl'))
  ? readFileSync(join(work, 'results.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as Result)
  : [];

// Latest row per (engine, mode, target, seed).
const latest = new Map<string, Result>();
for (const row of results) latest.set(`${row.engine}|${row.mode}|${row.target}|${row.seed}`, row);

const posture = (body: Body, aspect: number) => {
  const read = classifyPosture(body as never, aspect);
  return `${read.posture}${read.confident ? '' : '?'}`;
};

const stills = [...latest.values()].map(row => {
  const ref = refs.get(row.target)!;
  const out: Record<string, unknown> = { ...row };
  delete out.detected;
  if (row.detected && row.detected.people?.length) {
    const match = scorePoseMatch({
      guide: ref.people as never,
      guideAspect: ref.aspect,
      detected: row.detected,
    });
    out.check = {
      score: match.score,
      pass: match.score >= DEFAULT_MIN_POSE_MATCH,
      limbScore: match.limbScore,
      postureMiss: match.postureMiss,
      gestureMiss: match.gestureMiss,
      posture: match.posture.map(
        p =>
          `${p.guide.posture}${p.guide.confident ? '' : '?'}→${p.still?.posture ?? '-'}${p.still?.confident ? '' : '?'}`
      ),
      offLimbs: match.offLimbs,
      people: match.detectedPeople,
      extraPeople: match.extraPeople,
    };
    out.detectedLead = row.detected.people[match.assignment[0] ?? 0] ?? null;
    out.detectedAspect = row.detected.canvas.width / row.detected.canvas.height;
  } else {
    out.check = { score: 0, pass: false, note: row.detectNote ?? 'no body read' };
  }
  return out;
});

// Photo path: what "From a photo" stored, against the reference skeleton.
const photos: Record<string, unknown>[] = [];
const capRoot = join(work, 'cap');
for (const engine of existsSync(capRoot) ? readdirSync(capRoot) : []) {
  for (const batch of readdirSync(join(capRoot, engine))) {
    const file = join(capRoot, engine, batch, 'capture.json');
    if (!existsSync(file)) continue;
    const cap = JSON.parse(readFileSync(file, 'utf8')) as {
      mode: string;
      rows: Array<{ target: string; posePhoto: PhotoPose | null; photoStatus?: string }>;
    };
    if (cap.mode !== 'photo') continue;
    for (const row of cap.rows) {
      const ref = refs.get(row.target)!;
      const photo = row.posePhoto;
      const entry: Record<string, unknown> = {
        engine,
        target: row.target,
        photoStatus: row.photoStatus,
        refPosture: posture(ref.people[0]!, ref.aspect),
        refWords: describePhotoPose({ aspect: ref.aspect, people: ref.people as never }),
      };
      if (photo?.people?.length) {
        const detected: DetectedPose = {
          people: photo.people as never,
          canvas: { width: Math.round(photo.aspect * 1000), height: 1000 },
        } as DetectedPose;
        const match = scorePoseMatch({
          guide: ref.people as never,
          guideAspect: ref.aspect,
          detected,
        });
        entry.detection = {
          people: photo.people.length,
          aspect: photo.aspect,
          visionPosture: photo.posture ?? null,
          detectedPosture: posture(photo.people[0] as Body, photo.aspect),
          limbScore: match.limbScore,
          score: match.score,
          postureMiss: match.postureMiss,
          offLimbs: match.offLimbs,
        };
        entry.photoWords = describePhotoPose(photo);
        entry.lead = photo.people[0];
      } else {
        entry.detection = null;
      }
      photos.push(entry);
    }
  }
}

writeFileSync(join(work, 'scores.json'), JSON.stringify({ stills, photos }, null, 1));
const passed = stills.filter(s => (s.check as { pass: boolean }).pass).length;
console.log(
  `scored ${stills.length} stills (${passed} pass the pose check), ${photos.length} photo reads`
);
