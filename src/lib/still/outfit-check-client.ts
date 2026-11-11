'use client';

import { sharedLlmRequestBody } from '../llm/request-options';
import type { SharedToolSettings } from '../settings/cache';
import {
  parseVisionScanApiResponse,
  prepareVisionScanImagePayload,
  resolveStillFileForVisionScan,
} from '../vision/scan-still';
import type { OutfitCheckVerdict, OutfitWearer } from './outfit-check';

/**
 * Whether a still's lead wears the planned outfit — `/api/outfit-check`. Never throws: null when
 * the check couldn't run or its answer couldn't be read.
 */
export async function checkStillOutfit(options: {
  imageUrl: string;
  outfit: string;
  wearer: OutfitWearer;
  shared?: SharedToolSettings;
}): Promise<OutfitCheckVerdict | null> {
  try {
    const still = await resolveStillFileForVisionScan({
      file: null,
      urls: [options.imageUrl],
      fallbackName: 'outfit-check.png',
    });
    const { image, mimeType } = await prepareVisionScanImagePayload(still);
    const response = await fetch('/api/outfit-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        image,
        mimeType,
        outfit: options.outfit,
        wearer: options.wearer,
        ...(options.shared ? sharedLlmRequestBody(options.shared) : {}),
      }),
    });
    const data = await parseVisionScanApiResponse<{
      verdict?: OutfitCheckVerdict | null;
      error?: string;
    }>(response);
    return response.ok ? (data.verdict ?? null) : null;
  } catch {
    return null;
  }
}
