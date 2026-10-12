/**
 * Talking clips start from a closer framing of the still. LTX-2.5 speaks the line either way,
 * but from a full-body still the face is ~20 px tall and the lips can't be read — the user's
 * "not syncing" night clip (2026-10-10). Live, same still / line / seeds: a chest-up crop around
 * the face kept her face and outfit and the mouth formed the words (mouth-motion vs loudness 0.68
 * / 0.73 vs 0.64 / 0.54 full-frame). A still where the face is already large is left alone.
 */

import type { FaceBox } from './portrait-face-crop';

/** Face (brow to chin) at least this share of the still's height: already close enough. */
export const TALKING_CLOSE_FACE_SHARE = 0.16;
/**
 * Face under this share of the still's height: a full-body shot. Kept whole (Keep the full
 * frame), it gets the wide-shot talking prompt (talkingClipPrompt `wide`).
 */
export const TALKING_WIDE_FACE_SHARE = 0.08;
/** Crop height in face heights: head, shoulders and chest. */
export const TALKING_CROP_FACE_HEIGHTS = 4.2;

/**
 * How a still kept whole (Keep the full frame, or a face that was not cropped) is framed, for
 * the talking prompt: `wide` (full body, face under 8%) and `mid` (seated / knees-up, 8–16%) both
 * get wording that holds the framing; `close` is already close. A face that can't be found
 * counts as `mid` — the clip keeps the frame rather than risk a punch-in. Live 2026-10-11: a
 * park-bench still at ~8% face height fell just above the old full-body bar, got the plain
 * "looks into the camera" wording, and LTX punched in to a face close-up within 2 s.
 */
export type TalkingFraming = 'wide' | 'mid' | 'close';

export function talkingFramingFromShare(share: number | null | undefined): TalkingFraming {
  if (typeof share !== 'number' || !Number.isFinite(share) || share <= 0) return 'mid';
  if (share < TALKING_WIDE_FACE_SHARE) return 'wide';
  if (share < TALKING_CLOSE_FACE_SHARE) return 'mid';
  return 'close';
}

export type CropRect = { x: number; y: number; width: number; height: number };

/** The chest-up 3:4 crop for a talking clip, or null when the still is already close. */
export function talkingClipCropRect(width: number, height: number, face: FaceBox): CropRect | null {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const faceH = Math.max(1, face.height);
  if (faceH / h >= TALKING_CLOSE_FACE_SHARE) return null;
  let cropH = Math.min(h, Math.round(faceH * TALKING_CROP_FACE_HEIGHTS));
  let cropW = Math.round(cropH * 0.75);
  if (cropW > w) {
    cropW = w;
    cropH = Math.min(h, Math.round(cropW / 0.75));
  }
  // The face sits in the upper third, hair inside the frame.
  const centerX = face.x + face.width / 2;
  const x = Math.round(Math.min(Math.max(0, centerX - cropW / 2), w - cropW));
  const y = Math.round(Math.min(Math.max(0, face.y - faceH * 0.9), h - cropH));
  return { x, y, width: cropW, height: cropH };
}

/**
 * Whether the still shows her seated (or lying), from its body keypoints (OpenPose order, 0–1 of
 * the still). The face-size band was used for this and is not a posture: a standing, waving still
 * read "mid", got the seated hold and sat down (2026-10-11). Seated: both thighs near level — each
 * knee less than half a torso length below its hip (one visible leg: under 0.3) — or the torso
 * lying flat. On the user's stills: standing 0.87–0.92, the park bench 0.27 / −0.18, a record
 * shop −0.11 / −0.16, climbing stairs 0.77 / 0.37 (not seated). `null` when it can't tell.
 */
