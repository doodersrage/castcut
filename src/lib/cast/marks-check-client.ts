'use client';

import type { MarksCheckReading } from './marks-check';
import { freeComfyUiMemory } from '../comfyui/queue-control';
import { sharedLlmRequestBody } from '../llm-request-options';
import type { SharedToolSettings } from '../settings-cache';
import {
  parseVisionScanApiResponse,
  prepareVisionScanImagePayload,
  resolveStillFileForVisionScan,
} from '../vision-scan-still';

type MarksCheckResult = { reading: MarksCheckReading } | { unavailable: string };

async function askOnce(
  imageUrl: string,
  shared: SharedToolSettings | undefined
): Promise<MarksCheckResult & { loadFailed?: boolean }> {
  const still = await resolveStillFileForVisionScan({
    file: null,
    urls: [imageUrl],
    fallbackName: 'marks-check.png',
  });
  const { image, mimeType } = await prepareVisionScanImagePayload(still);
  const response = await fetch('/api/marks-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ image, mimeType, ...(shared ? sharedLlmRequestBody(shared) : {}) }),
  });
  const data = await parseVisionScanApiResponse<{
    reading?: MarksCheckReading | null;
    unavailable?: string;
    error?: string;
  }>(response);
  if (response.ok && data.reading) return { reading: data.reading };
  const message = data.unavailable || data.error || `HTTP ${response.status}`;
  return { unavailable: message, loadFailed: /failed to load model/i.test(message) };
}

/**
 * What a Day still shows on her (glasses, tattoos) — `/api/marks-check`. The vision model often
 * can't load while ComfyUI keeps its models on the GPU (LM Studio: "Failed to load model"); then
 * ComfyUI is asked to free memory — between jobs, never interrupting one — and the check is
 * tried once more. Never throws.
 */
export async function checkStillMarks(options: {
  imageUrl: string;
  shared?: SharedToolSettings;
  comfyUrl?: string;
}): Promise<MarksCheckResult> {
  try {
    const first = await askOnce(options.imageUrl, options.shared);
    if (!('unavailable' in first) || !first.loadFailed) return first;
    await freeComfyUiMemory(options.comfyUrl).catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 4000));
    return await askOnce(options.imageUrl, options.shared);
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : 'Marks check failed.' };
  }
}
