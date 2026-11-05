'use client';

/**
 * Frames along a clip for the Cut's timeline (2026-11-05): a clip block showed one picture; an
 * editor shows several across it. Read in the browser from the clip itself (one hidden video,
 * seeked frame by frame), small JPEGs, kept per clip and time for the visit.
 */

const cache = new Map<string, Promise<string[]>>();
/** Height the frames are drawn at (the timeline's shot row is ~88 px). */
const FRAME_HEIGHT = 88;

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise(resolve => {
    const done = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    video.addEventListener('error', done);
    video.currentTime = t;
    // A seek that never lands (a broken file) gives up after a second.
    window.setTimeout(done, 1500);
  });
}

/** JPEG data URLs of the clip at each time (seconds in the file); [] when it can't be read. */
export function clipFrames(url: string, times: readonly number[]): Promise<string[]> {
  const key = `${url}|${times.map(t => t.toFixed(2)).join(',')}`;
  const known = cache.get(key);
  if (known) return known;
  const job = (async () => {
    if (typeof document === 'undefined' || !times.length) return [];
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('clip unreadable')), { once: true });
    });
    const width = Math.max(
      1,
      Math.round((video.videoWidth / Math.max(1, video.videoHeight)) * FRAME_HEIGHT)
    );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = FRAME_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return [];
    const out: string[] = [];
    for (const t of times) {
      await seekTo(video, Math.min(Math.max(0, t), Math.max(0, (video.duration || t) - 0.05)));
      context.drawImage(video, 0, 0, width, FRAME_HEIGHT);
      out.push(canvas.toDataURL('image/jpeg', 0.7));
    }
    video.removeAttribute('src');
    video.load();
    return out;
  })().catch(() => {
    cache.delete(key);
    return [] as string[];
  });
  cache.set(key, job);
  return job;
}
