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
import { SCENE_POSE_ACT_IDS, SCENE_POSE_BODY_IDS } from '@/lib/day-pose-guide';

/**
 * Layouts a photo can be filed under: single-body postures and two-person sex layouts. The
 * headcount suffix of the library key comes from how many people DWPose finds.
 */
export const POSE_IMPORT_LAYOUTS: readonly string[] = [
  ...SCENE_POSE_BODY_IDS,
  ...SCENE_POSE_ACT_IDS.filter(id => id !== 'none' && id !== 'generic'),
];

/** Largest (most joints, then tallest) first — the lead is usually the main subject. */
export function orderImportedBodies(bodies: NormalizedBody[]): NormalizedBody[] {
  const size = (body: NormalizedBody) => {
    const points = body.filter((p): p is { x: number; y: number } => Boolean(p));
    const ys = points.map(p => p.y);
    return points.length * 10 + (ys.length ? Math.max(...ys) - Math.min(...ys) : 0);
  };
  return [...bodies].sort((a, b) => size(b) - size(a));
}

export async function importPoseFromPhoto(input: {
  file: File;
  layout: string;
}): Promise<{ key: string; people: number }> {
  const layout = input.layout.trim();
  if (!POSE_IMPORT_LAYOUTS.includes(layout)) {
    throw new Error('Pick a layout for this pose.');
  }
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const uploaded = await uploadComfyInputImage({ file: input.file, comfyUrl });
  const params = new URLSearchParams({
    filename: uploaded.name,
    subfolder: uploaded.subfolder ?? '',
    type: uploaded.type ?? 'input',
  });
  const detected = await detectStillPose(`/api/comfyui/view?${params.toString()}`);
  if (!detected.available) {
    throw new Error(detected.reason);
  }
  const bodies = orderImportedBodies(detected.pose.people.filter(bodyIsUsable)).slice(0, 3);
  if (bodies.length === 0) {
    throw new Error('No full body found in that photo — try one with the whole person in frame.');
  }
  const { width, height } = detected.pose.canvas;
  const key = `${layout}:${bodies.length}`;
  savePoseLibraryEntry({
    id: `import-${key}-${Date.now().toString(36)}`,
    key,
    aspect: width > 0 && height > 0 ? width / height : 2 / 3,
    people: bodies,
    // Hand-picked reference: rank alongside the best harvested poses.
    score: 1,
    createdAt: Date.now(),
  });
  return { key, people: bodies.length };
}
