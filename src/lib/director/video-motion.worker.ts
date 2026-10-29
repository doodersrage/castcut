/**
 * The video lift off the page's thread (video-motion.ts: every frame lifted, a few seconds for
 * a 10 s video). Started by video-motion-client.ts; plain data in and out.
 */

import type { Rig3dBodyKind } from '@/lib/pose/rig3d';
import { liftVideoMotion, type VideoPoseRead } from './video-motion';

const scope = self as unknown as {
  postMessage(message: unknown): void;
  addEventListener(
    type: 'message',
    listener: (
      event: MessageEvent<{ id: number; read: VideoPoseRead; kind: Rig3dBodyKind }>
    ) => void
  ): void;
};

scope.addEventListener('message', event => {
  const { id, read, kind } = event.data;
  try {
    scope.postMessage({ id, frames: liftVideoMotion(read, kind) });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
