/**
 * Server-assisted stitch after last-frame I2V continue (Gemini / optional).
 * Registers a pending parent+child pair; Roleplay sync stitches when the child completes.
 */

import { assembleFilmBlob } from './character-film-assemble-lazy';
import type { FilmPlaylistShot } from './character-film';

export type PendingContinueStitch = {
  parentUrl: string;
  childPromptId: string;
  createdAt: number;
};

const PENDING_TTL_MS = 2 * 60 * 60 * 1000;
const pendingByChildPromptId = new Map<string, PendingContinueStitch>();

function prunePending(): void {
  const now = Date.now();
  for (const [key, value] of pendingByChildPromptId) {
    if (now - value.createdAt > PENDING_TTL_MS) {
      pendingByChildPromptId.delete(key);
    }
  }
}

export function registerContinueStitch(input: { childPromptId: string; parentUrl: string }): void {
  const childPromptId = input.childPromptId.trim();
  const parentUrl = input.parentUrl.trim();
  if (!childPromptId || !parentUrl) {
    return;
  }
  prunePending();
  pendingByChildPromptId.set(childPromptId, {
    childPromptId,
    parentUrl,
    createdAt: Date.now(),
  });
}

export function peekContinueStitch(childPromptId: string): PendingContinueStitch | null {
  prunePending();
  return pendingByChildPromptId.get(childPromptId.trim()) ?? null;
}

export function takeContinueStitch(childPromptId: string): PendingContinueStitch | null {
  prunePending();
  const key = childPromptId.trim();
  const pending = pendingByChildPromptId.get(key) ?? null;
  if (pending) {
    pendingByChildPromptId.delete(key);
  }
  return pending;
}

export function continueStitchShots(parentUrl: string, childUrl: string): FilmPlaylistShot[] {
  const shots: FilmPlaylistShot[] = [
    { url: parentUrl.trim(), title: 'Parent clip', kind: 'clip' },
    { url: childUrl.trim(), title: 'Continue take', kind: 'clip' },
  ];
  return shots.filter(shot => shot.url.length > 0);
}

/** Concat parent + child via `/api/film/assemble` (ffmpeg) or browser MediaRecorder. */
export async function stitchContinueClips(input: {
  parentUrl: string;
  childUrl: string;
  onProgress?: (label: string) => void;
}): Promise<{ blob: Blob; objectUrl: string; encodePath: 'server' | 'browser' } | null> {
  const shots = continueStitchShots(input.parentUrl, input.childUrl);
  if (shots.length < 2) {
    return null;
  }
  try {
    const result = await assembleFilmBlob(shots, {
      preferServer: true,
      crossfadeSec: 0,
      onProgress: progress => input.onProgress?.(progress.label),
    });
    const objectUrl = URL.createObjectURL(result.blob);
    return { blob: result.blob, objectUrl, encodePath: result.encodePath };
  } catch {
    return null;
  }
}
