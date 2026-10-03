/**
 * Plate stance (pure): is the Cast's look plate a standing, full-body picture? Outfit, Day and
 * Story start every still from the plate, and a seated, kneeling or lying plate is hard to pose
 * from (the edit keeps sitting her down). The DWPose read the plate check already runs is enough
 * to tell: hips against knees and ankles, the torso's tilt, and which joints are in frame.
 */

import type { NormalizedBody } from '@/lib/pose-library';

/** COCO-18 keypoint indices DWPose returns. */
const NOSE = 0;
const NECK = 1;
const R_HIP = 8;
const R_KNEE = 9;
const R_ANKLE = 10;
const L_HIP = 11;
const L_KNEE = 12;
const L_ANKLE = 13;

export type PlateStanceReason =
  | 'standing'
  | 'seated'
  | 'kneeling'
  | 'crouching'
  | 'lying'
  | 'feet-cropped'
  | 'not-full-body'
  /** Nobody read on the plate — the plate check says so; nothing to stand up. */
  | 'no-person'
  /** The plate was just prepared standing (no need to read it again). */
  | 'prepared';

export type PlateStance = {
  /** False only when a person was read and isn't standing full body. */
  standing: boolean;
  reason: PlateStanceReason;
  checkedAt: number;
  /** The plate this was read from (filename, else URL); another plate makes it stale. */
  plate?: string;
};

const REASONS = new Set<PlateStanceReason>([
  'standing',
  'seated',
  'kneeling',
  'crouching',
  'lying',
  'feet-cropped',
  'not-full-body',
  'no-person',
  'prepared',
]);

/** Torso more than this far off upright (degrees) reads as lying down. */
export const LYING_TILT_DEG = 50;
/** Knees less than this far below the hips (in torso lengths) read as seated. */
export const SEATED_KNEE_DROP = 0.45;
/** Ankles less than this far below the knees (in torso lengths) read as kneeling. */
export const KNEELING_SHIN_DROP = 0.35;
/** Hip–knee–ankle angle under this (degrees) is a deep bend: crouching. */
const CROUCH_KNEE_ANGLE_DEG = 115;
/** An ankle this close to the bottom edge (fraction of height) has its foot cut off. */
const FEET_EDGE = 0.985;

type Point = { x: number; y: number };

function at(body: NormalizedBody, index: number, width: number, height: number): Point | null {
  const point = body[index];
  return point ? { x: point.x * width, y: point.y * height } : null;
}

function mean(points: Array<Point | null>): Point | null {
  const found = points.filter((point): point is Point => point !== null);
  if (found.length === 0) return null;
  return {
    x: found.reduce((sum, point) => sum + point.x, 0) / found.length,
    y: found.reduce((sum, point) => sum + point.y, 0) / found.length,
  };
}

function isPerson(body: NormalizedBody): boolean {
  return Boolean(body[NECK] || body[NOSE]);
}

/** The plate's subject: the person with the most joints read (ties: the taller one). */
function leadBody(people: NormalizedBody[]): NormalizedBody | null {
  let best: NormalizedBody | null = null;
  let bestScore = -1;
  for (const body of people.filter(isPerson)) {
    const points = body.filter((point): point is Point => point !== null);
    const ys = points.map(point => point.y);
    const score = points.length + (Math.max(...ys) - Math.min(...ys));
    if (score > bestScore) {
      best = body;
      bestScore = score;
    }
  }
  return best;
}

function kneeAngleDeg(hip: Point, knee: Point, ankle: Point): number {
  const a = { x: hip.x - knee.x, y: hip.y - knee.y };
  const b = { x: ankle.x - knee.x, y: ankle.y - knee.y };
  const lengths = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  if (lengths === 0) return 180;
  const cos = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / lengths));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Read the stance from DWPose keypoints (normalized 0–1 of the plate). `width` / `height` are
 * the image's size, so angles aren't skewed by its aspect.
 */
