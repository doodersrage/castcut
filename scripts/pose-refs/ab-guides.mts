/**
 * A/B aid: for each pose id given, the app's guide plan for variant 0 (the hand-drawn figure)
 * and for every reference variant — the OpenPose keypoints on the guide canvas, plus the words
 * each variant would send: the pose's own words for the drawing, the pose-describe words read
 * from the reference skeleton. JSON on stdout; `scripts/pose-refs/ab-render.py` draws the maps.
 *
 *   node --import tsx scripts/pose-refs/ab-guides.mts kneel sit_floor lie_side crouch
 */

import { readFileSync } from 'node:fs';
import { resolveSceneGuidePlan, type SocialLayout } from '@/lib/day-pose-guide';
import { dayPoseWords } from '@/lib/day-pose-presets';
import { describePoseFigure } from '@/lib/pose-describe';
import { POSE_PICKER_GROUPS } from '@/lib/pose-layout-labels';
import { parsePoseReferences, poseReferencesFor } from '@/lib/pose-references';

const references = parsePoseReferences(
  JSON.parse(
    readFileSync(new URL('../../src/lib/data/pose-references.json', import.meta.url), 'utf8')
  )
);
const BODY_IDS = new Set(POSE_PICKER_GROUPS.find(group => group.label === 'Postures')?.ids ?? []);

const out: Record<string, unknown> = {};
for (const id of process.argv.slice(2)) {
  const pose = BODY_IDS.has(id) ? { body: id as never } : { layout: id as SocialLayout };
  const base = resolveSceneGuidePlan(undefined, 0, {
    forcePeople: 1,
    pose,
    openPose: true,
    references,
  });
  const candidates = poseReferencesFor(references, id, 1, base.intent.base);
  const variants = [];
  for (let variant = 0; variant <= candidates.length; variant += 1) {
    const plan = resolveSceneGuidePlan(undefined, 0, {
      forcePeople: 1,
      pose,
      variant,
      openPose: true,
      references,
    });
    const { width, height } = plan.openPose.canvas;
    const body = plan.openPose.keypoints[0]!;
    variants.push({
      variant,
      referenceId: plan.openPose.referenceId ?? null,
      source: plan.openPose.referenceId ? candidates[variant - 1]?.source : 'drawing',
      canvas: { width, height },
      keypoints: plan.openPose.keypoints,
      words:
        variant === 0
          ? dayPoseWords(id)
          : describePoseFigure(body, { aspect: width / height }).text,
    });
  }
  out[id] = { base: base.intent.base, variants };
}
process.stdout.write(`${JSON.stringify(out)}\n`);
