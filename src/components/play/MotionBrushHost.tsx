'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Dialog from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { pushAppToast } from '@/lib/app/toast';
import { ClipJobBusyError } from '@/lib/clip/clip-jobs';
import { runClipJob, runningTrackedClipJob } from '@/lib/clip/clip-jobs-tracker';
import { MOTION_BRUSH_MAX_STROKES, type MotionStroke } from '@/lib/clip/motion-brush';
import { MOTION_BRUSH_OPEN_EVENT, type MotionBrushTarget } from '@/lib/clip/motion-open';

/** A drag shorter than this (fraction of the picture) is a click: a pinned point. */
const PIN_DISTANCE = 0.01;

/** Arrow and pin drawing over the still (SVG in the picture's own 0–1 space). */
function StrokeOverlay({ strokes }: { strokes: readonly MotionStroke[] }) {
  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <marker
          id="motion-arrow"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="#facc15" />
        </marker>
      </defs>
      {strokes.map((stroke, index) =>
        stroke.length === 1 ? (
          <circle
            key={index}
            cx={stroke[0]!.x}
            cy={stroke[0]!.y}
            r={0.012}
            fill="#38bdf8"
            stroke="white"
            strokeWidth={0.003}
          />
        ) : (
          <polyline
            key={index}
            points={stroke.map(point => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke="#facc15"
            strokeWidth={0.008}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#motion-arrow)"
            vectorEffect="non-scaling-stroke"
            style={{ strokeWidth: 4 }}
          />
        )
      )}
    </svg>
  );
}

/**
 * Motion brush (Gallery still ⋯ → Make it move; clip/motion-brush.ts): drag on the still to draw
 * where something goes — its start point follows the path through the clip — or click to pin a
 * point that stays put. The new clip is kept in the Gallery as the still's child (a background job).
 */
export default function MotionBrushHost() {
  const [target, setTarget] = useState<MotionBrushTarget | null>(null);
  const [strokes, setStrokes] = useState<MotionStroke[]>([]);
  const [drawing, setDrawing] = useState<MotionStroke | null>(null);
  const [prompt, setPrompt] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<MotionBrushTarget>).detail;
      if (!detail?.stillUrl) return;
      setTarget(detail);
      setStrokes([]);
      setDrawing(null);
      setPrompt('');
    };
    window.addEventListener(MOTION_BRUSH_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(MOTION_BRUSH_OPEN_EVENT, onOpen);
  }, []);

  if (!target) return null;
  const close = () => setTarget(null);
  const at = (event: ReactPointerEvent) => {
    const rect = box.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };
  const full = strokes.length >= MOTION_BRUSH_MAX_STROKES;

  const finish = () => {
    if (!drawing) return;
    const first = drawing[0]!;
    const last = drawing[drawing.length - 1]!;
    // A tap (no real drag) pins the point; a drag keeps every point drawn.
    const pin = Math.hypot(last.x - first.x, last.y - first.y) < PIN_DISTANCE;
    setStrokes(list => [...list, pin ? [first] : drawing]);
    setDrawing(null);
  };

  const go = async () => {
    if (!strokes.some(stroke => stroke.length > 1)) return;
    if (runningTrackedClipJob()) {
      pushAppToast({
        text: 'Another clip job is running — one at a time. It is in the jobs tray.',
        tone: 'warning',
      });
      return;
    }
    const { stillUrl, entry } = target;
    close();
    pushAppToast({
      text: 'Moving the still… It takes a few minutes — follow it in the jobs tray.',
      tone: 'info',
      ttlMs: 8000,
    });
    const about = entry.prompt ? ` · ${entry.prompt.slice(0, 120)}` : '';
    try {
      await runClipJob({
        tool: 'motion',
        body: { stillUrl, entryId: entry.id, strokes, prompt: prompt.trim() || undefined },
        keep: {
          kind: 'motion',
          prompt: `Motion brush${about}`,
          tool: entry.tool || 'gallery',
          sourceEntryId: entry.id,
        },
        owner: { feature: 'gallery', ref: entry.id },
        label: `Motion brush${about.slice(0, 63)}`,
      });
    } catch (error) {
      if (error instanceof ClipJobBusyError) pushAppToast({ text: error.message, tone: 'warning' });
    }
  };

  const shown = drawing ? [...strokes, drawing] : strokes;
  return (
    <Dialog
      open
      onClose={close}
      labelledBy="motion-brush-title"
      size="3xl"
      testId="motion-brush-dialog"
      overlayClassName="p-2 sm:p-4"
      backdropClassName="bg-black/80"
      panelClassName="max-h-[96vh] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-primary)] shadow-xl"
      bodyClassName="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="motion-brush-title" className="type-title text-base font-semibold">
            Motion brush
          </h2>
          <p className="type-caption text-[var(--text-muted)]">
            Drag from something to where it goes — a hand to the face, a car down the road. Click to
            pin what should stay put.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={close} data-testid="motion-brush-close">
          Close
        </Button>
      </div>
      <div
        ref={box}
        className="relative mx-auto w-fit touch-none select-none"
        data-testid="motion-brush-canvas"
        onPointerDown={event => {
          if (full) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrawing([at(event)]);
        }}
        onPointerMove={event => {
          if (!drawing) return;
          const point = at(event);
          const last = drawing[drawing.length - 1]!;
          if (Math.hypot(point.x - last.x, point.y - last.y) > 0.004)
            setDrawing([...drawing, point]);
        }}
        onPointerUp={finish}
        onPointerCancel={() => setDrawing(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a Gallery still, drawn over */}
        <img
          src={target.stillUrl}
          alt="The still to move"
          className="block max-h-[60vh] w-auto rounded-[var(--radius-sm)]"
          draggable={false}
        />
        <StrokeOverlay strokes={shown} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="type-caption text-[var(--text-muted)]">
          {strokes.length
            ? `${strokes.filter(stroke => stroke.length > 1).length} path(s), ${strokes.filter(stroke => stroke.length === 1).length} pin(s)`
            : 'Nothing drawn yet'}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={!strokes.length}
          onClick={() => setStrokes(list => list.slice(0, -1))}
          data-testid="motion-brush-undo"
        >
          Undo
        </Button>
        <Button size="sm" variant="ghost" disabled={!strokes.length} onClick={() => setStrokes([])}>
          Clear
        </Button>
      </div>
      <input
        type="text"
        value={prompt}
        maxLength={300}
        placeholder="What happens (optional): she raises the cup to her lips"
        aria-label="What happens"
        className="ui-input"
        onChange={event => setPrompt(event.target.value)}
        data-testid="motion-brush-prompt"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!strokes.some(stroke => stroke.length > 1)}
          onClick={() => void go()}
          data-testid="motion-brush-go"
        >
          Make it move
        </Button>
      </div>
    </Dialog>
  );
}
