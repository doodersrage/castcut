'use client';

/**
 * "Import pose from photo": seed the pose library from any reference photo instead of waiting
 * for Day / Story to harvest well-matched stills. Uploads the photo to ComfyUI, reads the pose
 * with DWPose, and saves it under the chosen layout.
 */

import { uploadComfyInputImage } from '@/lib/comfyui-image-upload';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { detectStillPose } from '@/lib/pose-detect-client';
import { bodyIsUsable, savePoseLibraryEntry, type NormalizedBody } from '@/lib/pose-library';
import type { PhotoPose } from '@/lib/day-pose-guide';
import { POSE_IMPORT_LAYOUTS } from '@/lib/pose-import-layouts';

export { POSE_IMPORT_LAYOUTS };

/** Largest (most joints, then tallest) first — the lead is usually the main subject. */
export function orderImportedBodies(bodies: NormalizedBody[]): NormalizedBody[] {
  const size = (body: NormalizedBody) => {
    const points = body.filter((p): p is { x: number; y: number } => Boolean(p));
    const ys = points.map(p => p.y);
    return points.length * 10 + (ys.length ? Math.max(...ys) - Math.min(...ys) : 0);
  };
  return [...bodies].sort((a, b) => size(b) - size(a));
}

/**
 * Read the people in a reference photo (uploads it to ComfyUI and runs DWPose). Lead first,
 * at most three, only bodies complete enough to pose from.
 */
export async function readPoseFromPhoto(file: File): Promise<PhotoPose> {
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const uploaded = await uploadComfyInputImage({ file, comfyUrl });
  const params = new URLSearchParams({
    filename: uploaded.name,
    subfolder: uploaded.subfolder ?? '',
    type: uploaded.type ?? 'input',
  });
  return readPoseFromImageUrl(`/api/comfyui/view?${params.toString()}`);
}

/** Read the people in an image ComfyUI can already see (a gallery still's view URL). */
export async function readPoseFromImageUrl(imageUrl: string): Promise<PhotoPose> {
  const detected = await detectStillPose(imageUrl);
  if (!detected.available) {
    throw new Error(detected.reason);
  }
  const people = orderImportedBodies(detected.pose.people.filter(bodyIsUsable)).slice(0, 3);
  if (people.length === 0) {
    throw new Error('No full body found in that image — it needs the whole person in frame.');
  }
  const { width, height } = detected.pose.canvas;
  return { aspect: width > 0 && height > 0 ? width / height : 2 / 3, people };
}

/** File a pose under a layout in the pose library (hand-picked: ranks with the best). */
export function savePhotoPoseToLibrary(pose: PhotoPose, layout: string): { key: string } {
  const key = `${layout}:${pose.people.length}`;
  savePoseLibraryEntry({
    id: `import-${key}-${Date.now().toString(36)}`,
    key,
    aspect: pose.aspect,
    people: pose.people,
    score: 1,
    createdAt: Date.now(),
  });
  return { key };
}

export async function importPoseFromPhoto(input: {
  file: File;
  layout: string;
}): Promise<{ key: string; people: number }> {
  const layout = input.layout.trim();
  if (!POSE_IMPORT_LAYOUTS.includes(layout)) {
    throw new Error('Pick a layout for this pose.');
  }
  const pose = await readPoseFromPhoto(input.file);
  const { key } = savePhotoPoseToLibrary(pose, layout);
  return { key, people: pose.people.length };
}
