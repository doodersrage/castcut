/**
 * Where the face is on a Cast plate — shared types and the pure parts of face-locate-server.ts
 * (reading FaceBoundingBox's lists, mapping a box found on a turned plate back).
 */

import type { FaceBox } from '@/lib/portrait-face-crop';

export type { FaceBox };

/** ComfyUI core `ImageRotate` choices tried in order ("90 degrees" turns clockwise). */
export const FACE_LOCATE_ROTATIONS = ['none', '90 degrees', '270 degrees'] as const;
export type FaceLocateRotation = (typeof FACE_LOCATE_ROTATIONS)[number];

export type FaceLocateResult =
  | { available: true; face: FaceBox; rotation?: FaceLocateRotation }
  | { available: true; face: null }
  | { available: false; reason: string };

/** Shown when a plate's face crop had to fall back to the top of the plate. */
export const NO_FACE_ON_PLATE_MESSAGE =
  'No face found on this plate — Prepare plate or use an upright photo.';

function numbersOf(raw: unknown): number[] {
  if (typeof raw === 'number') return Number.isFinite(raw) ? [raw] : [];
  if (Array.isArray(raw)) return raw.flatMap(numbersOf);
  if (typeof raw === 'string') {
    try {
      return numbersOf(JSON.parse(raw) as unknown);
    } catch {
      const value = Number(raw.trim());
      return raw.trim() && Number.isFinite(value) ? [value] : [];
    }
  }
  return [];
}

/**
 * FaceBoundingBox (index -1) lists x, y, width and height of every face; PreviewAny shows each
 * list as text, one string per face or one JSON list.
 */
export function parseFaceBoxLists(texts: unknown[][] | undefined): FaceBox[] {
  if (!texts || texts.length < 4) return [];
  const [xs, ys, ws, hs] = texts.map(numbersOf) as [number[], number[], number[], number[]];
  const count = Math.min(xs.length, ys.length, ws.length, hs.length);
  const boxes: FaceBox[] = [];
  for (let index = 0; index < count; index += 1) {
    const box = { x: xs[index]!, y: ys[index]!, width: ws[index]!, height: hs[index]! };
    if (box.width > 0 && box.height > 0) boxes.push(box);
  }
  return boxes;
}

/** The plate's lead: the largest face (a Cast plate shows one person). */
export function largestFaceBox(boxes: FaceBox[]): FaceBox | null {
  let best: FaceBox | null = null;
  for (const box of boxes) {
    if (!best || box.width * box.height > best.width * best.height) best = box;
  }
  return best;
}

/**
 * A box found on the plate turned by ImageRotate, in the unturned plate's pixels. `width` and
 * `height` are the unturned plate's size.
 */
export function mapRotatedFaceBox(
  box: FaceBox,
  rotation: FaceLocateRotation,
  width: number,
  height: number
): FaceBox {
  if (rotation === '90 degrees') {
    // Clockwise: (x, y) → (H − y, x).
    return { x: box.y, y: height - (box.x + box.width), width: box.height, height: box.width };
  }
  if (rotation === '270 degrees') {
    // Counter-clockwise: (x, y) → (y, W − x).
    return { x: width - (box.y + box.height), y: box.x, width: box.height, height: box.width };
  }
  return box;
}
