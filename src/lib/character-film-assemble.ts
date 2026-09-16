/**
 * Browser-side film assemble: paint the cut onto a canvas, record it, stamp the gallery.
 */

import { addComfyGalleryEntry } from './comfyui-gallery';
import { loadComfyUiSettings } from './comfyui-settings';
import {
  canStampAssembledFilm,
  DEFAULT_STILL_HOLD_SEC,
  filmDownloadFilename,
  type FilmPlaylistShot,
} from './character-film';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { persistGalleryOriginal } from './gallery-media-client';
import { galleryStitchShots, MIN_GALLERY_STITCH_CLIPS } from './gallery-video-stitch';
import {
  isAnimatedImageShotUrl,
  readAnimatedImageLoopDurationMs,
  sniffAnimatedImageMime,
} from './animated-image-timeline';

const MAX_EDGE = 1280;
const FRAME_RATE = 30;
const VIDEO_BITS_PER_SECOND = 3_000_000;

export type AssembleFilmProgress = {
  ratio: number;
  label: string;
};

export type AssembleFilmOptions = {
  onProgress?: (progress: AssembleFilmProgress) => void;
  /** Prefer server ffmpeg when available (default true). */
  preferServer?: boolean;
  resolution?: '720p' | '1080p';
  crossfadeSec?: number;
  audioBedUrl?: string;
};

export type AssembledFilmResult = {
  blob: Blob;
  mimeType: string;
  extension: string;
  encodePath: 'server' | 'browser';
};

function even(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function fitSize(width: number, height: number): { width: number; height: number } {
  const w = width > 0 ? width : 1024;
  const h = height > 0 ? height : 1024;
  const edge = Math.max(w, h);
  if (edge <= MAX_EDGE) {
    return { width: even(w), height: even(h) };
  }
  const scale = MAX_EDGE / edge;
  return { width: even(w * scale), height: even(h * scale) };
}

function pickRecorderMime(): { mimeType: string; extension: string } {
  const candidates = [
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
    { mimeType: 'video/mp4', extension: 'mp4' },
  ];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }
  return { mimeType: '', extension: 'webm' };
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

function isSameOriginUrl(url: string): boolean {
  if (typeof window === 'undefined') {
    return url.startsWith('/');
  }
  if (url.startsWith('/')) {
    return true;
  }
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

async function resolvePlayableUrl(url: string): Promise<{ src: string; revoke?: () => void }> {
  if (!isSameOriginUrl(url) && !url.startsWith('blob:') && !url.startsWith('data:')) {
    return { src: url };
  }
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return { src: url };
  }
  // Same-origin: fetch with cookies (crossOrigin=anonymous would omit them and break auth).
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'image/*,video/*,*/*' },
  });
  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Could not load that clip (sign-in required).'
        : `Could not load that clip (HTTP ${response.status}).`
    );
  }
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error('Could not load that clip (empty file).');
  }
  const objectUrl = URL.createObjectURL(blob);
  return {
    src: objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl),
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!isSameOriginUrl(url) && !url.startsWith('blob:') && !url.startsWith('data:')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load that still.'));
    image.src = url;
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    if (!isSameOriginUrl(url) && !url.startsWith('blob:') && !url.startsWith('data:')) {
      video.crossOrigin = 'anonymous';
    }
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error('Could not load that clip.'));
    video.src = url;
  });
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }
  const scale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
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

