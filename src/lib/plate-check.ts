/**
 * Look plate check (pure). Outfit, Day and Story all copy the Cast's look plate, so a bad plate
 * spoils everything downstream. A DWPose read of the plate (people + face keypoints) and the
 * image's pixel size are enough to catch the usual problems: no face, a second person, a face
 * too small for identity nodes to lock onto, a face turned away, or a low-resolution photo.
 */

import type { NormalizedBody } from '@/lib/pose-library';

/** COCO-18 keypoint indices DWPose returns. */
const NOSE = 0;
const NECK = 1;
const R_EYE = 14;
const L_EYE = 15;
const R_EAR = 16;
const L_EAR = 17;

/** Face width (px) under which identity nodes struggle to lock the face. */
export const PLATE_MIN_FACE_PX = 80;
/** Shorter side (px) under which the plate is too soft for Edit models. */
export const PLATE_MIN_SIDE_PX = 512;

export type PlateCheckIssue =
  'no-person' | 'no-face' | 'face-away' | 'extra-people' | 'small-face' | 'low-resolution';

export type PlateCheck = {
  status: 'good' | 'warn';
  issues: PlateCheckIssue[];
  /** One line per issue, ready to show under the plate. */
  notes: string[];
  people: number;
  /** Estimated face width in pixels (absent when no face was found). */
  facePx?: number;
};

const ISSUE_NOTES: Record<PlateCheckIssue, string> = {
  'no-person': 'No person found — use a clear photo of the Cast lead.',
  'no-face': 'No face found — the face should be visible and unobstructed.',
  'face-away': 'The face is turned away — a front or three-quarter view locks identity best.',
  'extra-people': 'More than one person — crop to just the Cast lead.',
  'small-face': 'The face is small — crop closer so it fills more of the frame.',
  'low-resolution': 'Low resolution — use a sharper, larger photo.',
};

function present(body: NormalizedBody, index: number) {
  return body[index] ?? null;
}

/** A detected body counts as a person when it has a neck or a nose (not a stray limb). */
function isPerson(body: NormalizedBody): boolean {
  return Boolean(present(body, NECK) || present(body, NOSE));
}

/** Face width in pixels: ear to ear, else eye to eye scaled up (eyes sit ~0.4 of face width). */
export function estimateFacePx(body: NormalizedBody, width: number, height: number): number | null {
  const span = (a: number, b: number) => {
    const p = present(body, a);
    const q = present(body, b);
    return p && q ? Math.hypot((p.x - q.x) * width, (p.y - q.y) * height) : null;
  };
  const ears = span(R_EAR, L_EAR);
  if (ears !== null && ears > 0) return ears;
  const eyes = span(R_EYE, L_EYE);
  if (eyes !== null && eyes > 0) return eyes / 0.4;
  return null;
}

export function checkLookPlate(input: {
  people: NormalizedBody[];
  /** The plate's pixel size (from the image itself, not the detector canvas). */
  width: number;
  height: number;
}): PlateCheck {
  const { width, height } = input;
  const people = input.people.filter(isPerson);
  const issues: PlateCheckIssue[] = [];
  let facePx: number | undefined;

  if (people.length === 0) {
    issues.push('no-person');
  } else {
    if (people.length > 1) {
      issues.push('extra-people');
    }
    // Judge the most prominent person — the one with the biggest face.
    const faces = people
      .map(body => ({ body, px: estimateFacePx(body, width, height) }))
      .sort((a, b) => (b.px ?? 0) - (a.px ?? 0));
    const lead = faces[0]!;
    const hasEyes = Boolean(present(lead.body, R_EYE) || present(lead.body, L_EYE));
    const hasNose = Boolean(present(lead.body, NOSE));
    const hasEars = Boolean(present(lead.body, R_EAR) || present(lead.body, L_EAR));
    if (!hasEyes && !hasNose) {
      issues.push(hasEars ? 'face-away' : 'no-face');
    }
    if (lead.px !== null) {
      facePx = Math.round(lead.px);
      if (lead.px < PLATE_MIN_FACE_PX) {
        issues.push('small-face');
      }
    }
  }
  if (width > 0 && height > 0 && Math.min(width, height) < PLATE_MIN_SIDE_PX) {
    issues.push('low-resolution');
  }
  return {
    status: issues.length > 0 ? 'warn' : 'good',
    issues,
    notes: issues.map(issue => ISSUE_NOTES[issue]),
    people: people.length,
    ...(facePx !== undefined ? { facePx } : {}),
  };
}