export function stillPostureFromBody(
  body: ReadonlyArray<{ x: number; y: number } | null | undefined>
): 'seated' | 'upright' | null {
  const neck = body[1];
  const hips = [body[8], body[11]].filter(Boolean) as Array<{ x: number; y: number }>;
  if (!neck || !hips.length) return null;
  const hip = {
    x: hips.reduce((s, p) => s + p.x, 0) / hips.length,
    y: hips.reduce((s, p) => s + p.y, 0) / hips.length,
  };
  const torsoDy = hip.y - neck.y;
  // Bent over on straight legs (picking up keys) is standing: read as seated, it got the seated
  // hold and she squatted down on the pavement (2 of 2, 2026-10-11).
  if (stillLimbHolds(body).bent) return 'upright';
  if (Math.abs(hip.x - neck.x) > Math.abs(torsoDy)) return 'seated';
  if (torsoDy <= 0) return null;
  const drops = (
    [
      [body[8], body[9]],
      [body[11], body[12]],
    ] as const
  )
    .filter(([h, k]) => h && k)
    .map(([h, k]) => (k!.y - h!.y) / torsoDy);
  if (!drops.length) return null;
  if (drops.length === 1) return drops[0]! < 0.3 ? 'seated' : 'upright';
  return drops.every(drop => drop < 0.5) ? 'seated' : 'upright';
}

/**
 * The still's own words, when its pose can't be read: seated / kneeling-down / lying words, and
 * no "stands". Negated phrases ("body sitting, not standing") don't count.
 */
export function stillWordsSeated(stillPrompt: string | null | undefined): boolean {
  const text = String(stillPrompt ?? '')
    .replace(/\bnot\s+(?:\w+\s+)?(?:sitting|standing|seated|lying|kneeling)\b/gi, '')
    .replace(/do not keep the Image 1 \w+ pose/gi, '');
  return (
    /\b(sits|sitting|seated|perched|lying|lies|reclin\w*|lounging)\b/i.test(text) &&
    !/\b(stands|standing)\b/i.test(text)
  );
}

type BodyPoint = { x: number; y: number } | null | undefined;

/** Limbs a still holds mid-action, read from its body keypoints (stillLimbHolds). */
export type StillLimbHolds = {
  /** Arms raised above the shoulder (0, 1 or 2), standing upright. */
  armsUp: 0 | 1 | 2;
  /** One foot off the floor (a lifted knee, a kick, on the balls of one foot), standing. */
  footOff: boolean;
  /** Feet planted wide apart (a lunge, a fighting stance), standing. */
  stride: boolean;
  /** Bent forward at the hips on straight legs (picking something up). */
  bent: boolean;
};

export const NO_LIMB_HOLDS: StillLimbHolds = {
  armsUp: 0,
  footOff: false,
  stride: false,
  bent: false,
};

/**
 * Which limbs the still caught mid-action, from its body keypoints (OpenPose order, 0–1 of the
 * still; `aspect` = width / height). Kept as they were, a talking clip froze them for the whole
 * line — arms overhead, a jump shot's ball, a knee lifted, a lunge — or she walked off. The
 * still's words missed half of them: of 229 solo Day stills, 23 with an arm up and 23 with a foot
 * off or a wide stance said nothing a word rule could catch (golf swings, pull-ups, stretches).
 */
