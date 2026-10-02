'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ChipButton, FieldLabel } from '@/components/ui/Field';
import {
  clearExportMaskCanvas,
  clearPreviewMaskCanvas,
  createOffscreenCanvas,
  exportCanvasToPngFile,
  fitMaskEditorDimensions,
  loadImageElement,
  maskCanvasHasContent,
  paintMaskStrokeOnLayers,
  pointerToCanvasPoint,
  renderMaskEditorFrame,
  screenBrushRadiusToCanvas,
} from '@/lib/inpaint-mask-canvas';

type InpaintMaskMode = 'draw' | 'upload';

type InpaintMaskEditorProps = {
  sourceImageUrl: string;
  onMaskChange: (file: File | null, previewUrl: string | null) => void;
};

const BRUSH_SIZES = [12, 24, 48, 96] as const;

export default function InpaintMaskEditor({
  sourceImageUrl,
  onMaskChange,
}: InpaintMaskEditorProps) {
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const exportMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const onMaskChangeRef = useRef(onMaskChange);

  const [mode, setMode] = useState<InpaintMaskMode>('draw');
  const [brushSize, setBrushSize] = useState<number>(24);
  const [ready, setReady] = useState(false);
  const [hasMask, setHasMask] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onMaskChangeRef.current = onMaskChange;
  }, [onMaskChange]);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const redrawDisplay = useCallback(() => {
    const displayCanvas = displayCanvasRef.current;
    const exportMaskCanvas = exportMaskCanvasRef.current;
    const previewMaskCanvas = previewMaskCanvasRef.current;
    const image = imageRef.current;
    if (!displayCanvas || !exportMaskCanvas || !previewMaskCanvas || !image) {
      return;
    }

    if (!overlayCanvasRef.current) {
      overlayCanvasRef.current = createOffscreenCanvas(displayCanvas.width, displayCanvas.height);
    }

    renderMaskEditorFrame({
      displayCanvas,
      exportMaskCanvas,
      previewMaskCanvas,
      overlayCanvas: overlayCanvasRef.current,
      image,
    });
  }, []);

  const publishMask = useCallback(
    async (exportMaskCanvas: HTMLCanvasElement) => {
      const ctx = exportMaskCanvas.getContext('2d');
      if (!ctx || !maskCanvasHasContent(ctx, exportMaskCanvas.width, exportMaskCanvas.height)) {
        revokePreviewUrl();
        onMaskChangeRef.current(null, null);
        setHasMask(false);
        return;
      }

      try {
        const file = await exportCanvasToPngFile(
          exportMaskCanvas,
          `prompt-studio-inpaint-mask-${Date.now()}.png`
        );
        revokePreviewUrl();
        const previewUrl = URL.createObjectURL(file);
        previewUrlRef.current = previewUrl;
        onMaskChangeRef.current(file, previewUrl);
        setHasMask(true);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Could not export mask.');
      }
    },
    [revokePreviewUrl]
  );

  useLayoutEffect(() => {
    let cancelled = false;

    async function init() {
      setReady(false);
      setLoadError(null);
      revokePreviewUrl();
      onMaskChangeRef.current(null, null);
      setHasMask(false);
      drawingRef.current = false;
      lastPointRef.current = null;

      try {
        const image = await loadImageElement(sourceImageUrl);
        if (cancelled) {
          return;
        }

        const fitted = fitMaskEditorDimensions(
          image.naturalWidth || image.width,
          image.naturalHeight || image.height
        );

        const displayCanvas = displayCanvasRef.current;
        if (!displayCanvas) {
          throw new Error('Could not initialize mask editor canvas.');
        }

        displayCanvas.width = fitted.width;
        displayCanvas.height = fitted.height;

        exportMaskCanvasRef.current = createOffscreenCanvas(fitted.width, fitted.height);
        previewMaskCanvasRef.current = createOffscreenCanvas(fitted.width, fitted.height);
        overlayCanvasRef.current = createOffscreenCanvas(fitted.width, fitted.height);
        imageRef.current = image;

        const exportCtx = exportMaskCanvasRef.current.getContext('2d');
        const previewCtx = previewMaskCanvasRef.current.getContext('2d');
        if (!exportCtx || !previewCtx) {
          throw new Error('Could not initialize mask layers.');
        }

        clearExportMaskCanvas(exportCtx, fitted.width, fitted.height);
        clearPreviewMaskCanvas(previewCtx, fitted.width, fitted.height);
        redrawDisplay();
        if (!cancelled) {
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load image.');
          setReady(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      revokePreviewUrl();
    };
  }, [redrawDisplay, revokePreviewUrl, sourceImageUrl]);

  const paintAtPointer = useCallback(
    (canvas: HTMLCanvasElement, clientX: number, clientY: number, isNewStroke: boolean) => {
      const exportMaskCanvas = exportMaskCanvasRef.current;
      const previewMaskCanvas = previewMaskCanvasRef.current;
      if (!exportMaskCanvas || !previewMaskCanvas) {
        return;
      }

      const exportCtx = exportMaskCanvas.getContext('2d');
      const previewCtx = previewMaskCanvas.getContext('2d');
      if (!exportCtx || !previewCtx) {
        return;
      }

      const point = pointerToCanvasPoint(canvas, clientX, clientY);
      const radius = screenBrushRadiusToCanvas(brushSize, canvas);
      const from = isNewStroke ? null : lastPointRef.current;
      paintMaskStrokeOnLayers(exportCtx, previewCtx, from, point, radius);
      lastPointRef.current = point;
      redrawDisplay();
    },
    [brushSize, redrawDisplay]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (mode !== 'draw' || !ready) {
        return;
      }
      const canvas = displayCanvasRef.current;
      if (!canvas) {
        return;
      }

      drawingRef.current = true;
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      paintAtPointer(canvas, event.clientX, event.clientY, true);
    },
    [mode, paintAtPointer, ready]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || mode !== 'draw') {
        return;
      }
      const canvas = displayCanvasRef.current;
      if (!canvas) {
        return;
      }
      event.preventDefault();
      paintAtPointer(canvas, event.clientX, event.clientY, false);
    },
    [mode, paintAtPointer]
  );

  const finishStroke = useCallback(() => {
    if (!drawingRef.current) {
      return;
    }
    drawingRef.current = false;
    lastPointRef.current = null;
    const exportMaskCanvas = exportMaskCanvasRef.current;
    if (exportMaskCanvas) {
      void publishMask(exportMaskCanvas);
    }
  }, [publishMask]);

  const clearMask = useCallback(() => {
    const exportMaskCanvas = exportMaskCanvasRef.current;
    const previewMaskCanvas = previewMaskCanvasRef.current;
    if (!exportMaskCanvas || !previewMaskCanvas) {
      return;
    }
    const exportCtx = exportMaskCanvas.getContext('2d');
    const previewCtx = previewMaskCanvas.getContext('2d');
    if (!exportCtx || !previewCtx) {
      return;
    }
    clearExportMaskCanvas(exportCtx, exportMaskCanvas.width, exportMaskCanvas.height);
    clearPreviewMaskCanvas(previewCtx, previewMaskCanvas.width, previewMaskCanvas.height);
    redrawDisplay();
    revokePreviewUrl();
    onMaskChangeRef.current(null, null);
    setHasMask(false);
  }, [redrawDisplay, revokePreviewUrl]);

  const onUploadChange = useCallback(
    (file: File | null) => {
      revokePreviewUrl();
      if (!file) {
        onMaskChangeRef.current(null, null);
        setHasMask(false);
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      previewUrlRef.current = previewUrl;
      onMaskChangeRef.current(file, previewUrl);
      setHasMask(true);
    },
    [revokePreviewUrl]
  );

  return (
    <div className="space-y-3">
      <FieldLabel hint="Paint amber highlights on the region to repaint, or upload a mask file.">
        Inpaint mask
      </FieldLabel>

      <div className="flex flex-wrap gap-1.5">
        <ChipButton active={mode === 'draw'} onClick={() => setMode('draw')}>
          Draw mask
        </ChipButton>
        <ChipButton active={mode === 'upload'} onClick={() => setMode('upload')}>
          Upload mask
        </ChipButton>
      </div>

      {mode === 'draw' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-caption text-[var(--text-muted)]">Brush (on screen)</span>
            {BRUSH_SIZES.map(size => (
              <ChipButton key={size} active={brushSize === size} onClick={() => setBrushSize(size)}>
                {size}px
              </ChipButton>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={clearMask} disabled={!hasMask}>
              Clear
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--tint-warning-border)] bg-[var(--bg-base)]/80">
            <canvas
              ref={displayCanvasRef}
              className="block h-auto max-h-80 w-full touch-none cursor-crosshair focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              style={{ width: '100%', height: 'auto', maxHeight: '20rem' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishStroke}
              onPointerLeave={finishStroke}
              onPointerCancel={finishStroke}
              aria-label="Draw inpaint mask over reference image"
            />
          </div>

          {!ready && !loadError ? (
            <p className="type-caption text-[var(--text-muted)]">Loading mask editor…</p>
          ) : null}
          {loadError ? (
            <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200/90">
              {loadError}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="file"
            accept="image/*"
            onChange={event => onUploadChange(event.target.files?.[0] ?? null)}
            className="ui-file-input block w-full"
          />
        </div>
      )}

      {hasMask ? (
        <p className="rounded-xl border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-3 py-2 text-xs text-[var(--tint-success-text)]">
          Mask ready — the white regions are what gets repainted.
        </p>
      ) : (
        <p className="rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2.5 text-xs text-[var(--tint-warning-text)]">
          Draw or upload a mask before you Queue.
        </p>
      )}
    </div>
  );
}
