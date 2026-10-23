/**
 * The camera-reading lift (liftBodyWithCamera) off the page's thread: the 3D editor and the
 * Director draw the quick eye-level lift at once and swap in the read camera when it lands.
 *
 * The answer goes into the same per-picture cache the sync lift uses, so a later
 * `liftBodies(…, { estimateCamera: 'cached' })` or `liftBodyWithCamera` on this thread gets it
 * without lifting again. No Worker (Node, tests, server rendering, a blocked worker): the lift
 * runs here, a turn later.
 */

import type { NormalizedBody } from '@/lib/pose/library';
import type { PoseRig3d, PoseRig3dCamera, PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import {
  cachedLiftWithCamera,
  DEFAULT_CAMERA,
  leadCameraLiftOptions,
  liftBodies,
  liftBodyWithCamera,
  rememberLiftWithCamera,
  type CameraLift,
  type LiftOptions,
} from '@/lib/pose/rig3d-pose';
import type { Posture } from '@/lib/pose/rig3d-posture-points';

export type LiftWorkerRequest =
  | { type: 'lift'; id: number; body: NormalizedBody; aspect: number; options: LiftOptions }
  | { type: 'cancel'; id: number };
export type LiftWorkerReply = { id: number; lift?: CameraLift; error?: string };

type Lifted = { figure: PoseRig3dFigure; camera: PoseRig3dCamera };

/** null: no worker here (or it failed) — lift on this thread. */
let worker: Worker | null | undefined;
let nextId = 1;
const jobs = new Map<
  number,
  { key: string; resolve: (lift: CameraLift) => void; reject: (error: Error) => void }
>();
/** One job per picture, however many wait on it. */
const inflight = new Map<string, { id: number; promise: Promise<CameraLift>; waiting: number }>();

function liftWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  try {
    const started = new Worker(new URL('./rig3d-lift.worker.ts', import.meta.url), {
      type: 'module',
      name: 'pose-lift',
    });
    started.addEventListener('message', (event: MessageEvent<LiftWorkerReply>) => {
      const reply = event.data;
      const job = jobs.get(reply.id);
      if (!job) return;
      jobs.delete(reply.id);
      if (reply.lift) job.resolve(reply.lift);
      else job.reject(new Error(reply.error || 'The pose lift failed.'));
    });
    // A worker that cannot load or dies: this thread lifts from now on (waiting jobs too).
    started.addEventListener('error', event => {
      event.preventDefault();
      worker = null;
      started.terminate();
      const waiting = [...jobs.values()];
      jobs.clear();
      for (const job of waiting) job.reject(new Error('worker'));
    });
    worker = started;
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * The lift on this thread, a turn later (so a caller still draws its quick lift first); skipped
 * when no one waits on the picture by then.
 */
function liftHere(
  key: string,
  id: number,
  body: NormalizedBody,
  aspect: number,
  options: LiftOptions
): Promise<CameraLift> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (inflight.get(key)?.id !== id) return reject(new Error('cancelled'));
      try {
        const lift = liftBodyWithCamera(body, aspect, options);
        resolve({ ...lift, moved: lift.camera !== (options.camera ?? DEFAULT_CAMERA) });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }, 0);
  });
}

function liftThere(
  key: string,
  body: NormalizedBody,
  aspect: number,
  options: LiftOptions
): { id: number; promise: Promise<CameraLift> } {
  const thread = liftWorker();
  const id = nextId++;
  if (!thread) return { id, promise: liftHere(key, id, body, aspect, options) };
  const promise = new Promise<CameraLift>((resolve, reject) => {
    jobs.set(id, { key, resolve, reject });
    thread.postMessage({ type: 'lift', id, body, aspect, options } satisfies LiftWorkerRequest);
  }).catch(error => {
    // The worker broke: lift here instead.
    if (error instanceof Error && error.message === 'worker')
      return liftHere(key, id, body, aspect, options);
    throw error;
  });
  return { id, promise };
}

/**
 * liftBodyWithCamera, read off this thread: the same answer (cached for the picture), the given
 * camera back as itself when the picture reads at it. Aborting stops waiting (and drops the job
 * when no one else waits on the picture); the promise then never settles.
 */
export function liftBodyWithCameraAsync(
  body: NormalizedBody,
  aspect: number,
  options: LiftOptions = {},
  signal?: AbortSignal
): Promise<Lifted> {
  const known = cachedLiftWithCamera(body, aspect, options);
  if (known) return Promise.resolve(known);
  const key = JSON.stringify([body, aspect, options]);
  let entry = inflight.get(key);
  if (!entry) {
    const started = liftThere(key, body, aspect, options);
    const made = {
      id: started.id,
      waiting: 0,
      promise: started.promise.then(lift => {
        rememberLiftWithCamera(body, aspect, options, lift);
        return lift;
      }),
    };
    const settle = () => {
      if (inflight.get(key) === made) inflight.delete(key);
    };
    made.promise.then(settle, settle);
    inflight.set(key, made);
    entry = made;
  }
  const job = entry;
  job.waiting += 1;
  return new Promise<Lifted>((resolve, reject) => {
    let done = false;
    const onAbort = () => {
      if (done) return;
      done = true;
      job.waiting -= 1;
      if (job.waiting > 0 || inflight.get(key) !== job) return;
      // No one waits on it now: drop it before it starts.
      inflight.delete(key);
      // (Already running there: its answer still fills the cache when it lands.)
      if (jobs.has(job.id)) worker?.postMessage({ type: 'cancel', id: job.id });
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    job.promise.then(
      () => {
        if (done) return;
        done = true;
        signal?.removeEventListener('abort', onAbort);
        resolve(cachedLiftWithCamera(body, aspect, options)!);
      },
      error => {
        if (done) return;
        done = true;
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

/** Whether liftBodies would read the lead's camera without lifting (already known). */
export function liftBodiesKnown(
  bodies: NormalizedBody[],
  aspect: number,
  kinds: Rig3dBodyKind[],
  camera: PoseRig3dCamera,
  postures: Array<Posture[] | undefined> = []
): boolean {
  const lead = bodies[0];
  if (!lead) return true;
  return (
    cachedLiftWithCamera(lead, aspect, leadCameraLiftOptions(kinds, camera, postures[0])) !== null
  );
}

/**
 * liftBodies with `estimateCamera`, the lead's camera read off this thread: resolves with the
 * rig liftBodies would give (the other figures are lifted here, through the read camera).
 */
export async function liftBodiesAsync(
  bodies: NormalizedBody[],
  aspect: number,
  kinds: Rig3dBodyKind[],
  camera: PoseRig3dCamera,
  options: { postures?: Array<Posture[] | undefined> } = {},
  signal?: AbortSignal
): Promise<PoseRig3d> {
  const lead = bodies[0];
  if (lead) {
    const request = leadCameraLiftOptions(kinds, camera, options.postures?.[0]);
    await liftBodyWithCameraAsync(lead, aspect, request, signal);
  }
  return liftBodies(bodies, aspect, kinds, camera, { ...options, estimateCamera: 'cached' });
}
