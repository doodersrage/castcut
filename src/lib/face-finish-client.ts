'use client';

import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import {
  parseLeadFaceProbe,
  type FaceFinishProbeDecision,
  type LeadFaceProbe,
} from '@/lib/face-finish';

export type FaceFinishClientResult =
  | { available: true; imageUrl: string; finisher: 'qwen-edit' | 'klein-distilled' | 'rapid' }
  | { available: false; reason: string };

export type FaceFinishClientPlan = {
  /** Main model the pass would load, or null when unknown. */
  modelKey: string | null;
  /** The faces probed before the pass (handed back to the run); undefined when none ran. */
  probe?: LeadFaceProbe | null;
  /** Finish or leave the still (from the probe); undefined when no probe ran. */
  decision?: FaceFinishProbeDecision;
};

/**
 * Browser: what the Face finish pass on this still would do, before anything heavy is queued —
 * the main model it would load (for holding it while the app's stills on another model still
 * wait) and, given the Cast face crop, the face probe and whether the face is already close
 * enough to leave. Never rejects: unknown = an empty plan.
 */
export async function planStillFaceFinish(
  imageUrl: string,
  options?: { faceUrl?: string; people?: number }
): Promise<FaceFinishClientPlan> {
  try {
    const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
    const response = await fetch('/api/face-finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        imageUrl,
        plan: true,
        ...(options?.faceUrl ? { faceUrl: options.faceUrl } : {}),
        ...(options?.people ? { people: options.people } : {}),
        ...(comfyUrl ? { comfyUrl } : {}),
      }),
    });
    if (!response.ok) return { modelKey: null };
    const data = (await response.json().catch(() => ({}))) as {
      modelKey?: unknown;
      probe?: unknown;
      decision?: FaceFinishProbeDecision;
    };
    const modelKey = typeof data.modelKey === 'string' && data.modelKey ? data.modelKey : null;
    if (!data.decision || typeof data.decision.finish !== 'boolean') return { modelKey };
    return { modelKey, probe: parseLeadFaceProbe(data.probe), decision: data.decision };
  } catch {
    return { modelKey: null };
  }
}

/** Browser: run Face finish on a still via `/api/face-finish`; rejects on errors. */
export async function runStillFaceFinish(input: {
  imageUrl: string;
  faceUrl: string;
  /** People in the still (2 = finish only the lead's face). */
  people?: number;
  /** The plan's face probe — the pass doesn't probe the still again. */
  probe?: LeadFaceProbe | null;
}): Promise<FaceFinishClientResult> {
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const response = await fetch('/api/face-finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...input, ...(comfyUrl ? { comfyUrl } : {}) }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    available?: boolean;
    reason?: string;
    image?: { filename: string; subfolder?: string; type?: string };
    finisher?: 'qwen-edit' | 'klein-distilled' | 'rapid';
    error?: string;
  };
  if (!response.ok || typeof data.available !== 'boolean') {
    throw new Error(data.error ?? `Face finish failed (HTTP ${response.status}).`);
  }
  if (!data.available || !data.image?.filename) {
    return { available: false, reason: data.reason ?? 'Face finish unavailable.' };
  }
  const params = new URLSearchParams({
    filename: data.image.filename,
    subfolder: data.image.subfolder ?? '',
    type: data.image.type ?? 'output',
  });
  return {
    available: true,
    imageUrl: `/api/comfyui/view?${params.toString()}`,
    finisher: data.finisher ?? 'rapid',
  };
}
