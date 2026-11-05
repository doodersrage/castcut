'use client';

import { resolveFilmAudioBedFromFile } from '../film/audio-bed';
import { clipJobProgressText, fetchClipJob, startClipJob } from './clip-jobs';

/**
 * "Make a sound" (sound-effect.ts) from the browser: starts the job, follows it, and keeps the
 * sound the way an uploaded effect is kept (durable Gallery media), so the effects track plays
 * and encodes it like any file. Resolves to its URL and a name (the words).
 */
export async function makeSoundEffectForCut(input: {
  words: string;
  seconds: number;
  onProgress?: (text: string) => void;
  pollMs?: number;
}): Promise<{ url: string; label: string }> {
  const words = input.words.trim();
  const started = await startClipJob('sound-effect', { words, seconds: input.seconds });
  let job = started;
  while (job.status === 'running') {
    await new Promise(resolve => setTimeout(resolve, input.pollMs ?? 2000));
    job = await fetchClipJob(started.id);
    input.onProgress?.(clipJobProgressText(job));
  }
  if (job.status !== 'completed' || !job.url) {
    throw new Error(
      job.error ?? (job.status === 'cancelled' ? 'Cancelled.' : 'No sound came back.')
    );
  }
  const response = await fetch(job.url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Could not fetch the sound.');
  const blob = await response.blob();
  const name =
    words
      .replace(/[^\w -]+/g, '')
      .trim()
      .slice(0, 40) || 'sound';
  const kept = await resolveFilmAudioBedFromFile(
    new File([blob], `${name}.m4a`, { type: 'audio/mp4' })
  );
  return { url: kept.url, label: words.slice(0, 60) };
}
