'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError, TextInput } from '@/components/ui/Field';
import SideSheet from '@/components/ui/SideSheet';
import { requestSketch } from '@/lib/media-actions-client';

const COLOURS = ['#e11d48', '#f59e0b', '#16a34a', '#2563eb', '#7c3aed', '#111827', '#f8fafc'];
const LONG_SIDE = 1024;
/** Quiet time after the last stroke before it renders again. */
const SETTLE_MS = 1500;

/**
 * Sketch over a still (or a blank page): rough strokes and a few words, re-rendered as a photo
 * each time drawing pauses (sketch.ts). "Use this" hands the picture back.
 */
export default function SketchSheet({
  open,
  stillUrl,
  onClose,
  onUse,
  testId = 'sketch-sheet',
}: {
  open: boolean;
  /** The still drawn over; null starts on a blank page. */
  stillUrl: string | null;
  onClose: () => void;
  onUse: (url: string) => void;
  testId?: string;
}) {
  if (!open) return null;
  return <SketchSheetOpen stillUrl={stillUrl} onClose={onClose} onUse={onUse} testId={testId} />;
}

function SketchSheetOpen({
  stillUrl,
  onClose,
  onUse,
  testId,
}: {
  stillUrl: string | null;
  onClose: () => void;
  onUse: (url: string) => void;
  testId: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundRef = useRef<HTMLImageElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const rendering = useRef(false);
  const timer = useRef<number | null>(null);
  const [colour, setColour] = useState(COLOURS[0]!);
  const [size, setSize] = useState(18);
  const [words, setWords] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A blank page is ready at once; a still once it has loaded.
  const [ready, setReady] = useState(!stillUrl);

  const paintBackground = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const image = backgroundRef.current;
    if (image) context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!stillUrl) {
      canvas.width = 768;
      canvas.height = 1024;
      paintBackground();
      return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      // A picture with no size of its own (an SVG) gets a portrait page.
      const naturalWidth = image.naturalWidth || 768;
      const naturalHeight = image.naturalHeight || 1024;
      const scale = LONG_SIDE / Math.max(naturalWidth, naturalHeight, 1);
      canvas.width = Math.round(naturalWidth * Math.min(1, scale));
      canvas.height = Math.round(naturalHeight * Math.min(1, scale));
      backgroundRef.current = image;
      paintBackground();
      setReady(true);
    };
    image.onerror = () => setError('The still could not be loaded — draw on a blank page instead.');
    image.src = stillUrl;
  }, [paintBackground, stillUrl]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  const render = async (): Promise<void> => {
    const canvas = canvasRef.current;
    if (!canvas || rendering.current) return;
    rendering.current = true;
    dirty.current = false;
    setBusy(true);
    setError(null);
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('The drawing could not be read.');
      setResult(await requestSketch({ image: blob, words, overStill: Boolean(stillUrl) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sketch failed.');
    } finally {
      rendering.current = false;
      setBusy(false);
      // Strokes drawn while it rendered: go again.
      if (dirty.current) void render();
    }
  };

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const box = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * canvas.width,
      y: ((event.clientY - box.top) / box.height) * canvas.height,
    };
  };

  const stroke = (event: React.PointerEvent<HTMLCanvasElement>, start: boolean) => {
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const { x, y } = point(event);
    context.strokeStyle = colour;
    context.fillStyle = colour;
    context.lineWidth = size;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    if (start) {
      context.beginPath();
      context.moveTo(x, y);
      context.arc(x, y, size / 2, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
      context.stroke();
    }
  };

  const settle = () => {
    dirty.current = true;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!rendering.current) void render();
    }, SETTLE_MS);
  };

  return (
    <SideSheet
      open
      onClose={onClose}
      title="Sketch"
      description="Draw rough shapes and colours, say what they are — it re-renders each time you pause. Use this keeps the picture; the original stays in the Gallery."
      testId={testId}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={!result || busy}
            data-testid={`${testId}-use`}
            onClick={() => {
              if (result) onUse(result);
              onClose();
            }}
          >
            Use this
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!ready || busy}
            loading={busy}
            loadingLabel="Rendering"
            data-testid={`${testId}-render`}
            onClick={() => void render()}
          >
            Render now
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="type-label">What you are drawing</span>
          <TextInput
            value={words}
            maxLength={300}
            placeholder="a red umbrella in her right hand; a cat on the sofa"
            onChange={event => setWords(event.target.value)}
            data-testid={`${testId}-words`}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Brush">
          {COLOURS.map(option => (
            <button
              key={option}
              type="button"
              aria-label={`Colour ${option}`}
              aria-pressed={colour === option}
              className="h-7 w-7 rounded-full border-2"
              style={{
                background: option,
                borderColor: colour === option ? 'var(--accent)' : 'var(--border-default)',
              }}
              onClick={() => setColour(option)}
            />
          ))}
          <label className="type-caption flex items-center gap-1 text-[var(--text-secondary)]">
            Size
            <input
              type="range"
              min={4}
              max={60}
              value={size}
              onChange={event => setSize(Number(event.target.value))}
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              paintBackground();
              setResult(null);
            }}
          >
            Clear
          </Button>
        </div>
        <canvas
          ref={canvasRef}
          className="w-full touch-none rounded-lg border border-[var(--border-default)] bg-white"
          data-testid={`${testId}-canvas`}
          data-ready={ready ? 'true' : 'false'}
          onPointerDown={event => {
            if (!ready) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drawing.current = true;
            stroke(event, true);
          }}
          onPointerMove={event => {
            if (drawing.current) stroke(event, false);
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
            drawing.current = false;
            settle();
          }}
        />
        {busy ? (
          <p className="type-caption text-[var(--text-muted)]" role="status">
            Rendering… (under a minute)
          </p>
        ) : null}
        {result ? (
          // eslint-disable-next-line @next/next/no-img-element -- a ComfyUI output
          <img
            src={result}
            alt="The sketch rendered"
            className="w-full rounded-lg"
            data-testid={`${testId}-result`}
          />
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </SideSheet>
  );
}