async function paintFor(
  context: CanvasRenderingContext2D,
  draw: () => void,
  durationSec: number
): Promise<void> {
  const until = performance.now() + durationSec * 1000;
  const tick = () =>
    new Promise<void>(resolve => {
      const step = () => {
        draw();
        if (performance.now() >= until) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  await tick();
}

async function loadShotBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Could not load that clip.');
  }
  return response.arrayBuffer();
}

type ImageDecoderLike = {
  tracks: {
    ready: Promise<void>;
    selectedTrack: { frameCount: number } | null;
  };
  decode: (options: { frameIndex: number }) => Promise<{ image: VideoFrame }>;
  close: () => void;
};

function imageDecoderCtor():
  (new (init: { data: BufferSource; type: string }) => ImageDecoderLike) | undefined {
  return (
    globalThis as {
      ImageDecoder?: new (init: { data: BufferSource; type: string }) => ImageDecoderLike;
    }
  ).ImageDecoder;
}

async function paintAnimatedImage(
  context: CanvasRenderingContext2D,
  url: string,
  canvasWidth: number,
  canvasHeight: number,
  holdSec?: number
): Promise<void> {
  const fallbackHold = holdSec && holdSec > 0 ? holdSec : DEFAULT_STILL_HOLD_SEC;
  let buffer: ArrayBuffer | null = null;
  try {
    buffer = await loadShotBytes(url);
  } catch {
    buffer = null;
  }
  const bytes = buffer ? new Uint8Array(buffer) : null;

  const Decoder = imageDecoderCtor();
  const mime = bytes ? sniffAnimatedImageMime(bytes, url) : null;
  if (Decoder && buffer && mime) {
    try {
      const decoder = new Decoder({ data: buffer, type: mime });
      await decoder.tracks.ready;
      const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 0;
      if (frameCount >= 1) {
        for (let index = 0; index < frameCount; index += 1) {
          const { image } = await decoder.decode({ frameIndex: index });
          const delaySec = Math.max(1 / FRAME_RATE, (image.duration ?? 40_000) / 1_000_000);
          await paintFor(
            context,
            () =>
              drawCover(
                context,
                image,
                image.displayWidth,
                image.displayHeight,
                canvasWidth,
                canvasHeight
              ),
            delaySec
          );
          image.close();
        }
        decoder.close();
        if (frameCount === 1) {
          await wait(Math.max(0, fallbackHold * 1000 - 1000 / FRAME_RATE));
        }
        return;
      }
      decoder.close();
    } catch {
      // Fall through to <img> playback.
    }
  }

  const image = await loadImage(url);
  const parsedMs = bytes ? readAnimatedImageLoopDurationMs(bytes, mime) : null;
  const durationSec = parsedMs && parsedMs > 0 ? parsedMs / 1000 : fallbackHold;
  await paintFor(
    context,
    () =>
      drawCover(context, image, image.naturalWidth, image.naturalHeight, canvasWidth, canvasHeight),
    durationSec
  );
}

async function probeSize(shots: FilmPlaylistShot[]): Promise<{ width: number; height: number }> {
  for (const shot of shots) {
    try {
      if (shot.kind === 'clip' && !isAnimatedImageShotUrl(shot.url)) {
        const video = await loadVideo(shot.url);
        const size = fitSize(video.videoWidth, video.videoHeight);
        video.removeAttribute('src');
        video.load();
        return size;
      }
      const image = await loadImage(shot.url);
      return fitSize(image.naturalWidth, image.naturalHeight);
    } catch {
      // Try the next shot for a usable frame size.
    }
  }
  return { width: 1024, height: 1024 };
}

async function assembleFilmBlobOnServer(
  shots: FilmPlaylistShot[],
  options?: AssembleFilmOptions
): Promise<AssembledFilmResult | null> {
  if (typeof window === 'undefined' || options?.preferServer === false) {
    return null;
  }
  try {
    const availableRes = await fetch('/api/film/assemble', { method: 'GET' });
    if (!availableRes.ok) {
      return null;
    }
    const availableJson = (await availableRes.json()) as { available?: boolean };
    if (!availableJson.available) {
      return null;
    }

    options?.onProgress?.({ ratio: 0.04, label: 'Starting server encode…' });
    const startRes = await fetch('/api/film/assemble', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        shots,
        resolution: options?.resolution ?? '720p',
        crossfadeSec: options?.crossfadeSec ?? 0,
        audioBedUrl: options?.audioBedUrl,
      }),
    });
    if (!startRes.ok) {
      const errBody = (await startRes.json().catch(() => null)) as { error?: string } | null;
      throw new Error(
        errBody?.error || `Server film encode unavailable (HTTP ${startRes.status}).`
      );
    }
    const startJson = (await startRes.json()) as { job?: { id?: string } };
    const jobId = startJson.job?.id?.trim();
    if (!jobId) {
      throw new Error('Server film encode did not return a job id.');
    }

    for (let attempt = 0; attempt < 600; attempt += 1) {
      await wait(500);
      const statusRes = await fetch(`/api/film/assemble?jobId=${encodeURIComponent(jobId)}`, {
        credentials: 'same-origin',
      });
      if (!statusRes.ok) {
        throw new Error(`Server film status failed (HTTP ${statusRes.status}).`);
      }
      const statusJson = (await statusRes.json()) as {
        job?: { status?: string; ratio?: number; label?: string; error?: string };
      };
      const job = statusJson.job;
      if (!job) {
        throw new Error('Server film job disappeared.');
      }
      options?.onProgress?.({
        ratio: typeof job.ratio === 'number' ? Math.min(0.98, Math.max(0.05, job.ratio)) : 0.2,
        label: job.label || 'Encoding on server…',
      });
      if (job.status === 'error') {
        throw new Error(job.error || 'Server film encode failed.');
      }
      if (job.status === 'completed') {
        const downloadRes = await fetch(
          `/api/film/assemble?jobId=${encodeURIComponent(jobId)}&download=1`,
          { credentials: 'same-origin' }
        );
        if (!downloadRes.ok) {
          throw new Error(`Server film download failed (HTTP ${downloadRes.status}).`);
        }
        const blob = await downloadRes.blob();
        if (blob.size === 0) {
          throw new Error('Server film encode produced an empty file.');
        }
        options?.onProgress?.({ ratio: 1, label: 'Server MP4 ready' });
        return {
          blob,
          mimeType: blob.type || 'video/mp4',
          extension: 'mp4',
          encodePath: 'server',
        };
      }
    }
    throw new Error('Server film encode timed out.');
  } catch (error) {
    // Prefer browser MediaRecorder whenever server assemble fails or is unavailable.
    if (typeof document !== 'undefined' && typeof MediaRecorder !== 'undefined') {
      return null;
    }
    throw error instanceof Error ? error : new Error('Server film encode failed.');
  }
}

