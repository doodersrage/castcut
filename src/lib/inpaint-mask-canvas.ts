export type MaskPoint = {
  x: number;
  y: number;
};

export type MaskEditorDimensions = {
  width: number;
  height: number;
  scale: number;
};

const MAX_MASK_EDITOR_DIMENSION = 2048;

export function fitMaskEditorDimensions(
  naturalWidth: number,
  naturalHeight: number,
  maxDimension = MAX_MASK_EDITOR_DIMENSION
): MaskEditorDimensions {
  const safeWidth = Math.max(1, naturalWidth);
  const safeHeight = Math.max(1, naturalHeight);
  const longest = Math.max(safeWidth, safeHeight);
  if (longest <= maxDimension) {
    return { width: safeWidth, height: safeHeight, scale: 1 };
  }
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
    scale,
  };
}

export function createOffscreenCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function clearExportMaskCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
}

export function clearPreviewMaskCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  ctx.clearRect(0, 0, width, height);
}

export function paintMaskStroke(
  ctx: CanvasRenderingContext2D,
  from: MaskPoint | null,
  to: MaskPoint,
  radius: number
): void {
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, radius * 2);
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
}

export function paintMaskStrokeOnLayers(
  exportCtx: CanvasRenderingContext2D,
  previewCtx: CanvasRenderingContext2D,
  from: MaskPoint | null,
  to: MaskPoint,
  radius: number
): void {
  paintMaskStroke(exportCtx, from, to, radius);
  paintMaskStroke(previewCtx, from, to, radius);
}

export function maskCanvasHasContent(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index] > 8 || data[index + 1] > 8 || data[index + 2] > 8) {
      return true;
    }
  }
  return false;
}

export function pointerToCanvasPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): MaskPoint {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

/** Map on-screen brush size (CSS px) to canvas pixel radius. */
export function screenBrushRadiusToCanvas(brushSize: number, canvas: HTMLCanvasElement): number {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || brushSize <= 0) {
    return brushSize;
  }
  const scale = canvas.width / rect.width;
  return Math.max(2, brushSize * scale);
}

export function renderMaskEditorFrame(input: {
  displayCanvas: HTMLCanvasElement;
  exportMaskCanvas: HTMLCanvasElement;
  previewMaskCanvas: HTMLCanvasElement;
  overlayCanvas: HTMLCanvasElement;
  image: CanvasImageSource;
}): void {
  const { displayCanvas, exportMaskCanvas, previewMaskCanvas, overlayCanvas, image } = input;
  const width = displayCanvas.width;
  const height = displayCanvas.height;
  const displayCtx = displayCanvas.getContext('2d');
  const previewCtx = previewMaskCanvas.getContext('2d');
  const overlayCtx = overlayCanvas.getContext('2d');
  if (!displayCtx || !previewCtx || !overlayCtx || width <= 0 || height <= 0) {
    return;
  }

  if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
    overlayCanvas.width = width;
    overlayCanvas.height = height;
  }

  displayCtx.clearRect(0, 0, width, height);
  displayCtx.drawImage(image, 0, 0, width, height);

  overlayCtx.clearRect(0, 0, width, height);
  overlayCtx.drawImage(previewMaskCanvas, 0, 0);
  overlayCtx.globalCompositeOperation = 'source-in';
  overlayCtx.fillStyle = 'rgba(251, 191, 36, 0.72)';
  overlayCtx.fillRect(0, 0, width, height);
  overlayCtx.globalCompositeOperation = 'source-over';

  displayCtx.drawImage(overlayCanvas, 0, 0);
}

export function exportCanvasToPngFile(canvas: HTMLCanvasElement, filename: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Could not export inpaint mask.'));
        return;
      }
      resolve(new File([blob], filename, { type: 'image/png' }));
    }, 'image/png');
  });
}

export async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image for mask editor.'));
    image.src = url;
  });
}
