/**
 * GIF / animated WebP loop duration — used when stitching motion stills into film.
 * ImageDecoder (Chromium) is preferred at paint time; these parsers are the fallback.
 */

import { looksLikeMotionUrl, looksLikeVideoUrl } from './media-kind';

export type AnimatedImageMime = 'image/gif' | 'image/webp';

const MIN_FRAME_DELAY_MS = 20;
const DEFAULT_FRAME_DELAY_MS = 100;

export function isAnimatedImageShotUrl(url: string): boolean {
  return looksLikeMotionUrl(url) && !looksLikeVideoUrl(url);
}

export function sniffAnimatedImageMime(bytes: Uint8Array, url = ''): AnimatedImageMime | null {
  if (bytes.length >= 6) {
    const header = String.fromCharCode(
      bytes[0] ?? 0,
      bytes[1] ?? 0,
      bytes[2] ?? 0,
      bytes[3] ?? 0,
      bytes[4] ?? 0,
      bytes[5] ?? 0
    );
    if (header === 'GIF87a' || header === 'GIF89a') {
      return 'image/gif';
    }
  }
  if (isRiffWebp(bytes)) {
    return 'image/webp';
  }
  if (/\.gif(\?|#|$)/i.test(url)) {
    return 'image/gif';
  }
  if (/\.webp(\?|#|$)/i.test(url)) {
    return 'image/webp';
  }
  return null;
}

export function readAnimatedImageLoopDurationMs(
  bytes: Uint8Array,
  mime?: AnimatedImageMime | null
): number | null {
  const kind = mime ?? sniffAnimatedImageMime(bytes);
  if (kind === 'image/gif') {
    return readGifLoopDurationMs(bytes);
  }
  if (kind === 'image/webp') {
    return readWebpLoopDurationMs(bytes);
  }
  return null;
}

function isRiffWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function skipSubBlocks(bytes: Uint8Array, offset: number): number {
  let index = offset;
  while (index < bytes.length) {
    const size = bytes[index] ?? 0;
    if (size === 0) {
      return index + 1;
    }
    index += 1 + size;
  }
  return bytes.length;
}

export function readGifLoopDurationMs(bytes: Uint8Array): number | null {
  if (bytes.length < 13) {
    return null;
  }
  const sig = String.fromCharCode(
    bytes[0] ?? 0,
    bytes[1] ?? 0,
    bytes[2] ?? 0,
    bytes[3] ?? 0,
    bytes[4] ?? 0,
    bytes[5] ?? 0
  );
  if (sig !== 'GIF87a' && sig !== 'GIF89a') {
    return null;
  }

  const packed = bytes[10] ?? 0;
  let index = 13;
  if (packed & 0x80) {
    index += 3 * (1 << ((packed & 0x07) + 1));
  }

  let pendingDelayMs: number | undefined;
  let total = 0;
  let frames = 0;

  while (index < bytes.length) {
    const marker = bytes[index];
    if (marker === 0x3b) {
      break;
    }
    if (marker === 0x21) {
      const label = bytes[index + 1];
      if (label === 0xf9 && bytes[index + 2] === 4 && index + 8 <= bytes.length) {
        const delay = (bytes[index + 4] ?? 0) | ((bytes[index + 5] ?? 0) << 8);
        pendingDelayMs = (delay <= 1 ? 10 : delay) * 10;
        index += 8;
        continue;
      }
      index = skipSubBlocks(bytes, index + 2);
      continue;
    }
    if (marker === 0x2c) {
      if (index + 10 > bytes.length) {
        break;
      }
      const imagePacked = bytes[index + 9] ?? 0;
      index += 10;
      if (imagePacked & 0x80) {
        index += 3 * (1 << ((imagePacked & 0x07) + 1));
      }
      index += 1;
      index = skipSubBlocks(bytes, index);
      frames += 1;
      total += pendingDelayMs ?? DEFAULT_FRAME_DELAY_MS;
      pendingDelayMs = undefined;
      continue;
    }
    break;
  }

  return frames > 0 ? total : null;
}

function readU24(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

export function readWebpLoopDurationMs(bytes: Uint8Array): number | null {
  if (!isRiffWebp(bytes)) {
    return null;
  }

  let index = 12;
  let total = 0;
  let frames = 0;

  while (index + 8 <= bytes.length) {
    const fourcc = String.fromCharCode(
      bytes[index] ?? 0,
      bytes[index + 1] ?? 0,
      bytes[index + 2] ?? 0,
      bytes[index + 3] ?? 0
    );
    const size =
      (bytes[index + 4] ?? 0) |
      ((bytes[index + 5] ?? 0) << 8) |
      ((bytes[index + 6] ?? 0) << 16) |
      ((bytes[index + 7] ?? 0) << 24);
    const payload = index + 8;
    if (fourcc === 'ANMF' && payload + 16 <= bytes.length) {
      const duration = readU24(bytes, payload + 12);
      total += Math.max(MIN_FRAME_DELAY_MS, duration === 0 ? DEFAULT_FRAME_DELAY_MS : duration);
      frames += 1;
    }
    const padded = size + (size & 1);
    index = payload + padded;
  }

  return frames > 0 ? total : null;
}
