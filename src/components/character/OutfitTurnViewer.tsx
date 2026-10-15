'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  turnFrameAfterDrag,
  turnLoop,
  TURN_SIGNATURE_H,
  TURN_SIGNATURE_W,
} from '@/lib/outfit-turn';

/** Frames read from the clip per second (LTX and H3 clips are 24 fps). */
const READ_FPS = 24;
/** Width the frames are kept at (enough for the sheet; ~0.5 MB each). */
const FRAME_W = 360;

type Frames = { bitmaps: ImageBitmap[]; full: boolean };

/** A whole play-through with `schedule` calling back on each new frame; ends at the clip's end. */
async function playThrough(
  video: HTMLVideoElement,
  schedule: (onFrame: () => void) => void,
  capture: () => Promise<void>
): Promise<void> {
  // A second pass starts from the end: rewind first, or its first frame is a blank (Firefox).
  if (video.currentTime !== 0) {
    await new Promise<void>(resolve => {
      video.onseeked = () => resolve();
      video.currentTime = 0;
    });
  }
  return new Promise<void>((resolve, reject) => {
    let pending = Promise.resolve();
    let done = false;
    const finish = (error?: unknown) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      video.onended = null;
      if (error) reject(error);
      else void pending.then(() => resolve(), reject);
    };
    // A stalled clip must not leave the viewer on "Getting the turn ready…" for good.
    const timer = window.setTimeout(
      () => finish(new Error('The runway clip stopped playing.')),
      (video.duration || 10) * 3000 + 10_000
    );
    const onFrame = () => {
      if (done) return;
      pending = pending.then(capture);
      if (!video.ended) schedule(onFrame);
    };
    schedule(onFrame);
    video.onended = () => finish();
    video.play().catch(finish);
  });
}

async function readFrames(src: string, onProgress: (share: number) => void): Promise<Frames> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = src;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('The runway clip could not be read.'));
  });
  const count = Math.max(1, Math.floor(video.duration * READ_FPS));
  const width = Math.min(FRAME_W, video.videoWidth || FRAME_W);
  const height = Math.round((width / (video.videoWidth || 1)) * (video.videoHeight || width));
  const small = document.createElement('canvas');
  small.width = TURN_SIGNATURE_W;
  small.height = TURN_SIGNATURE_H;
  const smallCtx = small.getContext('2d', { willReadFrequently: true })!;
  let bitmaps: ImageBitmap[] = [];
  let signatures: Uint8Array[] = [];
  let lastFrame = -1;
  const reset = () => {
    for (const bitmap of bitmaps) bitmap.close();
    bitmaps = [];
    signatures = [];
    lastFrame = -1;
  };
  const capture = async () => {
    // Animation ticks outnumber the clip's frames (and the clock moves between them): keep one
    // capture per frame of the clip.
    const frame = Math.round(video.currentTime * READ_FPS);
    if (frame === lastFrame) return;
    lastFrame = frame;
    bitmaps.push(await createImageBitmap(video, { resizeWidth: width, resizeHeight: height }));
    // Signature: the middle half of the width, where she stands, in grey.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    smallCtx.drawImage(video, vw / 4, 0, vw / 2, vh, 0, 0, TURN_SIGNATURE_W, TURN_SIGNATURE_H);
    const rgba = smallCtx.getImageData(0, 0, TURN_SIGNATURE_W, TURN_SIGNATURE_H).data;
    const grey = new Uint8Array(TURN_SIGNATURE_W * TURN_SIGNATURE_H);
    for (let p = 0; p < grey.length; p += 1) {
      grey[p] = Math.round(
        0.299 * rgba[p * 4]! + 0.587 * rgba[p * 4 + 1]! + 0.114 * rgba[p * 4 + 2]!
      );
    }
    signatures.push(grey);
    onProgress(Math.min(bitmaps.length / count, 1));
  };
  const enough = () => bitmaps.length >= count / 2;
  // Played through, each shown frame kept: seeking re-decodes from the clip's only keyframe
  // every time (~30 s for a 5 s clip); playing takes the clip's own length. Frame callbacks
  // first; Firefox can skip them for a video that is not on the page (a turn that read no
  // frames at all, 2026-10-14), so animation ticks next, and seeking last.
  if (typeof video.requestVideoFrameCallback === 'function') {
    await playThrough(video, onFrame => video.requestVideoFrameCallback(onFrame), capture).catch(
      () => undefined
    );
  }
  if (!enough()) {
    reset();
    await playThrough(video, onFrame => window.requestAnimationFrame(onFrame), capture).catch(
      () => undefined
    );
  }
  if (!enough()) {
    reset();
    video.pause();
    for (let i = 0; i < count; i += 1) {
      await new Promise<void>(resolve => {
        video.onseeked = () => resolve();
        video.currentTime = Math.min(i / READ_FPS + 0.001, video.duration - 0.001);
      });
      await capture();
    }
  }
  video.removeAttribute('src');
  video.load();
  if (bitmaps.length < 2) {
    reset();
    throw new Error(
      'Could not read the frames of the runway clip — try again, or another browser.'
    );
  }
  const loop = turnLoop(signatures);
  for (const bitmap of bitmaps.slice(loop.end)) bitmap.close();
  return { bitmaps: bitmaps.slice(0, loop.end), full: loop.full };
}

