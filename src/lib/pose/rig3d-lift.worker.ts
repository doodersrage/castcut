/**
 * The lift worker: reads the camera from a flat pose (liftBodyWithCamera, ~0.3 s and up to ~1 s)
 * off the page's thread, so the 3D editor and the Director open at once. Started by
 * rig3d-lift-async.ts; everything in and out is plain data (no three.js objects cross).
 *
 * Jobs run one at a time, a turn apart, so a job cancelled while it waits (the player moved on
 * to another pose) is dropped before it starts.
 */

import { DEFAULT_CAMERA, liftBodyWithCamera } from '@/lib/pose/rig3d-pose';
import type { LiftWorkerReply, LiftWorkerRequest } from '@/lib/pose/rig3d-lift-async';

type Job = Extract<LiftWorkerRequest, { type: 'lift' }>;

const scope = self as unknown as {
  postMessage(message: LiftWorkerReply): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<LiftWorkerRequest>) => void
  ): void;
};

const queue: Job[] = [];
let scheduled = false;

function runNext() {
  scheduled = false;
  const job = queue.shift();
  if (!job) return;
  try {
    const base = job.options.camera ?? DEFAULT_CAMERA;
    const lift = liftBodyWithCamera(job.body, job.aspect, job.options);
    scope.postMessage({
      id: job.id,
      lift: { figure: lift.figure, camera: lift.camera, moved: lift.camera !== base },
    });
  } catch (error) {
    scope.postMessage({
      id: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  schedule();
}

function schedule() {
  if (scheduled || !queue.length) return;
  scheduled = true;
  setTimeout(runNext, 0);
}

scope.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'cancel') {
    const at = queue.findIndex(job => job.id === message.id);
    if (at >= 0) {
      queue.splice(at, 1);
      scope.postMessage({ id: message.id, error: 'cancelled' });
    }
    return;
  }
  queue.push(message);
  schedule();
});
