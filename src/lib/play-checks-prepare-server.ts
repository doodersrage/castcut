/**
 * Server-only: "Prepare checks" — run the face check and the pose check once on a bundled sample
 * picture, so what they fetch on first use (InsightFace's buffalo_l from GitHub, DWPose's models
 * from Hugging Face) is fetched now, during setup, instead of stalling the first check of a Day.
 * With the Castcut nodes it also loads their CPU analyzers. Uses the same functions the checks
 * use, so it proves the real path works.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { uploadComfyInputContent } from '@/lib/comfy-input-upload-server';
import { comfyBaseUrl } from '@/lib/comfy-utility-graph-server';
import { locateFaceInComfy } from '@/lib/face-locate-server';
import { detectPoseInComfyStill } from '@/lib/pose-detect-server';

/** A fully clothed adult standing full-body, face to camera (rendered by the app, Rapid SFW). */
export const CHECK_SAMPLE_PATH = path.join('public', 'samples', 'check-sample.webp');

export type PrepareCheckResult = {
  ready: boolean;
  /** What happened, for one line under the row. */
  detail: string;
  seconds: number;
};

export type PlayChecksPrepareResult = { face: PrepareCheckResult; pose: PrepareCheckResult };

/** First use can download several hundred MB: allow ten minutes per check. */
const CHECK_TIMEOUT_MS = 10 * 60_000;

async function timed(
  run: () => Promise<{ ready: boolean; detail: string }>
): Promise<PrepareCheckResult> {
  const started = Date.now();
  try {
    const result = await run();
    return { ...result, seconds: Math.round((Date.now() - started) / 100) / 10 };
  } catch (error) {
    return {
      ready: false,
      detail: error instanceof Error ? error.message : 'The check failed.',
      seconds: Math.round((Date.now() - started) / 100) / 10,
    };
  }
}

export async function preparePlayChecks(input: {
  comfyUrl?: string;
  /** Tests: the sample's bytes. */
  sample?: Uint8Array;
}): Promise<PlayChecksPrepareResult> {
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const bytes =
    input.sample ?? new Uint8Array(await readFile(path.join(process.cwd(), CHECK_SAMPLE_PATH)));
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  // One after the other: both load models into the same ComfyUI.
  const face = await timed(async () => {
    const located = await locateFaceInComfy({
      bytes,
      mimeType: 'image/webp',
      width,
      height,
      comfyUrl: input.comfyUrl,
    });
    if (!located.available) return { ready: false, detail: located.reason };
    return located.face
      ? { ready: true, detail: 'found the face on the sample' }
      : { ready: false, detail: 'ran, but found no face on the sample' };
  });

  const pose = await timed(async () => {
    const staged = await uploadComfyInputContent({
      baseUrl,
      bytes,
      filename: 'check-sample.webp',
      mimeType: 'image/webp',
      timeoutMs: 30_000,
    });
    const params = new URLSearchParams({
      filename: staged.name,
      subfolder: staged.subfolder ?? '',
      type: 'input',
    });
    const detected = await detectPoseInComfyStill({
      imageUrl: `/api/comfyui/view?${params.toString()}`,
      comfyUrl: input.comfyUrl,
      timeoutMs: CHECK_TIMEOUT_MS,
    });
    if (!detected.available) return { ready: false, detail: detected.reason };
    return detected.pose.people.length > 0
      ? { ready: true, detail: 'read the body on the sample' }
      : { ready: false, detail: 'ran, but read no body on the sample' };
  });

  return { face, pose };
}

/** One line for the readiness card. */
export function describePrepareResult(result: PlayChecksPrepareResult): string {
  const part = (name: string, check: PrepareCheckResult) =>
    check.ready
      ? `${name} check ready (${check.seconds} s)`
      : `${name} check: ${check.detail} (${check.seconds} s)`;
  return `${part('Face', result.face)} · ${part('Pose', result.pose)}.`;
}
