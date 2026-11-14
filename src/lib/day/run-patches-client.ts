'use client';

/**
 * A server-rendered run, on the page (FINISHING_PLAN Phase 3, step 8): it is started there
 * (POST /api/scene-runs/server) and what the server does comes back as patches, applied in order
 * — the Scene (useScenePage.applyServerPatch), the run's record, and here its takes: each in the
 * Gallery as the page's own queue would register it (polled from ComfyUI for its picture), with
 * its checks; the dressed plates it made, in this browser's store.
 */
import type { DayDressPlateEntry } from './dress-plate-cache';
import type { RunBundle } from './run-bundle';
import type { RunPatch, RunPatchTake } from './run-loop-server';

export type ServerRunPatchRow = {
  seq: number;
  at: number;
  patch: RunPatch & { dressPlates?: DayDressPlateEntry[] };
};

/** Send the run's bundle and wait for the server to keep it. */
export async function sendRunBundle(bundle: RunBundle): Promise<boolean> {
  try {
    const response = await fetch('/api/scene-runs/bundle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bundle }),
    });
    if (!response.ok) return false;
    const body = (await response.json().catch(() => null)) as { queueSettings?: string } | null;
    // Kept without its queue settings (too large): the server cannot render it.
    return body?.queueSettings !== 'too large';
  } catch {
    return false;
  }
}

/** Ask the server to render (or pause) the run. Null when it did; why not otherwise. */
export async function askServerRun(
  runId: string,
  action: 'start' | 'pause' | 'cancel'
): Promise<string | null> {
  try {
    const response = await fetch('/api/scene-runs/server', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId, action }),
    });
    if (response.ok) return null;
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return body?.error?.trim() || `The server said no (${response.status}).`;
  } catch {
    return 'The server could not be reached.';
  }
}

/** What the server did after `after` (its patches in order), and whether it is still rendering. */
export async function fetchServerRunPatches(
  runId: string,
  after: number
): Promise<{ active: boolean; patches: ServerRunPatchRow[] } | null> {
  try {
    const params = new URLSearchParams({ runId, after: String(after) });
    const response = await fetch(`/api/scene-runs/server?${params.toString()}`);
    if (!response.ok) return null;
    return (await response.json()) as { active: boolean; patches: ServerRunPatchRow[] };
  } catch {
    return null;
  }
}

const SEQ_KEY = (runId: string) => `castcut-server-run-seq:${runId}`;

/** The last patch this browser applied for a run. */
export function appliedServerSeq(runId: string): number {
  try {
    return Math.max(0, Number(window.localStorage.getItem(SEQ_KEY(runId)) ?? 0) || 0);
  } catch {
    return 0;
  }
}

export function markServerSeq(runId: string, seq: number): void {
  try {
    window.localStorage.setItem(SEQ_KEY(runId), String(seq));
  } catch {
    // Private window: the page applies from the start next time (idempotent).
  }
}

/** The run's takes in the Gallery, with their checks; its dressed plates in this browser. */
export async function applyServerRunTakes(
  takes: readonly RunPatchTake[] | undefined,
  plates: readonly DayDressPlateEntry[] | undefined,
  owner: { characterId?: string }
): Promise<void> {
  if (takes?.length) {
    const { loadComfyGallery, recordGalleryPlayChecks } =
      await import('@/lib/gallery/comfyui-gallery');
    const { registerComfyGalleryJob } = await import('@/lib/gallery/comfyui-gallery-client');
    const { scheduleComfyGalleryPoll } = await import('@/lib/gallery/comfyui-gallery-poller');
    const known = new Set(loadComfyGallery().map(entry => entry.promptId));
    for (const take of takes) {
      if (!known.has(take.promptId)) {
        registerComfyGalleryJob({
          promptId: take.promptId,
          prompt: take.prompt ?? '',
          tool: 'day',
          ...(take.model ? { model: take.model } : {}),
          ...(owner.characterId ? { characterId: owner.characterId } : {}),
          comfyUrl: take.comfyUrl ?? 'http://127.0.0.1:8188',
        } as Parameters<typeof registerComfyGalleryJob>[0]);
        known.add(take.promptId);
        // Its picture and status, from ComfyUI (the page's own poll).
        void scheduleComfyGalleryPoll(take.promptId, { comfyUrl: take.comfyUrl });
      }
      if (take.playChecks) {
        const { at: _at, ...checks } = take.playChecks;
        recordGalleryPlayChecks(take.promptId, checks);
      }
    }
  }
  if (plates?.length) {
    const { findDressPlate, saveDressPlate } = await import('./dress-plate-store');
    for (const plate of plates) if (!findDressPlate(plate.key)) saveDressPlate(plate);
  }
}
