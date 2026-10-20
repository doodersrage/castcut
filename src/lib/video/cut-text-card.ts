'use client';

/**
 * A text card for Cut (an added shot): white text on black, drawn in the cut's shape as a PNG —
 * a still to both encodes and the monitor. Long text wraps to five lines.
 */

import { FILM_PRESET_SIZE, type FilmResolutionPreset } from './resolution';

const cache = new Map<string, string>();

function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines.slice(0, 5);
}

/** The card as a PNG data URL, in the size of the cut's resolution preset (720p by default). */
export function renderTextCard(input: {
  text: string;
  sub?: string;
  resolution?: FilmResolutionPreset;
}): string {
  const { width, height } = FILM_PRESET_SIZE[input.resolution ?? '720p'];
  const key = `${input.text}|${input.sub ?? ''}|${width}x${height}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  const size = Math.round(Math.min(width, height) * 0.07);
  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `600 ${size}px sans-serif`;
  const lines = wrap(context, input.text.trim() || ' ', width * 0.8);
  const sub = input.sub?.trim();
  const subSize = Math.round(size * 0.55);
  const block = lines.length * size * 1.25 + (sub ? subSize * 1.8 : 0);
  let y = height / 2 - block / 2 + size * 0.6;
  for (const line of lines) {
    context.fillText(line, width / 2, y);
    y += size * 1.25;
  }
  if (sub) {
    context.globalAlpha = 0.8;
    context.font = `${subSize}px sans-serif`;
    context.fillText(sub, width / 2, y + subSize * 0.4);
  }
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
