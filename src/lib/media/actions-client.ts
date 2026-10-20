'use client';

import type { ClipRealismStrength } from '../clip/realism';

/**
 * Client calls for the finishing tools on a still or clip: Finish clip (/api/clip/finish), Make
 * more realistic (/api/clip/realism),
 * Copy moves (/api/clip/moves), Lip-sync (/api/clip/lip-sync) and Relight (/api/still/relight).
 * Each resolves to the new media's URL and rejects with the server's message.
 */

async function readUrl(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok || !data.url) throw new Error(data.error ?? fallback);
  return data.url;
}

/** `entryId`: the clip's Gallery entry, so the server can read its stored original. */
export async function requestFinishClip(clipUrl: string, entryId?: string): Promise<string> {
  const response = await fetch('/api/clip/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ clipUrl, entryId }),
  });
  return readUrl(response, 'Finish clip failed.');
}

/** Make more realistic (/api/clip/realism): a low-strength WAN 2.2 re-render of the clip. */
export async function requestRealismClip(
  clipUrl: string,
  options: { strength?: ClipRealismStrength; entryId?: string } = {}
): Promise<string> {
  const response = await fetch('/api/clip/realism', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ clipUrl, ...options }),
  });
  return readUrl(response, 'Make more realistic failed.');
}

export async function requestRelight(stillUrl: string, look: string): Promise<string> {
  const response = await fetch('/api/still/relight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ stillUrl, look }),
  });
  return readUrl(response, 'Relight failed.');
}

export async function requestCopyMoves(input: {
  video: Blob;
  stillUrl: string;
  look: string;
  place?: string;
  motion?: string;
  keepSound?: boolean;
}): Promise<string> {
  const form = new FormData();
  form.set('video', input.video, 'moves.mp4');
  form.set('stillUrl', input.stillUrl);
  form.set('look', input.look);
  if (input.place) form.set('place', input.place);
  if (input.motion) form.set('motion', input.motion);
  if (input.keepSound) form.set('keepSound', 'true');
  const response = await fetch('/api/clip/moves', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  return readUrl(response, 'Copy moves failed.');
}

export async function requestLipSync(input: {
  audio: Blob;
  /** Two people: the right-hand person's recording, said after the left-hand one's. */
  audio2?: Blob | null;
  stillUrl: string;
  prompt?: string;
}): Promise<string> {
  const form = new FormData();
  form.set('audio', input.audio, 'voice');
  if (input.audio2) form.set('audio2', input.audio2, 'voice-2');
  form.set('stillUrl', input.stillUrl);
  if (input.prompt) form.set('prompt', input.prompt);
  const response = await fetch('/api/clip/lip-sync', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  return readUrl(response, 'Lip-sync failed.');
}

export async function requestDanceToMusic(input: {
  music: Blob;
  stillUrl: string;
  style: string;
  amplitude: string;
  start?: number;
}): Promise<string> {
  const form = new FormData();
  form.set('music', input.music, 'music');
  form.set('stillUrl', input.stillUrl);
  form.set('style', input.style);
  form.set('amplitude', input.amplitude);
  if (input.start) form.set('start', String(input.start));
  const response = await fetch('/api/clip/dance', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  return readUrl(response, 'Dance to music failed.');
}

export async function requestSketch(input: {
  image: Blob;
  words: string;
  overStill: boolean;
}): Promise<string> {
  const form = new FormData();
  form.set('image', input.image, 'sketch.png');
  form.set('words', input.words);
  if (input.overStill) form.set('overStill', 'true');
  const response = await fetch('/api/still/sketch', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  return readUrl(response, 'Sketch failed.');
}

export async function requestUpscaleStill(
  stillUrl: string,
  target: '2x' | '4k' = '4k'
): Promise<string> {
  const response = await fetch('/api/still/upscale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ stillUrl, target }),
  });
  return readUrl(response, 'Upscale failed.');
}