/**
 * Turn her around: the runway clip's frames on a canvas — drag (or ← →) to turn, and it spins on
 * its own until touched (not with reduced motion). Every angle is a real frame of the clip.
 */
/** Mounted once per clip (OutfitTurnSheet keys it by `src`). */
export default function OutfitTurnViewer({ src, label }: { src: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frames, setFrames] = useState<Frames | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  // Spins on its own until touched — not with reduced motion (client-only: loaded with ssr false).
  const [spinning, setSpinning] = useState(
    () => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
  const drag = useRef<{ x: number; start: number } | null>(null);
  const direction = useRef(1);

  useEffect(() => {
    let cancelled = false;
    let kept: Frames | null = null;
    readFrames(src, share => !cancelled && setProgress(share))
      .then(result => {
        kept = result;
        if (cancelled) {
          for (const bitmap of result.bitmaps) bitmap.close();
          return;
        }
        setFrames(result);
      })
      .catch(err => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
      for (const bitmap of kept?.bitmaps ?? []) bitmap.close();
    };
  }, [src]);

  // Spin: forward at half the clip's speed; a part turn goes back and forth.
  useEffect(() => {
    if (!frames || !spinning || frames.bitmaps.length < 2) return;
    const timer = window.setInterval(
      () => {
        setIndex(current => {
          const count = frames.bitmaps.length;
          if (frames.full) return (current + 1) % count;
          if (current + direction.current < 0 || current + direction.current >= count) {
            direction.current = -direction.current;
          }
          return current + direction.current;
        });
      },
      1000 / (READ_FPS / 2)
    );
    return () => window.clearInterval(timer);
  }, [frames, spinning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const bitmap = frames?.bitmaps[index];
    if (!canvas || !bitmap) return;
    if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
    if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  }, [frames, index]);

  if (error) return <p className="ui-alert-danger type-caption">{error}</p>;
  if (!frames) {
    return (
      <p className="type-caption text-[var(--text-muted)]" role="status">
        Getting the turn ready… {Math.round(progress * 100)}%
      </p>
    );
  }
  const count = frames.bitmaps.length;
  const move = (step: number) => {
    setSpinning(false);
    setIndex(current =>
      turnFrameAfterDrag({
        start: current,
        dx: step,
        count,
        full: frames.full,
        pixelsPerTurn: count,
      })
    );
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        role="slider"
        tabIndex={0}
        aria-label={`Turn ${label} around`}
        aria-valuemin={0}
        aria-valuemax={count - 1}
        aria-valuenow={index}
        aria-valuetext={`${Math.round((index / count) * 360)} degrees`}
        data-testid="outfit-turn-viewer"
        className="max-h-[70vh] w-full max-w-[420px] cursor-grab touch-pan-y select-none rounded-[var(--radius-md)] bg-black object-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:cursor-grabbing"
        style={{ aspectRatio: `${frames.bitmaps[0]!.width} / ${frames.bitmaps[0]!.height}` }}
        onPointerDown={(event: PointerEvent<HTMLCanvasElement>) => {
          setSpinning(false);
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, start: index };
        }}
        onPointerMove={(event: PointerEvent<HTMLCanvasElement>) => {
          if (!drag.current) return;
          setIndex(
            turnFrameAfterDrag({
              start: drag.current.start,
              dx: event.clientX - drag.current.x,
              count,
              full: frames.full,
              pixelsPerTurn: event.currentTarget.clientWidth * 1.5,
            })
          );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(event: KeyboardEvent<HTMLCanvasElement>) => {
          if (event.key === 'ArrowRight') move(1);
          else if (event.key === 'ArrowLeft') move(-1);
          else return;
          event.preventDefault();
        }}
      />
      <p className="type-caption text-[var(--text-muted)]">
        Drag to turn{frames.full ? '' : ' (this clip is a part turn)'} ·{' '}
        <button
          type="button"
          className="ui-text-link"
          data-testid="outfit-turn-spin"
          onClick={() => setSpinning(value => !value)}
        >
          {spinning ? 'Stop spinning' : 'Spin'}
        </button>
      </p>
    </div>
  );
}