export async function assembleFilmBlob(
  shots: FilmPlaylistShot[],
  options?: AssembleFilmOptions
): Promise<AssembledFilmResult> {
  if (shots.length === 0) {
    throw new Error('Include at least one shot in the cut.');
  }

  const server = await assembleFilmBlobOnServer(shots, options);
  if (server) {
    return server;
  }

  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
    throw new Error('Assemble needs a browser that can record canvas video (or server ffmpeg).');
  }

  options?.onProgress?.({ ratio: 0.02, label: 'Checking shots…' });
  const resolvedShots: Array<{ shot: FilmPlaylistShot; src: string; revoke?: () => void }> = [];
  try {
    for (const shot of shots) {
      try {
        const resolved = await resolvePlayableUrl(shot.url);
        if (shot.kind === 'clip' && !isAnimatedImageShotUrl(shot.url)) {
          const video = await loadVideo(resolved.src);
          video.removeAttribute('src');
          video.load();
        } else {
          await loadImage(resolved.src);
        }
        resolvedShots.push({ shot, ...resolved });
      } catch (error) {
        for (const entry of resolvedShots) {
          entry.revoke?.();
        }
        throw new Error(
          error instanceof Error && /sign-in|HTTP|empty file/i.test(error.message)
            ? error.message
            : shot.kind === 'clip'
              ? 'Could not load that clip (CORS or a missing file). Same-origin / proxied URLs work; remote hosts must allow canvas.'
              : 'Could not load that still (CORS or a missing file).'
        );
      }
    }

    const { width, height } = await probeSize(
      resolvedShots.map(entry => ({ ...entry.shot, url: entry.src }))
    );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.position = 'fixed';
    canvas.style.left = '-9999px';
    canvas.style.top = '0';
    document.body.appendChild(canvas);

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      canvas.remove();
      throw new Error('Could not open a drawing surface.');
    }
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    const stream = canvas.captureStream(FRAME_RATE);
    const picked = pickRecorderMime();
    const recorder = picked.mimeType
      ? new MediaRecorder(stream, {
          mimeType: picked.mimeType,
          videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        })
      : new MediaRecorder(stream, { videoBitsPerSecond: VIDEO_BITS_PER_SECOND });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = event => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error('The browser stopped recording the film.'));
    });

    recorder.start(250);
    await wait(80);

    try {
      for (const [index, entry] of resolvedShots.entries()) {
        const shot = entry.shot;
        const src = entry.src;
        options?.onProgress?.({
          ratio: index / resolvedShots.length,
          label: `Recording ${index + 1} of ${resolvedShots.length} · ${shot.title}`,
        });
        if (shot.kind === 'still') {
          const image = await loadImage(src);
          await paintFor(
            context,
            () => drawCover(context, image, image.naturalWidth, image.naturalHeight, width, height),
            shot.holdSec && shot.holdSec > 0 ? shot.holdSec : DEFAULT_STILL_HOLD_SEC
          );
          continue;
        }
        if (isAnimatedImageShotUrl(shot.url) || isAnimatedImageShotUrl(src)) {
          await paintAnimatedImage(context, src, width, height, shot.holdSec);
          continue;
        }
        const video = await loadVideo(src);
        video.currentTime = 0;
        const played = await video.play().then(
          () => true,
          () => false
        );
        if (played) {
          await new Promise<void>((resolve, reject) => {
            const draw = () => {
              drawCover(context, video, video.videoWidth, video.videoHeight, width, height);
              if (video.ended) {
                resolve();
                return;
              }
              requestAnimationFrame(draw);
            };
            video.onended = () => resolve();
            video.onerror = () => reject(new Error(`Could not play ${shot.title}.`));
            requestAnimationFrame(draw);
          });
        } else {
          const duration = Number.isFinite(video.duration) ? video.duration : 0;
          const step = 1 / FRAME_RATE;
          for (let time = 0; time <= duration; time += step) {
            await new Promise<void>((resolve, reject) => {
              video.onseeked = () => {
                drawCover(context, video, video.videoWidth, video.videoHeight, width, height);
                resolve();
              };
              video.onerror = () => reject(new Error(`Could not play ${shot.title}.`));
              video.currentTime = Math.min(time, duration);
            });
          }
        }
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    } finally {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      for (const track of stream.getTracks()) {
        track.stop();
      }
      canvas.remove();
    }

    await stopped;
    options?.onProgress?.({ ratio: 1, label: 'Packing film' });
    const mimeType = recorder.mimeType || picked.mimeType || 'video/webm';
    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size === 0) {
      throw new Error('The assembled film was empty.');
    }
    const extension = mimeType.includes('mp4') ? 'mp4' : picked.extension;
    return { blob, mimeType, extension, encodePath: 'browser' };
  } finally {
    for (const entry of resolvedShots) {
      entry.revoke?.();
    }
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadFilmBlob(blob: Blob, filename: string): void {
  triggerDownload(blob, filename);
}

/**
 * Prefer Web Share when the browser can share a file; otherwise download.
 * Returns true when the share sheet was used.
 */
export async function shareFilmBlob(blob: Blob, filename: string): Promise<boolean> {
  if (typeof navigator === 'undefined') {
    downloadFilmBlob(blob, filename);
    return false;
  }
  const type = blob.type || 'video/mp4';
  const file = new File([blob], filename, { type });
  try {
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: filename,
        text: 'My Castcut film',
      });
      return true;
    }
  } catch (err) {
    // User cancel should not fall through to a duplicate download.
    if (err instanceof DOMException && err.name === 'AbortError') {
      return false;
    }
  }
  downloadFilmBlob(blob, filename);
  return false;
}

