/**
 * Two-person reference poses (pure): what the pose-reference harvester (`scripts/pose-refs/`,
 * over bridge.mts) uses to read a hug or a toast from a photo without DWPose merging the two
 * people into one body, and to tell whether a pair of skeletons really is the pose it is filed
 * under.
 *
 * - {@link mergePersonReads}: each person is read on their own (a person mask from a segmenter,
 *   everyone else greyed out, DWPose on that person's crop); the reads come back here in crop
 *   pixels and are merged into one picture's people — joints moved back to image pixels, joints
 *   that landed on the other person dropped, and a second read of the same body discarded.
 * - {@link duoRelation}: the contact a pose needs, from the skeletons alone — a hug's arms
 *   around the other's torso, a head on the other's shoulder, a piggyback rider's hips above and
 *   behind the carrier's with the legs at the waist, a toast's raised hands meeting, a sparring
 *   pair's guards up at arm's length.
 */

import type { NormalizedBody } from '@/lib/pose-library';

/** A joint in image pixels with the detector's score. */
export type ScoredJoint = { x: number; y: number; score: number };

/** One person read on their own crop. */
export type PersonRead = {
  /** COCO-18 joints in the crop's pixels: `[x, y, score]`, or null. */
  joints: ReadonlyArray<readonly [number, number, number] | null>;
  /** Where the crop sits in the picture and how much it was scaled (crop px = image px · scale). */
  crop: { x: number; y: number; scale?: number };
  /**
   * Per joint, true where the joint landed on someone else's mask and not on this person's own:
   * the detector reached into the other body.
   */
  onOther?: readonly boolean[];
};

/** A joint that landed on the other person keeps at most this score (under any keep threshold). */
export const ON_OTHER_SCORE = 0.1;
/** Two reads whose joints sit this close (share of the body's height) are one person read twice. */
export const SAME_PERSON_DISTANCE = 0.08;
/** …on at least this share of the joints both reads have. */
export const SAME_PERSON_SHARE = 0.7;
/** Joints at or above this score count as read. */
export const READ_SCORE = 0.3;

function bodyHeight(body: ReadonlyArray<ScoredJoint | null>): number {
  const ys = body
    .filter((p): p is ScoredJoint => p !== null && p.score >= READ_SCORE)
    .map(p => p.y);
  return ys.length >= 2 ? Math.max(...ys) - Math.min(...ys) : 0;
}

function meanScore(body: ReadonlyArray<ScoredJoint | null>): number {
  return body.reduce((sum, p) => sum + (p?.score ?? 0), 0) / Math.max(1, body.length);
}

/**
 * Per-person reads → the picture's people in image pixels, largest first. A joint flagged
 * `onOther` drops to {@link ON_OTHER_SCORE}; a read that repeats another (most shared joints
 * within {@link SAME_PERSON_DISTANCE} of the taller body's height) is dropped, the surer read kept.
 */
export function mergePersonReads(reads: readonly PersonRead[]): ScoredJoint[][] {
  const people = reads.map(read => {
    const s = read.crop.scale && read.crop.scale > 0 ? read.crop.scale : 1;
    return read.joints.map((joint, index) => {
      if (!joint) return null;
      const [x, y, score] = joint;
      return {
        x: read.crop.x + x / s,
        y: read.crop.y + y / s,
        score: read.onOther?.[index] ? Math.min(score, ON_OTHER_SCORE) : score,
      };
    });
  });
  const order = people
    .map((body, index) => ({ body, index, score: meanScore(body) }))
    .sort((a, b) => b.score - a.score);
  const kept: ScoredJoint[][] = [];
  for (const { body } of order) {
    const duplicate = kept.some(other => {
      const height = Math.max(bodyHeight(body), bodyHeight(other));
      if (!(height > 0)) return false;
      let shared = 0;
      let close = 0;
      for (let i = 0; i < Math.min(body.length, other.length); i += 1) {
        const a = body[i];
        const b = other[i];
        if (!a || !b || a.score < READ_SCORE || b.score < READ_SCORE) continue;
        shared += 1;
        if (Math.hypot(a.x - b.x, a.y - b.y) < SAME_PERSON_DISTANCE * height) close += 1;
      }
      return shared >= 4 && close / shared >= SAME_PERSON_SHARE;
    });
    if (!duplicate) kept.push(body as ScoredJoint[]);
  }
  return kept.sort((a, b) => bodyHeight(b) - bodyHeight(a));
}

