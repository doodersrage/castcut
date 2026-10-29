/**
 * Server: the body in every frame of the player's own video, for the Director's "From a video…"
 * (video-motion.ts lifts it). The video becomes a DIRECTOR_FPS MP4 (at most
 * VIDEO_MOTION_MAX_FRAMES, long side 768) in ComfyUI's input, and one DWPose job reads every
 * frame (a 2.5 s clip in under a minute, the model loaded with it). A background job: the read
 * can wait behind the render in progress, longer than a request may stay open.
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { writeClipSource } from '@/lib/clip/clip-source-server';
import { uploadComfyInputContent } from '@/lib/comfyui/comfy-input-upload-server';
import {
  comfyBaseUrl,
  resolveComfyNode,
  runComfyUtilityGraph,
} from '@/lib/comfyui/comfy-utility-graph-server';
import { buildDetectorInputs } from '@/lib/pose/detect-server';
import { filmTempOsDir, resolveFfmpegBinary } from '@/lib/video/server-encode';
import { DIRECTOR_FPS, VIDEO_MOTION_MAX_FRAMES } from './types';
import { parseVideoPoseFrames, type VideoPoseRead } from './video-motion';

export type VideoPoseJob = {
  id: string;
  status: 'running' | 'completed' | 'error';
  note?: string;
  read?: VideoPoseRead;
  error?: string;
};

const jobs = new Map<string, VideoPoseJob>();
const TORCH_DETECTOR = 'yolox_l.torchscript.pt';
const MAX_JOBS = 8;

export function getVideoPoseJob(id: string): VideoPoseJob | null {
  const job = jobs.get(id.trim());
  return job ? { ...job } : null;
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', code =>
      code === 0 ? resolve(stderr) : reject(new Error(stderr.trim() || `ffmpeg exited ${code}`))
    );
  });
}

export async function readVideoPoses(input: {
  video: Uint8Array;
  comfyUrl?: string;
  onNote?: (note: string) => void;
}): Promise<VideoPoseRead> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const detector = await resolveComfyNode(baseUrl, ['DWPreprocessor', 'OpenposePreprocessor']);
  if (!detector) throw new Error('DWPose is not installed in ComfyUI (comfyui_controlnet_aux).');
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `video-pose-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    const source = path.join(/* turbopackIgnore: true */ dir, 'video.bin');
    const steady = path.join(/* turbopackIgnore: true */ dir, 'video.mp4');
    await writeClipSource(ffmpeg, Buffer.from(input.video), source);
    await run(ffmpeg, [
      '-y',
      '-i',
      source,
      '-vf',
      `fps=${DIRECTOR_FPS},scale='if(gt(iw,ih),min(768,iw),-2)':'if(gt(iw,ih),-2,min(768,ih))'`,
      '-frames:v',
      String(VIDEO_MOTION_MAX_FRAMES),
      '-an',
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      steady,
    ]).catch(() => {
      throw new Error('Could not read that video.');
    });
    input.onNote?.('Reading the moves on ComfyUI');
    const bytes = new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ steady));
    const detectorInputs = (image: [string, number]) => {
      const inputs = buildDetectorInputs(detector.info, image);
      // The GPU person detector where offered: the ONNX one runs on the CPU (40 frames: 46 s
      // against 7 s).
      const options = detector.info.input?.optional?.bbox_detector?.[0];
      if (Array.isArray(options) && options.includes(TORCH_DETECTOR)) {
        inputs.bbox_detector = TORCH_DETECTOR;
      }
      return inputs;
    };
    const uploaded = await uploadComfyInputContent({
      baseUrl,
      bytes,
      filename: 'castcut-director-video.mp4',
      mimeType: 'video/mp4',
    });
    // The same video again is the same graph: runComfyUtilityGraph runs it past ComfyUI's cache.
    const { result } = await runComfyUtilityGraph({
      baseUrl,
      label: 'director-video-pose',
      priority: 'check',
      timeoutMs: 15 * 60_000,
      prompt: {
        '1': { class_type: 'LoadVideo', inputs: { file: uploaded.name } },
        '2': { class_type: 'GetVideoComponents', inputs: { video: ['1', 0] } },
        '3': { class_type: detector.node, inputs: detectorInputs(['2', 0]) },
        '4': { class_type: 'PreviewImage', inputs: { images: ['3', 0] } },
      },
      read: entry => entry.outputs?.['3']?.openpose_json?.[0],
    });
    const read = result === undefined ? null : parseVideoPoseFrames(result);
    if (!read) throw new Error('DWPose found no one in that video.');
    return read;
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}

export function startVideoPoseJob(input: { video: Uint8Array; comfyUrl?: string }): VideoPoseJob {
  const job: VideoPoseJob = {
    id: randomUUID(),
    status: 'running',
    note: 'Getting the video ready',
  };
  jobs.set(job.id, job);
  while (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value as string);
  void readVideoPoses({ ...input, onNote: note => Object.assign(job, { note }) })
    .then(read => Object.assign(job, { status: 'completed', read, note: undefined }))
    .catch(error =>
      Object.assign(job, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Could not read the moves.',
      })
    );
  return { ...job };
}
