'use client';

/**
 * Browser: the Director's "From a video…" — the video read on the server (DWPose on every frame,
 * /api/director/video-pose, a background job polled here), then lifted onto the 3D body in a
 * worker (video-motion.worker.ts; on this thread when there is no worker).
 */

import type { PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import { liftVideoMotion, type VideoPoseRead } from './video-motion';

type ReadJob = {
  id: string;
  status: 'running' | 'completed' | 'error';
  note?: string;
  read?: VideoPoseRead;
  error?: string;
};

async function jobReply(response: Response): Promise<ReadJob> {
  const data = (await response.json().catch(() => ({}))) as { job?: ReadJob; error?: string };
  if (!response.ok || !data.job)
    throw new Error(data.error || `Reading the video failed (HTTP ${response.status}).`);
  return data.job;
}

/** The body in every frame of `video`, read on ComfyUI. */
export async function readVideoPoses(
  video: Blob,
  options: { onNote?: (note: string) => void; signal?: AbortSignal; pollMs?: number } = {}
): Promise<VideoPoseRead> {
  const form = new FormData();
  form.append('video', video, video instanceof File ? video.name : 'video.mp4');
  let job = await jobReply(
    await fetch('/api/director/video-pose', { method: 'POST', body: form, signal: options.signal })
  );
  while (job.status === 'running') {
    if (job.note) options.onNote?.(job.note);
    await new Promise(resolve => setTimeout(resolve, options.pollMs ?? 1500));
    if (options.signal?.aborted) throw new DOMException('Stopped.', 'AbortError');
    job = await jobReply(
      await fetch(`/api/director/video-pose?jobId=${encodeURIComponent(job.id)}`, {
        signal: options.signal,
      })
    );
  }
  if (job.status === 'error' || !job.read)
    throw new Error(job.error || 'Could not read the moves.');
  return job.read;
}

let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<
  number,
  { resolve: (frames: PoseRig3dFigure[]) => void; reject: (error: Error) => void }
>();

function liftWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  try {
    const started = new Worker(new URL('./video-motion.worker.ts', import.meta.url), {
      type: 'module',
      name: 'director-video-lift',
    });
    started.addEventListener(
      'message',
      (event: MessageEvent<{ id: number; frames?: PoseRig3dFigure[]; error?: string }>) => {
        const job = waiting.get(event.data.id);
        if (!job) return;
        waiting.delete(event.data.id);
        if (event.data.frames) job.resolve(event.data.frames);
        else job.reject(new Error(event.data.error || 'Could not follow the moves.'));
      }
    );
    started.addEventListener('error', event => {
      event.preventDefault();
      worker = null;
      started.terminate();
      const jobs = [...waiting.values()];
      waiting.clear();
      for (const job of jobs) job.reject(new Error('worker'));
    });
    worker = started;
  } catch {
    worker = null;
  }
  return worker;
}

const liftHere = (read: VideoPoseRead, kind: Rig3dBodyKind) =>
  new Promise<PoseRig3dFigure[]>((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(liftVideoMotion(read, kind));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }, 0)
  );

/** The read lifted onto the 3D body (video-motion.ts), off this thread when it can be. */
export function liftVideoMotionAsync(
  read: VideoPoseRead,
  kind: Rig3dBodyKind
): Promise<PoseRig3dFigure[]> {
  const thread = liftWorker();
  if (!thread) return liftHere(read, kind);
  const id = nextId++;
  return new Promise<PoseRig3dFigure[]>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    thread.postMessage({ id, read, kind });
  }).catch(error => {
    if (error instanceof Error && error.message === 'worker') return liftHere(read, kind);
    throw error;
  });
}
