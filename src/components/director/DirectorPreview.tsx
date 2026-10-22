'use client';

import { useEffect, useRef, useState } from 'react';
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
  /** The still, shown small in a corner to compare with. */
  stillUrl?: string;
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
export default function DirectorPreview({
  body,
  aspect,
  frames,
  start,
  end,
  time,
  stillUrl,
  testId,
}: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const aspectRef = useRef(aspect);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<DirectorStage | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const drawRef = useRef<() => void>(() => {});

  // The picture box: as large as the area allows at the video's shape.
  useEffect(() => {
    aspectRef.current = aspect;
    const area = areaRef.current;
    if (!area) return;
    const fit = () => {
      const a = aspectRef.current;
      const w = Math.max(1, area.clientWidth);
      const h = Math.max(1, area.clientHeight);
      const width = Math.floor(Math.min(w, h * a));
      setBox({ width, height: Math.floor(width / a) });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, [aspect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    createDirectorStage(canvas, body)
      .then(stage => {
        if (cancelled) {
          stage.dispose();
          return;
        }
        stageRef.current = stage;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, [body]);

  useEffect(() => {
    if (ready && box) {
      stageRef.current?.setSize(box.width, box.height, Math.min(2, window.devicePixelRatio || 1));
    }
  }, [ready, box]);

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
    <div ref={areaRef} className="flex h-full w-full min-w-0 items-center justify-center">
      <div
        className="relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]"
        style={box ? { width: box.width, height: box.height } : { visibility: 'hidden' }}
        data-testid={testId}
        data-ready={ready ? 'true' : 'false'}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
        {stillUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stillUrl}
            alt="The still"
            title="The still: she should fill the frame the same way"
            className="pointer-events-none absolute bottom-2 right-2 w-[24%] rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] object-contain opacity-90 shadow"
            style={{ aspectRatio: String(aspect) }}
            data-testid={`${testId}-still`}
          />
        ) : null}
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
    </div>
  );
}
