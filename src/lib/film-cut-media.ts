/**
 * Browser-side reads the cut plan needs before encoding: how long each clip and the music track
 * run, and the track's tempo. All best-effort — a failed read just means "unknown".
 */

import {
  estimateTempoBpm,
  fitHoldsToLength,
  framingCropRect,
  snapHoldsToBeat,
  type FilmCutLength,
} from './film-cut-plan';
import { locateFaceOnPlateBlob } from './face-locate-client';
import type { FilmPlaylistShot } from './character-film';

const PROBE_TIMEOUT_MS = 8_000;

/** Duration of an audio / video URL from its metadata, or null. */
export function probeMediaDurationSec(
  url: string,
  kind: 'audio' | 'video'
): Promise<number | null> {
  if (typeof document === 'undefined' || !url.trim()) return Promise.resolve(null);
  return new Promise(resolve => {
    const media = document.createElement(kind);
    media.preload = 'metadata';
    media.muted = true;
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      media.removeAttribute('src');
      media.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), PROBE_TIMEOUT_MS);
    media.onloadedmetadata = () =>
      done(Number.isFinite(media.duration) && media.duration > 0 ? media.duration : null);
    media.onerror = () => done(null);
    media.src = url;
  });
}

/** Tempo of an audio URL (first ~60 s, mono), or null. */
export async function detectTempoBpmFromUrl(url: string): Promise<number | null> {
  if (typeof window === 'undefined' || !url.trim()) return null;
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const context = new Ctx();
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const length = Math.min(buffer.length, Math.round(buffer.sampleRate * 60));
    const mono = new Float32Array(length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) mono[i]! += data[i]! / buffer.numberOfChannels;
    }
    return estimateTempoBpm(mono, buffer.sampleRate);
  } catch {
    return null;
  } finally {
    void context.close().catch(() => undefined);
  }
}

export type PreparedCut = {
  shots: FilmPlaylistShot[];
  /** What was done, for the status line ("fit to the 42 s track · on the beat (120 BPM)"). */
  notes: string[];
};

/**
 * Apply length fitting and beat snapping to the shots (edits and captions are applied by the
 * caller). Captions replace titles here, since both encoders caption from the title.
 */
export async function prepareCutShots(
  shots: FilmPlaylistShot[],
  options: {
    length?: FilmCutLength;
    beatSnap?: boolean;
    audioBedUrl?: string;
    crossfadeSec?: number;
    titleCard?: boolean;
    captions?: boolean;
  }
): Promise<PreparedCut> {
  const notes: string[] = [];
  let next = options.captions
    ? shots.map(shot => (shot.caption?.trim() ? { ...shot, title: shot.caption.trim() } : shot))
    : shots;
  const length = options.length ?? 'shots';
  const audio = options.audioBedUrl?.trim() || '';
  if (length !== 'shots') {
    const targetSec =
      length === 'music' ? (audio ? await probeMediaDurationSec(audio, 'audio') : null) : length;
    if (targetSec) {
      const clipSecs = await Promise.all(
        next.map(shot => (shot.kind === 'clip' ? probeMediaDurationSec(shot.url, 'video') : null))
      );
      next = fitHoldsToLength({
        shots: next,
        targetSec,
        clipSecs,
        crossfadeSec: options.crossfadeSec,
        titleCard: options.titleCard,
      });
      notes.push(
        length === 'music' ? `fit to the ${Math.round(targetSec)} s track` : `${length} s cut`
      );
    } else if (length === 'music') {
      notes.push(audio ? "couldn't read the track length" : 'no music track to fit');
    }
  }
  if (options.beatSnap && audio) {
    const bpm = await detectTempoBpmFromUrl(audio);
    if (bpm) {
      next = snapHoldsToBeat(next, bpm);
      notes.push(`cuts on the beat (${Math.round(bpm)} BPM)`);
    } else {
      notes.push('no clear beat in the track');
    }
  }
  return { shots: next, notes };
}

/**
 * Stills with a closer framing (waist up / chest up) become a crop around the face, as a JPEG
 * data URL both encoders read. A still whose face can't be found, or that is already that close,
 * stays as shot (named in the notes).
 */
export async function frameCutStills(
  shots: FilmPlaylistShot[]
): Promise<{ shots: FilmPlaylistShot[]; notes: string[] }> {
  if (typeof document === 'undefined' || !shots.some(shot => shot.framing)) {
    return { shots, notes: [] };
  }
  const notes: string[] = [];
  const out: FilmPlaylistShot[] = [];
  for (const shot of shots) {
    if (shot.kind !== 'still' || !shot.framing) {
      out.push(shot);
      continue;
    }
    const framed = await cropStillToFraming(shot.url, shot.framing).catch(() => null);
    if (framed === 'already') {
      out.push(shot);
    } else if (framed) {
      out.push({ ...shot, url: framed });
    } else {
      notes.push(`${shot.title}: no face found — kept as shot`);
      out.push(shot);
    }
  }
  return { shots: out, notes };
}

async function cropStillToFraming(
  url: string,
  framing: 'medium' | 'close'
): Promise<string | 'already' | null> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) return null;
  const blob = await response.blob();
  const located = await locateFaceOnPlateBlob(blob);
  if (!located?.available || !located.face) return null;
  const bitmap = await createImageBitmap(blob);
  try {
    const rect = framingCropRect(bitmap.width, bitmap.height, located.face, framing);
    if (!rect) return 'already';
    const canvas = document.createElement('canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(
      bitmap,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height
    );
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    bitmap.close();
  }
}
