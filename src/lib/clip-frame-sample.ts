'use client';

/**
 * Browser-side frame sampling for Animate clip checks: decodes the clip in a <video>, grabs
 * small grayscale thumbnails at the start / middle / end, and the last frame as a PNG for the
 * face check. No ComfyUI round trip for decoding — only the face check touches ComfyUI.
 */

import type { FrameLuma } from '@/lib/clip-quality';

const THUMB = 32;

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    video.onerror = () => reject(new Error('Could not decode the clip.'));
    video.currentTime = time;
  });
}

function lumaOf(context: CanvasRenderingContext2D): FrameLuma {
  const { data } = context.getImageData(0, 0, THUMB, THUMB);
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    out.push((0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!) / 255);
  }
  return out;
}

export async function sampleClipFrames(clipUrl: string): Promise<{
  frames: FrameLuma[];
  lastFrame: File | null;
}> {
  const response = await fetch(clipUrl);
  if (!response.ok) {
    throw new Error(`Could not load the clip (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('video/')) {
    // Animated WebP / GIF clips can't be seeked frame by frame here — skip rather than guess.
    return { frames: [], lastFrame: null };
  }
  const objectUrl = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Could not decode the clip.'));
    });
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const times = duration > 0.4 ? [0.05, duration / 2, Math.max(0, duration - 0.08)] : [0];
    const thumb = document.createElement('canvas');
    thumb.width = THUMB;
    thumb.height = THUMB;
    const thumbContext = thumb.getContext('2d', { willReadFrequently: true });
    if (!thumbContext) {
      return { frames: [], lastFrame: null };
    }
    const frames: FrameLuma[] = [];
    for (const time of times) {
      await seek(video, time);
      thumbContext.drawImage(video, 0, 0, THUMB, THUMB);
      frames.push(lumaOf(thumbContext));
    }
    // The video is parked on the last sampled frame: keep it full size for the face check.
    const full = document.createElement('canvas');
    full.width = video.videoWidth;
    full.height = video.videoHeight;
    const fullContext = full.getContext('2d');
    let lastFrame: File | null = null;
    if (fullContext && full.width > 0 && full.height > 0) {
      fullContext.drawImage(video, 0, 0);
      const png = await new Promise<Blob | null>(resolve => full.toBlob(resolve, 'image/png'));
      if (png) {
        lastFrame = new File([png], `clip-last-frame-${Date.now()}.png`, { type: 'image/png' });
      }
    }
    return { frames, lastFrame };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
