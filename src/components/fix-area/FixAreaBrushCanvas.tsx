'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { Button } from '@/components/ui/Button';
import { maskBoundsFraction, type FixAreaBox } from '@/lib/fix-area';
import {
  createOffscreenCanvas,
  fitMaskEditorDimensions,
  loadImageElement,
  maskCanvasHasContent,
  pointerToCanvasPoint,
  type MaskPoint,
} from '@/lib/inpaint-mask-canvas';

export type FixAreaBrushExport = {
  /** The painted mask (white = fix, black = keep) as a PNG data URL. */
  dataUrl: string;
  /** The painted pixels' box, as fractions of the picture. */
  box: FixAreaBox | null;
  /** The picture's width / height. */
  aspect: number;
};

export type FixAreaBrushHandle = {
  /** The painted mask, or null when empty. */
  exportMask: () => FixAreaBrushExport | null;
  clear: () => void;
  /** Paint a filled ellipse inside a box given as fractions of the picture (Fix the face). */
  paintBox: (box: FixAreaBox) => void;
  /** Put an exported mask back (a resumed Fix's Paint again starts from its strokes). */
  importMask: (dataUrl: string) => Promise<void>;
};

/** On-screen brush diameters (CSS px). */
export const FIX_AREA_BRUSH_MIN = 6;
export const FIX_AREA_BRUSH_MAX = 160;
const BRUSH_DEFAULT = 36;
const BRUSH_STEP = 6;
const OVERLAY = 'rgb(251, 191, 36)';
const OVERLAY_ALPHA = 0.6;

/**
 * The brush for Fix an area: paint (or erase) over the picture with mouse, pen or touch.
 * The controls are ordinary buttons and a slider; with the canvas focused, [ and ] change the
 * brush size, E switches paint / erase, and Delete clears.
 */
