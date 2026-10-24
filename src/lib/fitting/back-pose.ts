/**
 * Outfit's back view of a custom pose: the same body pose seen from behind.
 *
 * A pose's joints are COCO-18 and named for her own body (2 her right shoulder, 5 her left). Seen
 * from directly behind, the picture is the front picture mirrored: her right side moves from the
 * picture's left to its right — so every point flips across the frame and keeps its name. The
 * face points (nose, eyes) go: the back of the head shows only the ears. OpenPose tells a back
 * view by exactly that (guide-openpose.ts), and the pose words read "her back to the camera".
 */

import type { NormalizedBody } from '@/lib/pose/library';
import type { PhotoPose } from '@/lib/pose/types';
import { cameraAzimuthAround, cameraFromView } from '@/lib/pose/rig3d-camera';
import { cameraElevation, projectRig } from '@/lib/pose/rig3d-pose';

/** COCO-18 nose and eyes: not seen from behind. */
const FACE_POINTS = [0, 14, 15] as const;

type Point = { x: number; y: number };

/**
 * True when the figure already faces away (her right shoulder on the picture's right): its back
 * view is then the front. Unknown (a shoulder missing) counts as facing the camera.
 */
export function bodyFacesAway(body: NormalizedBody | null | undefined): boolean {
  const right = body?.[2];
  const left = body?.[5];
  if (!right || !left) return false;
  return left.x < right.x;
}

/** One figure turned to be seen from behind (or, already from behind, from the front). */
export function bodySeenFromBehind(body: NormalizedBody): NormalizedBody {
  const away = bodyFacesAway(body);
  const flipped = body.map(point => (point ? ({ x: 1 - point.x, y: point.y } as Point) : null));
  if (away) return flipped;
  for (const index of FACE_POINTS) flipped[index] = null;
  return flipped;
}

/**
 * The pose (lead figure only — a try-on is one person) seen from the other side. The 3D rig is
 * left out: `people` is the rig's projection, and the turned figure is drawn from that.
 */
export function photoPoseSeenFromBehind(photo: PhotoPose): PhotoPose {
  const lead = photo.people[0];
  return {
    aspect: photo.aspect,
    people: lead ? [bodySeenFromBehind(lead)] : [],
    // Drawn where it was posed, as the try-on drew it (a photo's people are framed to fill).
    ...(photo.source ? { source: photo.source } : {}),
    ...(photo.words ? { words: photo.words } : {}),
    ...(photo.posture ? { posture: photo.posture } : {}),
  };
}

/**
 * The pose as the try-on's back view keeps it (saved with Outfit's in-flight job): the lead's
 * joints, the name and the posture read — never the 3D rig (large, and not needed to draw it).
 */
export function fittingBackViewPose(photo: PhotoPose | null | undefined): PhotoPose | undefined {
  const lead = photo?.people[0];
  if (!photo || !lead) return undefined;
  return {
    aspect: photo.aspect,
    people: [lead],
    ...(photo.source ? { source: photo.source } : {}),
    ...(photo.words ? { words: photo.words } : {}),
    ...(photo.posture ? { posture: photo.posture } : {}),
  };
}

/**
 * A pose made in the 3D editor, seen from the other side of the same body (the camera walked
 * round her, the lead only): exact where mirroring the flat picture is not — a pose seen from
 * behind mirrors into a "front" with no face, and a bent figure's far limbs swap wrongly.
 * Undefined without the rig.
 */
export function rigSeenFromOtherSide(photo: PhotoPose | null | undefined): PhotoPose | undefined {
  const rig = photo?.rig3d;
  if (!photo || !rig?.figures[0]) return undefined;
  const lead = { ...rig, figures: [rig.figures[0]] };
  const camera = cameraFromView(
    lead,
    { azimuthDeg: cameraAzimuthAround(lead) + 180, elevationDeg: cameraElevation(lead.camera) },
    photo.aspect
  );
  const people = projectRig({ ...lead, camera }, photo.aspect);
  if (!people[0] || [8, 11].some(index => !people[0]![index])) return undefined;
  return {
    aspect: photo.aspect,
    people,
    source: photo.source ?? 'edited',
    ...(photo.words ? { words: photo.words } : {}),
    ...(photo.posture ? { posture: photo.posture } : {}),
  };
}
