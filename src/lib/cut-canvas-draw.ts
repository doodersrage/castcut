/**
 * Canvas drawing for a cut, shared by the browser encode (video-assemble.ts) and the Cut preview
 * player (FilmCutPreviewPlayer) so the preview looks like the film: cover-fill / letterbox,
 * the caption box, the title card. Client-safe, no imports beyond the title-card type.
 */

import { TITLE_CARD_SEC, type FilmTitleCard } from './video-polish';

/**
 * Letterbox a shot inside the canvas (black bars), the way the server encode fits a landscape
 * cut (`pad`), with the same slow-zoom factor.
 */
export function drawContain(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  zoom = 1
): void {
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  if (sourceWidth <= 0 || sourceHeight <= 0) return;
  const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight) * zoom;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    source,
    (canvasWidth - drawWidth) / 2,
    (canvasHeight - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
}

export function drawCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  zoom = 1
): void {
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }
  const scale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight) * zoom;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    source,
    (canvasWidth - drawWidth) / 2,
    (canvasHeight - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
}

/** Lower-left caption box, same placement and fade as the server drawtext. */
export function drawCaption(
  context: CanvasRenderingContext2D,
  text: string,
  opacity: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  if (!text || opacity <= 0) return;
  const size = Math.round(Math.min(canvasWidth, canvasHeight) * 0.045);
  const margin = Math.round(Math.min(canvasWidth, canvasHeight) * 0.06);
  const pad = Math.round(size * 0.45);
  context.save();
  context.globalAlpha = opacity;
  context.font = `${size}px sans-serif`;
  const width = context.measureText(text).width;
  const baseline = canvasHeight - Math.round(margin * 1.4);
  context.fillStyle = 'rgba(0, 0, 0, 0.35)';
  context.fillRect(margin - pad, baseline - size - pad * 0.4, width + pad * 2, size + pad * 1.4);
  context.fillStyle = '#fff';
  context.textBaseline = 'alphabetic';
  context.fillText(text, margin, baseline);
  context.restore();
}

/** Centered title + subtitle on black, faded in and out over the card. */
export function drawTitleCard(
  context: CanvasRenderingContext2D,
  card: FilmTitleCard,
  elapsed: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  const fade = Math.min(1, elapsed / 0.5, Math.max(0, (TITLE_CARD_SEC - elapsed) / 0.5));
  const titleSize = Math.round(Math.min(canvasWidth, canvasHeight) * 0.075);
  const subtitleSize = Math.round(titleSize * 0.5);
  context.save();
  context.globalAlpha = Math.max(0, fade);
  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `${titleSize}px sans-serif`;
  const titleY = canvasHeight / 2 - (card.subtitle ? subtitleSize * 0.9 : 0);
  context.fillText(card.title, canvasWidth / 2, titleY);
  if (card.subtitle) {
    context.globalAlpha = Math.max(0, fade) * 0.8;
    context.font = `${subtitleSize}px sans-serif`;
    context.fillText(card.subtitle, canvasWidth / 2, canvasHeight / 2 + subtitleSize * 1.4);
  }
  context.restore();
}
