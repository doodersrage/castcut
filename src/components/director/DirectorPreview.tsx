'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PoseRig3dCamera, PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import { mixFigures } from '@/lib/director/figure-ops';
import { cameraAt } from '@/lib/director/framing';
import { createDirectorStage, type DirectorStage } from '@/lib/director/stage-three';
import { DIRECTOR_FPS } from '@/lib/director/types';

type Props = {
  body: Rig3dBodyKind;
  aspect: number;
  frames: PoseRig3dFigure[];
  start: PoseRig3dCamera;
  end: PoseRig3dCamera;
  /** Seconds from the start. */
  time: number;
  testId: string;
};

/** Her body at `time`, between the two nearest frames. */
function figureAt(frames: PoseRig3dFigure[], time: number): PoseRig3dFigure {
  const f = Math.max(0, Math.min(frames.length - 1, time * DIRECTOR_FPS));
  const i = Math.min(frames.length - 2, Math.floor(f));
  if (i < 0) return frames[0]!;
  return mixFigures(frames[i]!, frames[i + 1]!, f - i);
}

/** The direction played on the 3D stage, framed as the driving video will be. */
export default function DirectorPreview({ body, aspect, frames, start, end, time, testId }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<DirectorStage | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const drawRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    createDirectorStage(canvas, body)
      .then(stage => {
        if (cancelled) {
          stage.dispose();
          return;
        }
        stageRef.current = stage;
        const fit = () => {
          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          stage.setSize(width, height, Math.min(2, window.devicePixelRatio || 1));
          drawRef.current();
        };
        fit();
        observer = new ResizeObserver(fit);
        observer.observe(host);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, [body]);

  // Every render: the latest frames, camera and time, drawn now and on a resize.
  useEffect(() => {
    drawRef.current = () => {
      const stage = stageRef.current;
      if (!stage || !frames.length) return;
      const last = Math.max(1, frames.length - 1);
      stage.draw(
        figureAt(frames, time),
        cameraAt(start, end, Math.min(1, (time * DIRECTOR_FPS) / last))
      );
    };
    drawRef.current();
  });

  return (
    <div
      ref={hostRef}
      className="relative max-h-full w-auto max-w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]"
      style={{ aspectRatio: String(aspect), '--director-aspect': String(aspect) } as CSSProperties}
      data-testid={testId}
      data-ready={ready ? 'true' : 'false'}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      {!ready && !failed ? (
        <p className="type-caption pointer-events-none absolute inset-x-0 top-2 text-center text-[var(--text-muted)]">
          Loading the 3D body…
        </p>
      ) : null}
      {failed ? (
        <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-[var(--text-secondary)]">
          The 3D view could not start here.
        </p>
      ) : null}
    </div>
  );
}