export async function stampAssembledFilm(input: {
  blob: Blob;
  filename: string;
  characterId?: string;
  characterName?: string;
  lookId?: string;
  mimeType?: string;
  prompt?: string;
  tool?: string;
  parentGalleryEntryId?: string;
  projectId?: string;
  userTags?: string[];
  serverEncoded?: boolean;
  onProgress?: (progress: AssembleFilmProgress) => void;
}): Promise<{ persisted: boolean; entryId?: string; reason?: 'too-large' | 'storage' }> {
  if (!canStampAssembledFilm(input.blob.size, { serverEncoded: input.serverEncoded })) {
    return { persisted: false, reason: 'too-large' };
  }
  const id = crypto.randomUUID();
  const mimeType = input.mimeType || input.blob.type || 'video/webm';
  const file = new File([input.blob], input.filename, { type: mimeType });
  input.onProgress?.({ ratio: 1, label: 'Saving film to gallery' });
  const persisted = await persistGalleryOriginal(id, file);
  if (!persisted || persisted.skipped || !persisted.originalPath || !persisted.originalUrl) {
    return { persisted: false, reason: 'storage' };
  }

  const settings = loadComfyUiSettings();
  const characterName = input.characterName?.trim() || 'character';
  addComfyGalleryEntry({
    id,
    promptId: `film-${id}`,
    prompt: input.prompt?.trim() || `Assembled film · ${characterName}`,
    tool: input.tool?.trim() || 'roleplay',
    derivedKind: 'film',
    characterId: input.characterId,
    lookId: input.lookId,
    parentGalleryEntryId: input.parentGalleryEntryId,
    projectId: input.projectId,
    comfyUrl: settings.apiUrl?.trim() || 'http://127.0.0.1:8188',
    status: 'completed',
    completedAt: Date.now(),
    images: [
      {
        filename: input.filename,
        subfolder: '',
        type: 'output',
        format: mimeType,
      },
    ],
    durableOriginalPath: persisted.originalPath,
    durableThumbPath: persisted.thumbPath,
    sourceImageUrl: persisted.originalUrl,
    userTags: input.userTags ?? ['film'],
  });

  return { persisted: true, entryId: id };
}

