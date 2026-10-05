/**
 * A/B aid: for each pose id given, the app's guide plan for variant 0 (the hand-drawn figure)
 * and for every reference variant — the OpenPose keypoints on the guide canvas, plus the words
 * each variant would send: the pose's own words (a named pose keeps them), and the words the
 * custom-pose path reads from the skeleton (pose-describe; for two people, each person's).
 * JSON on stdout; `scripts/pose-refs/ab-render.py` draws the maps.
 *
 *   node --import tsx scripts/pose-refs/ab-guides.mts kneel sit_floor lie_side crouch
 *   node --import tsx scripts/pose-refs/ab-guides.mts piggyback toast head_shoulder:stand
 *
 * Two-person poses (the picker's "Two people" group) are planned for two; `id:posture` plans the
 * pose on that posture (a standing head on a shoulder), keyed `id:posture` in the output.
 */

import { readFileSync } from 'node:fs';
import { resolveSceneGuidePlan, type SocialLayout } from '@/lib/day-pose-guide';
import { dayPoseWords } from '@/lib/day-pose-presets';
import { describePhotoPose, describePoseFigure } from '@/lib/pose-describe';
import { POSE_PICKER_GROUPS } from '@/lib/pose-layout-labels';
import { parsePoseReferences, poseReferencesFor } from '@/lib/pose-references';

const references = parsePoseReferences(
  JSON.parse(readFileSync(new URL('../../public/pose-references.json', import.meta.url), 'utf8'))
);
const BODY_IDS = new Set(POSE_PICKER_GROUPS.find(group => group.label === 'Postures')?.ids ?? []);
const TWO_IDS = new Set(POSE_PICKER_GROUPS.find(group => group.label === 'Two people')?.ids ?? []);

const out: Record<string, unknown> = {};
for (const arg of process.argv.slice(2)) {
  const [id = '', body] = arg.split(':');
  const people = TWO_IDS.has(id) ? 2 : 1;
  const pose = BODY_IDS.has(id)
    ? { body: id as never }
    : { layout: id as SocialLayout, ...(body ? { body: body as never } : {}) };
  const base = resolveSceneGuidePlan(undefined, 0, {
    forcePeople: people,
    pose,
    openPose: true,
    references,
  });
  const candidates = poseReferencesFor(references, id, people, base.intent.base);
  const variants = [];
  for (let variant = 0; variant <= candidates.length; variant += 1) {
    const plan = resolveSceneGuidePlan(undefined, 0, {
      forcePeople: people,
      pose,
      variant,
      openPose: true,
      references,
    });
    const { width, height } = plan.openPose.canvas;
    const keypoints = plan.openPose.keypoints;
    const described =
      people === 1
        ? describePoseFigure(keypoints[0]!, { aspect: width / height }).text
        : describePhotoPose({ aspect: width / height, people: keypoints });
    variants.push({
      variant,
      referenceId: plan.openPose.referenceId ?? null,
      source: plan.openPose.referenceId ? candidates[variant - 1]?.source : 'drawing',
      canvas: { width, height },
      keypoints,
      words: variant === 0 ? dayPoseWords(id) : described,
      poseWords: dayPoseWords(id),
      described,
    });
  }
  out[arg] = { base: base.intent.base, people, variants };
}
process.stdout.write(`${JSON.stringify(out)}\n`);