export default function FixAreaBrushCanvas({
  imageUrl,
  onMaskChange,
  ref,
}: {
  imageUrl: string;
  onMaskChange: (hasMask: boolean) => void;
  ref?: Ref<FixAreaBrushHandle>;
}) {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<MaskPoint | null>(null);
  const onMaskChangeRef = useRef(onMaskChange);
  const [mode, setMode] = useState<'paint' | 'erase'>('paint');
  const [size, setSize] = useState(BRUSH_DEFAULT);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMask, setHasMask] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    onMaskChangeRef.current = onMaskChange;
  }, [onMaskChange]);

  const redraw = useCallback(() => {
    const display = displayRef.current;
    const overlay = overlayRef.current;
    const image = imageRef.current;
    const ctx = display?.getContext('2d');
    if (!display || !overlay || !image || !ctx) return;
    ctx.clearRect(0, 0, display.width, display.height);
    ctx.drawImage(image, 0, 0, display.width, display.height);
    ctx.globalAlpha = OVERLAY_ALPHA;
    ctx.drawImage(overlay, 0, 0);
    ctx.globalAlpha = 1;
  }, []);

  const publish = useCallback(() => {
    const mask = maskRef.current;
    const ctx = mask?.getContext('2d', { willReadFrequently: true });
    const painted = Boolean(mask && ctx && maskCanvasHasContent(ctx, mask.width, mask.height));
    setHasMask(painted);
    onMaskChangeRef.current(painted);
  }, []);

  const clear = useCallback(() => {
    const mask = maskRef.current;
    const overlay = overlayRef.current;
    if (!mask || !overlay) return;
    const maskCtx = mask.getContext('2d');
    const overlayCtx = overlay.getContext('2d');
    if (!maskCtx || !overlayCtx) return;
    maskCtx.globalCompositeOperation = 'source-over';
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(0, 0, mask.width, mask.height);
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    redraw();
    publish();
  }, [publish, redraw]);

  const paintBox = useCallback(
    (box: FixAreaBox) => {
      const mask = maskRef.current;
      const overlay = overlayRef.current;
      if (!mask || !overlay) return;
      const maskCtx = mask.getContext('2d');
      const overlayCtx = overlay.getContext('2d');
      if (!maskCtx || !overlayCtx) return;
      const cx = (box.x + box.width / 2) * mask.width;
      const cy = (box.y + box.height / 2) * mask.height;
      const rx = Math.max(1, (box.width / 2) * mask.width);
      const ry = Math.max(1, (box.height / 2) * mask.height);
      for (const [ctx, color] of [
        [maskCtx, '#ffffff'],
        [overlayCtx, OVERLAY],
      ] as const) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      redraw();
      publish();
    },
    [publish, redraw]
  );

  const importMask = useCallback(
    async (dataUrl: string) => {
      const mask = maskRef.current;
      const overlay = overlayRef.current;
      if (!mask || !overlay) return;
      const image = await loadImageElement(dataUrl);
      const maskCtx = mask.getContext('2d');
      const overlayCtx = overlay.getContext('2d');
      if (!maskCtx || !overlayCtx) return;
      maskCtx.globalCompositeOperation = 'lighten';
      maskCtx.drawImage(image, 0, 0, mask.width, mask.height);
      maskCtx.globalCompositeOperation = 'source-over';
      // The overlay tint where the mask is white: tint through the mask's luminance.
      const tint = createOffscreenCanvas(overlay.width, overlay.height);
      const tintCtx = tint.getContext('2d');
      if (tintCtx) {
        tintCtx.drawImage(image, 0, 0, overlay.width, overlay.height);
        tintCtx.globalCompositeOperation = 'multiply';
        tintCtx.fillStyle = OVERLAY;
        tintCtx.fillRect(0, 0, overlay.width, overlay.height);
        tintCtx.globalCompositeOperation = 'destination-in';
        tintCtx.drawImage(image, 0, 0, overlay.width, overlay.height);
        overlayCtx.globalCompositeOperation = 'source-over';
        overlayCtx.drawImage(tint, 0, 0);
      }
      redraw();
      publish();
    },
    [publish, redraw]
  );

  useImperativeHandle(
    ref,
    () => ({
      exportMask: () => {
        const mask = maskRef.current;
        const ctx = mask?.getContext('2d', { willReadFrequently: true });
        if (!mask || !ctx || !maskCanvasHasContent(ctx, mask.width, mask.height)) return null;
        const data = ctx.getImageData(0, 0, mask.width, mask.height).data;
        return {
          dataUrl: mask.toDataURL('image/png'),
          box: maskBoundsFraction(data, { width: mask.width, height: mask.height }, 4),
          aspect: mask.width / mask.height,
        };
      },
      clear,
      paintBox,
      importMask,
    }),
    [clear, importMask, paintBox]
  );

  useLayoutEffect(() => {
    let cancelled = false;
    void loadImageElement(imageUrl)
      .then(image => {
        if (cancelled) return;
        const fitted = fitMaskEditorDimensions(
          image.naturalWidth || image.width,
          image.naturalHeight || image.height
        );
        const display = displayRef.current;
        if (!display) return;
        display.width = fitted.width;
        display.height = fitted.height;
        maskRef.current = createOffscreenCanvas(fitted.width, fitted.height);
        overlayRef.current = createOffscreenCanvas(fitted.width, fitted.height);
        imageRef.current = image;
        const maskCtx = maskRef.current.getContext('2d', { willReadFrequently: true });
        if (maskCtx) {
          maskCtx.fillStyle = '#000000';
          maskCtx.fillRect(0, 0, fitted.width, fitted.height);
        }
        redraw();
        setReady(true);
        setHasMask(false);
        onMaskChangeRef.current(false);
      })
      .catch(err => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load image.');
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, redraw]);

  const stroke = useCallback(
    (from: MaskPoint | null, to: MaskPoint) => {
      const display = displayRef.current;
      const mask = maskRef.current;
      const overlay = overlayRef.current;
      if (!display || !mask || !overlay) return;
      const rect = display.getBoundingClientRect();
      const scale = rect.width > 0 ? display.width / rect.width : 1;
      const radius = Math.max(1, (size / 2) * scale);
      const erase = mode === 'erase';
      const draw = (ctx: CanvasRenderingContext2D, color: string, op: GlobalCompositeOperation) => {
        ctx.globalCompositeOperation = op;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = radius * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (from) {
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(to.x, to.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      };
      const maskCtx = mask.getContext('2d');
      const overlayCtx = overlay.getContext('2d');
      if (!maskCtx || !overlayCtx) return;
      draw(maskCtx, erase ? '#000000' : '#ffffff', 'source-over');
      draw(overlayCtx, OVERLAY, erase ? 'destination-out' : 'source-over');
      redraw();
    },
    [mode, redraw, size]
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!ready || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const canvas = displayRef.current;
    if (!canvas) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    const point = pointerToCanvasPoint(canvas, event.clientX, event.clientY);
    stroke(null, point);
    lastRef.current = point;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = displayRef.current;
    if (!canvas) return;
    const box = canvas.parentElement?.getBoundingClientRect();
    if (box) setCursor({ x: event.clientX - box.left, y: event.clientY - box.top });
    if (!drawingRef.current) return;
    event.preventDefault();
    const point = pointerToCanvasPoint(canvas, event.clientX, event.clientY);
    stroke(lastRef.current, point);
    lastRef.current = point;
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    publish();
  };

  const changeSize = (delta: number) =>
    setSize(value => Math.min(FIX_AREA_BRUSH_MAX, Math.max(FIX_AREA_BRUSH_MIN, value + delta)));

  const onCanvasKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === '[') {
      event.preventDefault();
      changeSize(-BRUSH_STEP);
    } else if (event.key === ']') {
      event.preventDefault();
      changeSize(BRUSH_STEP);
    } else if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
      setMode(value => (value === 'erase' ? 'paint' : 'erase'));
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      clear();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-wrap items-center gap-2"
        role="toolbar"
        aria-label="Brush"
        data-testid="fix-area-toolbar"
      >
        <div className="flex gap-1" role="group" aria-label="Brush mode">
          <Button
            size="sm"
            variant={mode === 'paint' ? 'primary' : 'secondary'}
            aria-pressed={mode === 'paint'}
            onClick={() => setMode('paint')}
            data-autofocus
            data-testid="fix-area-paint"
          >
            Paint
          </Button>
          <Button
            size="sm"
            variant={mode === 'erase' ? 'primary' : 'secondary'}
            aria-pressed={mode === 'erase'}
            onClick={() => setMode('erase')}
            data-testid="fix-area-erase"
          >
            Erase
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span>Brush</span>
          <input
            type="range"
            min={FIX_AREA_BRUSH_MIN}
            max={FIX_AREA_BRUSH_MAX}
            step={2}
            value={size}
            onChange={event => setSize(Number(event.target.value))}
            aria-label="Brush size"
            aria-valuetext={`${size} pixels`}
            className="w-28 sm:w-40"
            data-testid="fix-area-brush-size"
          />
          <span className="type-caption w-12 tabular-nums text-[var(--text-muted)]">{size}px</span>
        </label>
        <Button
          size="sm"
          variant="ghost"
          onClick={clear}
          disabled={!hasMask}
          data-testid="fix-area-clear"
        >
          Clear
        </Button>
      </div>
      <div className="relative flex justify-center overflow-hidden rounded-md bg-black/40">
        <canvas
          ref={displayRef}
          tabIndex={0}
          role="img"
          aria-label={`Picture to fix — ${mode === 'erase' ? 'erasing' : 'painting'} with a ${size} px brush. Keys: [ and ] brush size, E paint or erase, Delete clears.`}
          className="block max-h-[58vh] max-w-full touch-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          style={{ cursor: 'none', width: 'auto', height: 'auto' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={() => {
            setCursor(null);
            endStroke();
          }}
          onKeyDown={onCanvasKeyDown}
          data-testid="fix-area-canvas"
        />
        {cursor ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full border-2 border-white mix-blend-difference"
            style={{
              width: size,
              height: size,
              left: cursor.x - size / 2,
              top: cursor.y - size / 2,
            }}
          />
        ) : null}
        {!ready && !loadError ? (
          <p className="type-caption absolute inset-0 flex items-center justify-center text-white/80">
            Loading the picture…
          </p>
        ) : null}
      </div>
      {loadError ? (
        <p className="type-caption text-[var(--tint-warning-text)]" role="alert">
          {loadError}
        </p>
      ) : null}
    </div>
  );
}