export async function assembleAndStampFilm(input: {
  shots: FilmPlaylistShot[];
  characterId: string;
  characterName: string;
  lookId?: string;
  resolution?: '720p' | '1080p';
  crossfadeSec?: number;
  audioBedUrl?: string;
  preferServer?: boolean;
  onProgress?: (progress: AssembleFilmProgress) => void;
}): Promise<{
  filename: string;
  blob: Blob;
  persisted: boolean;
  entryId?: string;
  encodePath: 'server' | 'browser';
}> {
  const assembled = await assembleFilmBlob(input.shots, {
    onProgress: input.onProgress,
    preferServer: input.preferServer,
    resolution: input.resolution,
    crossfadeSec: input.crossfadeSec,
    audioBedUrl: input.audioBedUrl,
  });
  const filename = filmDownloadFilename(input.characterName, assembled.extension);
  const stamped = await stampAssembledFilm({
    blob: assembled.blob,
    filename,
    characterId: input.characterId,
    characterName: input.characterName,
    lookId: input.lookId,
    mimeType: assembled.mimeType,
    serverEncoded: assembled.encodePath === 'server',
    onProgress: input.onProgress,
  });
  return { filename, blob: assembled.blob, encodePath: assembled.encodePath, ...stamped };
}

export async function stitchSelectedGalleryVideos(input: {
  entries: ComfyGalleryEntry[];
  onProgress?: (progress: AssembleFilmProgress) => void;
}): Promise<{
  filename: string;
  blob: Blob;
  persisted: boolean;
  entryId?: string;
  clipCount: number;
  encodePath: 'server' | 'browser';
}> {
  const shots = galleryStitchShots(input.entries);
  if (shots.length < MIN_GALLERY_STITCH_CLIPS) {
    throw new Error('Select at least two completed clips to stitch.');
  }

  const assembled = await assembleFilmBlob(shots, { onProgress: input.onProgress });
  const filename = filmDownloadFilename('gallery-stitch', assembled.extension);
  const firstId = shots[0]?.entryId;
  const first = input.entries.find(entry => entry.id === firstId);
  const characterIds = new Set(
    input.entries
      .filter(entry => shots.some(shot => shot.entryId === entry.id))
      .map(entry => entry.characterId?.trim())
      .filter((id): id is string => Boolean(id))
  );

  const stamped = await stampAssembledFilm({
    blob: assembled.blob,
    filename,
    characterId: characterIds.size === 1 ? [...characterIds][0] : undefined,
    characterName: 'gallery',
    lookId: first?.lookId,
    mimeType: assembled.mimeType,
    prompt: `Stitched film · ${shots.length} clips`,
    tool: 'gallery',
    parentGalleryEntryId: first?.id,
    projectId: first?.projectId,
    userTags: ['film', 'stitch'],
    serverEncoded: assembled.encodePath === 'server',
    onProgress: input.onProgress,
  });

  downloadFilmBlob(assembled.blob, filename);
  return {
    filename,
    blob: assembled.blob,
    persisted: stamped.persisted,
    entryId: stamped.entryId,
    clipCount: shots.length,
    encodePath: assembled.encodePath,
  };
}