export function readPlateStance(input: {
  people: NormalizedBody[];
  width: number;
  height: number;
}): { standing: boolean; reason: PlateStanceReason } {
  const width = input.width > 0 ? input.width : 1;
  const height = input.height > 0 ? input.height : 1;
  const body = leadBody(input.people);
  if (!body) {
    return { standing: true, reason: 'no-person' };
  }
  const p = (index: number) => at(body, index, width, height);
  const neck = p(NECK) ?? p(NOSE);
  const hip = mean([p(R_HIP), p(L_HIP)]);
  if (!neck || !hip) {
    // Head and shoulders only.
    return { standing: false, reason: 'not-full-body' };
  }
  const torso = Math.hypot(hip.x - neck.x, hip.y - neck.y);
  if (torso <= 0) {
    return { standing: false, reason: 'not-full-body' };
  }
  // 0° = upright (hips straight below the neck); 180° = upside down.
  const tilt = (Math.atan2(Math.abs(hip.x - neck.x), hip.y - neck.y) * 180) / Math.PI;
  if (tilt > LYING_TILT_DEG) {
    return { standing: false, reason: 'lying' };
  }

  const sides = [
    { hip: p(R_HIP), knee: p(R_KNEE), ankle: p(R_ANKLE) },
    { hip: p(L_HIP), knee: p(L_KNEE), ankle: p(L_ANKLE) },
  ].map(side => ({ ...side, hip: side.hip ?? hip }));
  const withKnee = sides.filter(side => side.knee !== null);
  if (withKnee.length === 0) {
    // Cut off at the hips or thighs.
    return { standing: false, reason: 'not-full-body' };
  }
  const kneeDrop =
    withKnee.reduce((sum, side) => sum + (side.knee!.y - side.hip.y), 0) / withKnee.length / torso;
  if (kneeDrop < SEATED_KNEE_DROP) {
    return { standing: false, reason: 'seated' };
  }
  const full = withKnee.filter(side => side.ankle !== null);
  if (full.length > 0) {
    const shinDrop =
      full.reduce((sum, side) => sum + (side.ankle!.y - side.knee!.y), 0) / full.length / torso;
    if (shinDrop < KNEELING_SHIN_DROP) {
      return { standing: false, reason: 'kneeling' };
    }
    const angles = full.map(side => kneeAngleDeg(side.hip, side.knee!, side.ankle!));
    if (Math.max(...angles) < CROUCH_KNEE_ANGLE_DEG) {
      return { standing: false, reason: 'crouching' };
    }
  }
  if (full.length === 0 || full.every(side => side.ankle!.y >= FEET_EDGE * height)) {
    return { standing: false, reason: 'feet-cropped' };
  }
  return { standing: true, reason: 'standing' };
}

/** Stored stance, cleaned (undefined when it doesn't hold up). */
export function normalizePlateStance(value: unknown): PlateStance | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const reason = typeof raw.reason === 'string' ? (raw.reason.trim() as PlateStanceReason) : null;
  if (!reason || !REASONS.has(reason)) return undefined;
  const standing =
    typeof raw.standing === 'boolean'
      ? raw.standing
      : reason === 'standing' || reason === 'prepared' || reason === 'no-person';
  const checkedAt =
    typeof raw.checkedAt === 'number' && Number.isFinite(raw.checkedAt) ? raw.checkedAt : 0;
  const plate = typeof raw.plate === 'string' ? raw.plate.trim() : '';
  return { standing, reason, checkedAt, ...(plate ? { plate } : {}) };
}

/** The key a stance is stored against: the plate's filename, else its URL. */
export function plateStanceKey(
  plate: { filename?: string; imageUrl?: string } | null | undefined
): string {
  return plate?.filename?.trim() || plate?.imageUrl?.trim() || '';
}

/** The stance when it is this plate's (one stored without a plate key counts as current). */
export function currentPlateStance(
  stance: PlateStance | null | undefined,
  plate: { filename?: string; imageUrl?: string } | null | undefined
): PlateStance | null {
  const key = plateStanceKey(plate);
  if (!stance || !key) return null;
  return !stance.plate || stance.plate === key ? stance : null;
}

const REASON_LABEL: Partial<Record<PlateStanceReason, string>> = {
  seated: 'Seated',
  kneeling: 'Kneeling',
  crouching: 'Crouching',
  lying: 'Lying down',
  'feet-cropped': 'Feet out of frame',
  'not-full-body': 'Not full body',
};

/** One line under a plate that isn't standing (null when it is). */
export function plateStanceNote(stance: PlateStance | null | undefined): string | null {
  if (!stance || stance.standing) return null;
  const label = REASON_LABEL[stance.reason] ?? 'Not standing';
  return `${label} — Day and Outfit pose a standing, full-body plate more easily.`;
}

const NUDGE_LABEL: Partial<Record<PlateStanceReason, string>> = {
  seated: 'Seated plate',
  kneeling: 'Kneeling plate',
  crouching: 'Crouching plate',
  lying: 'Lying-down plate',
  'feet-cropped': 'Feet cut off the plate',
  'not-full-body': 'Not a full-body plate',
};

/**
 * The short note Day and Outfit show over a look plate that isn't standing (null when it is):
 * "Seated plate — poses come out better from a standing one." The Cast page's Prepare plate
 * stands it up.
 */
export function plateStanceNudge(stance: PlateStance | null | undefined): string | null {
  if (!stance || stance.standing) return null;
  const label = NUDGE_LABEL[stance.reason] ?? 'Plate not standing';
  return `${label} — poses come out better from a standing one.`;
}

/** Most plates whose stance note a viewer dismissed that are remembered (oldest drop off). */
export const PLATE_STANCE_DISMISSED_LIMIT = 40;

/** Dismissed plate keys from their stored JSON (an empty list when it doesn't hold up). */
export function parseDismissedPlateKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .filter((entry): entry is string => typeof entry === 'string')
          .map(entry => entry.trim())
          .filter(Boolean)
      ),
    ];
  } catch {
    return [];
  }
}

/** The list with `key` dismissed (newest first, capped). */
export function withDismissedPlateKey(
  keys: readonly string[],
  key: string,
  limit = PLATE_STANCE_DISMISSED_LIMIT
): string[] {
  const id = key.trim();
  if (!id) return [...keys];
  return [id, ...keys.filter(entry => entry !== id)].slice(0, Math.max(1, limit));
}
