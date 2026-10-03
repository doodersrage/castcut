import { sharedLlmRequestBody } from './llm-request-options';
import type { VisionPosture } from './pose-posture-vision';
import type { SharedToolSettings } from './settings-cache';
import {
  parseVisionScanApiResponse,
  prepareVisionScanImagePayload,
  resolveStillFileForVisionScan,
} from './vision-scan-still';

/**
 * Ask `/api/pose-posture` what the still's main person is doing. Null when no vision model is
 * set up; rejects on transport errors (callers skip the question then).
 */
export async function askStillPosture(options: {
  imageUrl: string;
  shared?: Pick<
    SharedToolSettings,
    | 'sessionLlmTemperature'
    | 'sessionAllowTemplateFallback'
    | 'sessionLlmModel'
    | 'sessionLlmVisionModel'
    | 'sessionLlmEnabled'
    | 'sessionLlmProvider'
    | 'sessionLlmApiKey'
  >;
}): Promise<VisionPosture | null> {
  const still = await resolveStillFileForVisionScan({
    file: null,
    urls: [options.imageUrl],
    fallbackName: 'pose-still.png',
  });
  const { image, mimeType } = await prepareVisionScanImagePayload(still);
  const response = await fetch('/api/pose-posture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      image,
      mimeType,
      ...(options.shared ? sharedLlmRequestBody(options.shared) : {}),
    }),
  });
  const data = await parseVisionScanApiResponse<{ posture?: VisionPosture | null; error?: string }>(
    response
  );
  if (!response.ok) {
    throw new Error(data.error ?? 'Posture check failed.');
  }
  return data.posture ?? null;
}
