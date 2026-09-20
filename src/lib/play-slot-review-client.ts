import { sharedLlmRequestBody } from './llm-request-options';
import type { SlotQualityReport, SlotReviewContext } from './play-slot-quality';
import type { SharedToolSettings } from './settings-cache';
import {
  parseVisionScanApiResponse,
  prepareVisionScanImagePayload,
  resolveStillFileForVisionScan,
} from './vision-scan-still';

/** Review one landed Day still through `/api/play-slot-review`. Rejects on any failure. */
export async function reviewDaySlotStill(options: {
  imageUrl: string;
  context?: SlotReviewContext;
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
}): Promise<SlotQualityReport> {
  // `imageUrl` may be a plain still or a side-by-side identity pair built on the client; both
  // are just an image to the endpoint, and `context.referencePair` tells the reviewer which.
  const still = await resolveStillFileForVisionScan({
    file: null,
    urls: [options.imageUrl],
    fallbackName: 'day-still.png',
  });
  const { image, mimeType } = await prepareVisionScanImagePayload(still);
  const response = await fetch('/api/play-slot-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      image,
      mimeType,
      beat: options.context?.beat,
      setting: options.context?.setting,
      outfit: options.context?.outfit,
      expectedPeople: options.context?.expectedPeople,
      referencePair: options.context?.referencePair === true,
      ...(options.shared ? sharedLlmRequestBody(options.shared) : {}),
    }),
  });
  const data = await parseVisionScanApiResponse<Partial<SlotQualityReport> & { error?: string }>(
    response
  );
  if (!response.ok || typeof data.faceIntegrity !== 'number') {
    throw new Error(data.error ?? 'Slot review failed.');
  }
  return data as SlotQualityReport;
}