// --- relations ----------------------------------------------------------------------------------

/** The two-person poses with a contact rule. */
export const DUO_RELATION_POSES = ['hug', 'head_shoulder', 'piggyback', 'toast', 'fight'] as const;
export type DuoRelationPose = (typeof DUO_RELATION_POSES)[number];

export type DuoRelation = { ok: boolean; why: string };

type P = { x: number; y: number };

/** A body in aspect-true units (x scaled by the crop's aspect), with its torso length. */
type Frame = {
  j: Array<P | null>;
  neck: P;
  hip: P;
  torso: number;
  head: P | null;
};

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function frameOf(body: NormalizedBody, aspect: number): Frame | null {
  const j = body.map(p => (p ? { x: p.x * aspect, y: p.y } : null));
  const neck = j[1] ?? (j[2] && j[5] ? mid(j[2], j[5]) : null);
  const hip = j[8] && j[11] ? mid(j[8], j[11]) : (j[8] ?? j[11]);
  if (!neck || !hip) return null;
  const torso = dist(neck, hip);
  if (!(torso > 1e-4)) return null;
  // The head: the nose, else the eyes' or ears' midpoint.
  const pair = (a: number, b: number) => (j[a] && j[b] ? mid(j[a]!, j[b]!) : (j[a] ?? j[b]));
  const head = j[0] ?? pair(14, 15) ?? pair(16, 17);
  return { j, neck, hip, torso, head };
}

/** Is `p` over the other body's torso (between its shoulders/hips, neck to hips), with slack? */
function onTorso(p: P, other: Frame, slack: number): boolean {
  const xs = [2, 5, 8, 11]
    .map(i => other.j[i])
    .filter((q): q is P => q !== null)
    .map(q => q.x);
  if (xs.length < 2) return false;
  const pad = slack * other.torso;
  const top = Math.min(other.neck.y, other.hip.y) - pad;
  const bottom = Math.max(other.neck.y, other.hip.y) + pad;
  return (
    p.x >= Math.min(...xs) - pad && p.x <= Math.max(...xs) + pad && p.y >= top && p.y <= bottom
  );
}

function hug(a: Frame, b: Frame): DuoRelation {
  const scale = (a.torso + b.torso) / 2;
  if (dist(a.neck, b.neck) > 1.3 * scale) return { ok: false, why: 'apart' };
  // Arms around the other's torso: someone's wrist or elbow is over (or behind) the other's
  // back, with a hand down at the chest or waist — an arm slung over a shoulder for a team photo
  // is not a hug.
  const reaches = (from: Frame, to: Frame) => {
    const on = [3, 4, 6, 7].filter(i => {
      const p = from.j[i];
      return p !== null && onTorso(p, to, 0.15);
    });
    const handDown = [4, 7].some(i => on.includes(i) && from.j[i]!.y > to.neck.y + 0.2 * to.torso);
    return handDown ? on.length : 0;
  };
  const best = Math.max(reaches(a, b), reaches(b, a));
  return best >= 2
    ? { ok: true, why: 'arms around the other' }
    : { ok: false, why: 'no arms around the other' };
}

function headShoulder(a: Frame, b: Frame): DuoRelation {
  const rests = (from: Frame, to: Frame) => {
    if (!from.head) return false;
    const shoulders = [to.j[2], to.j[5]].filter((p): p is P => p !== null);
    if (shoulders.length === 0) return false;
    const near = Math.min(...shoulders.map(s => dist(from.head!, s)));
    // Within a short reach of a shoulder, and not above the other's own head.
    const otherHeadY = to.head?.y ?? to.neck.y - 0.35 * to.torso;
    return near < 0.5 * to.torso && from.head.y > otherHeadY - 0.1 * to.torso;
  };
  return rests(a, b) || rests(b, a)
    ? { ok: true, why: 'head on the other’s shoulder' }
    : { ok: false, why: 'no head near the other’s shoulder' };
}

