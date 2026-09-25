import { sharedLlmRequestBody } from './llm-request-options';
import type { MoodboardTileRole } from './moodboard-scene';
import type { SharedToolSettings } from './settings-cache';
import { parseVisionScanApiResponse, prepareVisionScanImagePayload } from './vision-scan-still';

/**
 * Browser: suggest a role for a freshly added Look tile. Resolves null when the model isn't
 * sure; rejects when there's no vision model (callers stop asking for the session).
 */
export async function suggestLookTileRoleForFile(
  file: File,
  shared?: Parameters<typeof sharedLlmRequestBody>[0] & Partial<SharedToolSettings>
): Promise<MoodboardTileRole | null> {
  const { image, mimeType } = await prepareVisionScanImagePayload(file);
  const response = await fetch('/api/look-tile-role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ image, mimeType, ...(shared ? sharedLlmRequestBody(shared) : {}) }),
  });
  const data = await parseVisionScanApiResponse<{
    role?: MoodboardTileRole | null;
    error?: string;
  }>(response);
  if (!response.ok) {
    throw new Error(data.error ?? 'Tile role suggestion failed.');
  }
  return data.role ?? null;
}
