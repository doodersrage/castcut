import { sharedLlmRequestBody } from '../llm/request-options';
import type { SharedToolSettings } from '../settings/cache';
import type { RoomVerdict } from './room';

/**
 * Same room as the scene's reference? `/api/room-check` (still/room.ts). Never throws: null when
 * the check couldn't run or its answer couldn't be read.
 */
export async function checkStillRoom(options: {
  imageUrl: string;
  referenceUrl: string;
  shared?: SharedToolSettings;
}): Promise<RoomVerdict | null> {
  try {
    const response = await fetch('/api/room-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        imageUrl: options.imageUrl,
        referenceUrl: options.referenceUrl,
        ...(options.shared ? sharedLlmRequestBody(options.shared) : {}),
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { verdict?: RoomVerdict | null };
    return data.verdict ?? null;
  } catch {
    return null;
  }
}
