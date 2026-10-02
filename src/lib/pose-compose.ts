/**
 * Compose a pose from a description of its limbs, for scenes whose pose is not one of the named
 * layouts. The scene writer (an LLM) cannot be trusted with coordinates, but it can say where
 * each limb points from a short list; the skeleton is then built here with fixed bone lengths,
 * so whatever it says is a valid body. Drawn through the same exact-pose path as a pose from a
 * photo or the joint editor.
 */

import {
  countPoseGuidePeople,
  parseSocialLayout,
  type PhotoPose,
  type ScenePoseSpec,
} from '@/lib/day-pose-guide';
import type { NormalizedBody } from '@/lib/pose-library';
import { setLimbDirections, type PoseLimbsSpec } from '@/lib/pose-limb-presets';

export { normalizePoseLimbs, type PoseLimbsSpec } from '@/lib/pose-limb-presets';
import { describePoseBody, poseStarterBody } from '@/lib/pose-starters';

const ASPECT = 2 / 3;

/** The figure a composed pose starts from: facing the camera, so "out" and "in" mean something. */
function frontFigure(body: string | undefined): NormalizedBody | null {
  const stand = poseStarterBody('stand');
  if (body === 'lie') {
    // Lying is drawn side-on; limb directions relative to an upright body do not apply.
    return null;
  }
  if (body === 'sit') {
    // Seated, facing the camera: thighs come toward it, shins hang down.
    let seated = stand.map(point => (point ? { x: point.x, y: point.y + 0.1 } : null));
    for (const side of ['right', 'left'] as const) {
      seated = setLimbDirections(seated, 'leg', side, ['forward', 'down'], ASPECT);
    }
    return seated;
  }
  if (body === 'kneel' || body === 'crouch') {
    // Kneeling upright, facing the camera: thighs down, shins folded back out of sight.
    let kneeling = stand.map(point => (point ? { x: point.x, y: point.y + 0.16 } : null));
    for (const side of ['right', 'left'] as const) {
      kneeling = setLimbDirections(kneeling, 'leg', side, ['down', 'forward'], ASPECT);
    }
    return kneeling;
  }
  return stand;
}

/** Keep every joint inside the picture: shift, and shrink only if the figure is too large. */
function fitToCanvas(body: NormalizedBody): NormalizedBody {
  const points = body.filter(Boolean) as Array<{ x: number; y: number }>;
  if (points.length === 0) return body;
  const margin = 0.05;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const scale = Math.min(
    1,
    (1 - 2 * margin) / Math.max(maxX - minX, 1e-6),
    (1 - 2 * margin) / Math.max(maxY - minY, 1e-6)
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const width = (maxX - minX) * scale;
  const height = (maxY - minY) * scale;
  // Centre sideways; vertically keep the figure where it stands unless it leaves the frame.
  const targetCx = Math.min(1 - margin - width / 2, Math.max(margin + width / 2, cx));
  const targetCy = Math.min(1 - margin - height / 2, Math.max(margin + height / 2, cy));
  return body.map(point =>
    point
      ? { ...point, x: targetCx + (point.x - cx) * scale, y: targetCy + (point.y - cy) * scale }
      : null
  );
}

/**
 * The skeleton for a described pose, or null when there is nothing to compose (no limbs, or a
 * lying body). Legs are only composed on a standing figure — on a seat or the knees they are
 * where the posture puts them.
 */
export function composeWrittenPose(input: {
  body?: string;
  limbs?: PoseLimbsSpec | null;
  possessive?: 'her' | 'his';
}): PhotoPose | null {
  const limbs = input.limbs;
  if (!limbs || Object.keys(limbs).length === 0) return null;
  let figure = frontFigure(input.body);
  if (!figure) return null;
  const standing = input.body !== 'sit' && input.body !== 'kneel' && input.body !== 'crouch';
  // A figure on its feet keeps at least one foot down: a writer that lifts both thighs
  // ("out", "out") has described nothing a body can do — only a jump may leave the ground.
  const lifted = (leg: PoseLimbsSpec['right_leg']) =>
    Boolean(leg) && !['down', 'down_out', 'down_in'].includes(leg![0]);
  const legsUsable =
    standing && (input.body === 'jump' || !(lifted(limbs.right_leg) && lifted(limbs.left_leg)));
  for (const side of ['right', 'left'] as const) {
    const arm = limbs[`${side}_arm`];
    if (arm) figure = setLimbDirections(figure, 'arm', side, arm, ASPECT);
    const leg = limbs[`${side}_leg`];
    if (leg && legsUsable) figure = setLimbDirections(figure, 'leg', side, leg, ASPECT);
  }
  // A raised foot must not sink below the standing one: drop the figure so the lowest foot
  // stays on the ground line the starter stands on.
  const fitted = fitToCanvas(figure);
  return {
    aspect: ASPECT,
    people: [fitted],
    source: 'edited',
    words: describePoseBody(fitted, { possessive: input.possessive ?? 'her', aspect: ASPECT }),
  };
}

/**
 * The composed pose for a scene, when one applies: the writer described limbs, named no layout
 * or sex act, the scene is one person, and the player has not picked or drawn a pose of their
 * own. Otherwise null and the usual guide is drawn.
 */
export function composedPoseForScene(input: {
  pose: ScenePoseSpec | null | undefined;
  sceneText?: string | null;
  /** The player picked a pose on the card, or attached their own. */
  playerPosed?: boolean;
  possessive?: 'her' | 'his';
}): PhotoPose | null {
  const pose = input.pose;
  if (!pose?.limbs || input.playerPosed) return null;
  if (pose.layout || (pose.act && pose.act !== 'none')) return null;
  if ((pose.people ?? 1) > 1) return null;
  if (countPoseGuidePeople(input.sceneText, { sexVocabulary: false }) > 1) return null;
  // The words name an action the pose list has (a wave, cooking): that tested pose is drawn.
  if (parseSocialLayout(input.sceneText)) return null;
  return composeWrittenPose({ body: pose.body, limbs: pose.limbs, possessive: input.possessive });
}