function piggyback(a: Frame, b: Frame): DuoRelation {
  const rides = (rider: Frame, carrier: Frame) => {
    const t = carrier.torso;
    // The rider's hips well above the carrier's and over the carrier's back.
    if (!(rider.hip.y < carrier.hip.y - 0.25 * t)) return false;
    if (Math.abs(rider.hip.x - carrier.hip.x) > 0.8 * t) return false;
    // Legs at the carrier's waist: a knee between the carrier's chest and a bit under the hips,
    // within reach of the hips sideways.
    const knees = [rider.j[9], rider.j[12]].filter((p): p is P => p !== null);
    const atWaist = knees.some(
      k =>
        Math.abs(k.x - carrier.hip.x) < 0.9 * t &&
        k.y > carrier.neck.y + 0.2 * t &&
        k.y < carrier.hip.y + 0.5 * t
    );
    // The rider's head up behind the carrier's, not beside it at the same height on the floor.
    return atWaist && rider.neck.y < carrier.neck.y + 0.2 * t;
  };
  return rides(a, b) || rides(b, a)
    ? { ok: true, why: 'one rides on the other’s back' }
    : { ok: false, why: 'nobody up on the other’s back' };
}

/** Wrists held up at chest height or higher (above the elbow-to-hip line). */
function raisedWrists(f: Frame): P[] {
  return [
    [3, 4],
    [6, 7],
  ]
    .map(([elbow, wrist]) => ({ e: f.j[elbow!], w: f.j[wrist!] }))
    .filter(
      ({ e, w }) =>
        w !== null && w.y < f.neck.y + 0.55 * f.torso && (!e || w.y <= e.y + 0.05 * f.torso)
    )
    .map(({ w }) => w!);
}

function toast(a: Frame, b: Frame): DuoRelation {
  const ra = raisedWrists(a);
  const rb = raisedWrists(b);
  if (ra.length === 0 || rb.length === 0) return { ok: false, why: 'a hand not raised' };
  const scale = (a.torso + b.torso) / 2;
  const closest = Math.min(...ra.flatMap(p => rb.map(q => dist(p, q))));
  return closest < 0.6 * scale
    ? { ok: true, why: 'raised hands meet' }
    : { ok: false, why: 'raised hands apart' };
}

function fight(a: Frame, b: Frame): DuoRelation {
  const scale = (a.torso + b.torso) / 2;
  const apart = Math.abs(a.hip.x - b.hip.x);
  if (apart < 0.5 * scale) return { ok: false, why: 'on top of each other' };
  if (apart > 3.2 * scale) return { ok: false, why: 'out of reach' };
  // Guard up: both hands up near the face (at least one each), and nobody's fist on a face.
  const guard = (f: Frame) =>
    [4, 7].filter(i => {
      const w = f.j[i];
      return (
        w !== null &&
        w.y < f.neck.y + 0.35 * f.torso &&
        (!f.head || dist(w, f.head) < 1.1 * f.torso)
      );
    }).length;
  if (guard(a) < 1 || guard(b) < 1) return { ok: false, why: 'guard down' };
  const hit = (from: Frame, to: Frame) =>
    to.head !== null &&
    [4, 7].some(i => from.j[i] !== null && dist(from.j[i]!, to.head!) < 0.3 * to.torso);
  if (hit(a, b) || hit(b, a)) return { ok: false, why: 'a fist on a face' };
  return { ok: true, why: 'guards up at arm’s length' };
}

/**
 * Whether two skeletons (0–1 of a crop `aspect` wide) show the contact the pose needs. Poses
 * without a rule pass.
 */
export function duoRelation(
  pose: string,
  people: readonly NormalizedBody[],
  aspect: number
): DuoRelation {
  if (!(DUO_RELATION_POSES as readonly string[]).includes(pose))
    return { ok: true, why: 'no rule' };
  if (people.length !== 2) return { ok: false, why: `people:${people.length}` };
  const a = frameOf(people[0]!, aspect);
  const b = frameOf(people[1]!, aspect);
  if (!a || !b) return { ok: false, why: 'no torso' };
  switch (pose as DuoRelationPose) {
    case 'hug':
      return hug(a, b);
    case 'head_shoulder':
      return headShoulder(a, b);
    case 'piggyback':
      return piggyback(a, b);
    case 'toast':
      return toast(a, b);
    case 'fight':
      return fight(a, b);
  }
}