export function stillLimbHolds(body: ReadonlyArray<BodyPoint>, aspect = 0.75): StillLimbHolds {
  const neck = body[1];
  const rHip = body[8];
  const lHip = body[11];
  if (!neck || !rHip || !lHip) return NO_LIMB_HOLDS;
  const hip = { x: (rHip.x + lHip.x) / 2, y: (rHip.y + lHip.y) / 2 };
  const dx = (hip.x - neck.x) * aspect;
  const dy = hip.y - neck.y;
  const torso = Math.hypot(dx, dy);
  if (torso <= 0) return NO_LIMB_HOLDS;
  const tilt = (Math.atan2(Math.abs(dx), dy) * 180) / Math.PI;
  // A standing leg: knee well below its hip, ankle below the knee, the leg near vertical.
  const standingLeg = (h: BodyPoint, k: BodyPoint, a: BodyPoint) =>
    Boolean(
      h &&
      k &&
      a &&
      (k.y - h.y) / torso > 0.5 &&
      a.y > k.y &&
      a.y - h.y > 2 * Math.abs(a.x - h.x) * aspect
    );
  const rLeg = standingLeg(rHip, body[9], body[10]);
  const lLeg = standingLeg(lHip, body[12], body[13]);
  const upright = (rLeg || lLeg) && tilt < 30;
  const raised = (wrist: BodyPoint, shoulder: BodyPoint) =>
    Boolean(wrist && shoulder && wrist.y < shoulder.y - 0.1 * torso);
  const rAnkle = body[10];
  const lAnkle = body[13];
  const kneeUp = (h: BodyPoint, k: BodyPoint) => Boolean(h && k && (k.y - h.y) / torso < 0.45);
  const footOff =
    upright &&
    ((rAnkle && lAnkle ? Math.abs(rAnkle.y - lAnkle.y) > 0.3 * torso : false) ||
      (rLeg !== lLeg && (kneeUp(rHip, body[9]) || kneeUp(lHip, body[12]))));
  const holds: StillLimbHolds = {
    armsUp: upright
      ? ((Number(raised(body[4], body[2])) + Number(raised(body[7], body[5]))) as 0 | 1 | 2)
      : 0,
    footOff,
    stride: Boolean(
      upright && rAnkle && lAnkle && Math.abs(rAnkle.x - lAnkle.x) * aspect > 1.0 * torso
    ),
    bent: rLeg && lLeg && tilt >= 30,
  };
  // A crouch (a volleyball ready stance): torso upright, hips dropped, a knee bent. Nothing above
  // caught it and the stance held on 2 of 3 seeds; read as a bend over a wide stance she stood up
  // 3 of 3 (2026-10-12). Only alone — added to a lunge's own exceptions she stepped forward.
  const someHold = holds.armsUp > 0 || holds.footOff || holds.stride || holds.bent;
  if (!someHold && crouched(body, aspect, torso, tilt))
    return { ...holds, bent: true, stride: true };
  return holds;
}

function kneeAngle(hip: BodyPoint, knee: BodyPoint, ankle: BodyPoint, aspect: number): number {
  if (!hip || !knee || !ankle) return 180;
  const a = [(hip.x - knee.x) * aspect, hip.y - knee.y];
  const b = [(ankle.x - knee.x) * aspect, ankle.y - knee.y];
  const length = Math.hypot(a[0]!, a[1]!) * Math.hypot(b[0]!, b[1]!);
  if (length <= 0) return 180;
  const cos = (a[0]! * b[0]! + a[1]! * b[1]!) / length;
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/**
 * Torso upright, both thighs angled down (seated thighs are level), both feet on the floor (a foot
 * up on a wall is a lean), the ankles under 1.3 torsos below the hips (standing ≈ 1.6–1.8) and a
 * knee bent.
 */
function crouched(body: ReadonlyArray<BodyPoint>, aspect: number, torso: number, tilt: number) {
  const [rHip, rKnee, rAnkle, lHip, lKnee, lAnkle] = [8, 9, 10, 11, 12, 13].map(i => body[i]);
  if (!rHip || !rKnee || !rAnkle || !lHip || !lKnee || !lAnkle || tilt >= 30) return false;
  const drop = (Math.max(rAnkle.y, lAnkle.y) - (rHip.y + lHip.y) / 2) / torso;
  return (
    (rKnee.y - rHip.y) / torso > 0.3 &&
    (lKnee.y - lHip.y) / torso > 0.3 &&
    Math.abs(rAnkle.y - lAnkle.y) / torso < 0.15 &&
    drop > 0.8 &&
    drop < 1.3 &&
    Math.min(kneeAngle(rHip, rKnee, rAnkle, aspect), kneeAngle(lHip, lKnee, lAnkle, aspect)) < 140
  );
}

/** A foot resting on something (a step, a wall): a pose she can hold, not a lifted foot. */
export function stillFootSupported(stillPrompt: string | null | undefined): boolean {
  return /\bfoot (?:up |raised )?(?:on|onto|against) (?:a |the )?(?:step|stair|bench|wall|ledge|rail|railing|chair|crate|box|bumper)\b|\bfoot (?:up )?against\b/i.test(
    String(stillPrompt ?? '')
  );
}
