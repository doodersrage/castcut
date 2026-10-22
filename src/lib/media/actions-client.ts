'use client';

/**
 * Client calls for the quick finishing tools (Relight, Sketch): each resolves to the new media's
 * URL. The long ones — Sharpen & smooth, Make more realistic, Copy moves, Dance to music,
 * Lip-sync, Upscale — run as background jobs (clip/clip-jobs-tracker.ts); the form builders for
 * their uploads are here.
 */

async function readUrl(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok || !data.url) throw new Error(data.error ?? fallback);
  return data.url;
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

/** Copy moves' request (a background job, clip/clip-jobs-tracker.ts). */
export function copyMovesForm(input: {
  video: Blob;
  stillUrl: string;
  look: string;
  place?: string;
  motion?: string;
  /** A seat to put into the still first (the Director, when she sits down). */
  seat?: string;
  keepSound?: boolean;
}): FormData {
  const form = new FormData();
  form.set('video', input.video, 'moves.mp4');
  form.set('stillUrl', input.stillUrl);
  form.set('look', input.look);
  if (input.place) form.set('place', input.place);
  if (input.motion) form.set('motion', input.motion);
  if (input.seat) form.set('seat', input.seat);
  if (input.keepSound) form.set('keepSound', 'true');
  return form;
}

/** Lip-sync's request (a background job). */
export function lipSyncForm(input: {
  audio: Blob;
  /** Two people: the right-hand person's recording, said after the left-hand one's. */
  audio2?: Blob | null;
  stillUrl: string;
  prompt?: string;
}): FormData {
  const form = new FormData();
  form.set('audio', input.audio, 'voice');
  if (input.audio2) form.set('audio2', input.audio2, 'voice-2');
  form.set('stillUrl', input.stillUrl);
  if (input.prompt) form.set('prompt', input.prompt);
  return form;
}

/** Dance to music's request (a background job). */
export function danceForm(input: {
  music: Blob;
  stillUrl: string;
  style: string;
  amplitude: string;
  start?: number;
}): FormData {
  const form = new FormData();
  form.set('music', input.music, 'music');
  form.set('stillUrl', input.stillUrl);
  form.set('style', input.style);
  form.set('amplitude', input.amplitude);
  if (input.start) form.set('start', String(input.start));
  return form;
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
