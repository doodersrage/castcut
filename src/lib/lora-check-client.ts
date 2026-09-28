'use client';

import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { comfyInputViewUrl } from '@/lib/face-match-client';
import {
  galleryStillViewUrl,
  LORA_CHECK_STRENGTHS,
  pickLoraCheckStills,
  summarizeLoraCheck,
  type LoraCheckSample,
  type LoraFaceCheck,
} from '@/lib/lora-check';
import { LORA_FAMILY_LABELS } from '@/lib/lora-family-detect';
import type { LoraLibraryEntry } from '@/lib/lora-stack';
import { loadSettingsCache } from '@/lib/settings-cache';

export type LoraCheckRender = {
  stillKey: string;
  strength: number;
  imageUrl: string;
  similarity: number | null;
};

export type LoraCheckRun =
  | { ok: true; check: LoraFaceCheck; renders: LoraCheckRender[] }
  | { ok: false; reason: string; renders: LoraCheckRender[] };

/** The Cast plate Day face-checks against, as a ComfyUI view URL. */
function castPlateReferenceUrl(): string | null {
  const day = loadSettingsCache().tools.day;
  const url = day?.plateImageUrl?.trim();
  if (url?.includes('/api/comfyui/view?')) return url;
  return comfyInputViewUrl(day?.plateImageFilename);
}

async function renderOnce(input: {
  stillUrl: string;
  referenceUrl: string;
  loraFilename: string;
  strength: number;
}): Promise<{ imageUrl: string; similarity: number | null }> {
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const response = await fetch('/api/comfyui/lora-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...input, ...(comfyUrl ? { comfyUrl } : {}) }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    available?: boolean;
    imageUrl?: string;
    similarity?: number | null;
    reason?: string;
    error?: string;
  };
  if (!response.ok || data.available !== true || !data.imageUrl) {
    throw new Error(data.reason ?? data.error ?? `LoRA check failed (HTTP ${response.status}).`);
  }
  return { imageUrl: data.imageUrl, similarity: data.similarity ?? null };
}

/**
 * Replay the active Cast's newest Day stills (same engine family as the LoRA) without the
 * LoRA and at each check strength, face-scoring every render against the Cast plate.
 */
export async function runLoraCheck(
  entry: LoraLibraryEntry,
  onProgress?: (done: number, total: number, render?: LoraCheckRender) => void
): Promise<LoraCheckRun> {
  const renders: LoraCheckRender[] = [];
  const filename = entry.tokenValue?.trim();
  const family = entry.family;
  if (!filename) return { ok: false, reason: 'This entry has no LoRA file.', renders };
  if (!family || family === 'unknown' || entry.familySource === 'missing') {
    return {
      ok: false,
      reason: 'Scan the file first so the check knows its model family.',
      renders,
    };
  }
  const shared = loadSettingsCache().shared;
  const characterId = shared.activeCharacterId?.trim();
  const referenceUrl = castPlateReferenceUrl();
  if (!characterId || !referenceUrl) {
    return { ok: false, reason: 'Pick a Cast and open Day with its plate first.', renders };
  }
  const stills = pickLoraCheckStills(loadComfyGallery(), { family, characterId });
  if (stills.length === 0) {
    return {
      ok: false,
      reason: `No finished stills of this Cast on a ${LORA_FAMILY_LABELS[family]} engine yet — make a few in Day first.`,
      renders,
    };
  }
  const strengths = [0, ...LORA_CHECK_STRENGTHS];
  const total = stills.length * strengths.length;
  onProgress?.(0, total);
  const samples: LoraCheckSample[] = [];
  for (const still of stills) {
    const stillUrl = galleryStillViewUrl(still)!;
    for (const strength of strengths) {
      const result = await renderOnce({ stillUrl, referenceUrl, loraFilename: filename, strength });
      const render = { stillKey: still.id, strength, ...result };
      renders.push(render);
      samples.push({ stillKey: still.id, strength, similarity: result.similarity });
      onProgress?.(renders.length, total, render);
    }
  }
  const check = summarizeLoraCheck(samples, { model: stills[0]?.model });
  return check
    ? { ok: true, check, renders }
    : { ok: false, reason: 'No face was found in the check renders.', renders };
}
