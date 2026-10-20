import { sharedLlmRequestBody } from '../llm/request-options';
import type { SharedToolSettings } from '../settings/cache';
import type { StillScanPurpose } from './still-scan';
import {
  parseVisionScanApiResponse,
  prepareVisionScanImagePayload,
  resolveStillFileForVisionScan,
} from './scan-still';

export async function resolveLocalImageFile(
  file: File | null,
  previewUrl: string | null | undefined,
  fallbackName: string
): Promise<File> {
  return resolveStillFileForVisionScan({
    file,
    urls: [previewUrl],
    fallbackName,
  });
}

export async function scanStillWithVision(options: {
  image: File;
  purpose: StillScanPurpose;
  model?: string;
  detail?: string;
  extraHints?: string;
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
}): Promise<string> {
  const still = await resolveStillFileForVisionScan({ file: options.image });
  const { image, mimeType } = await prepareVisionScanImagePayload(still);
  const response = await fetch('/api/vision-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      purpose: options.purpose,
      image,
      mimeType,
      model: options.model,
      detail: options.detail,
      extraHints: options.extraHints,
      ...(options.shared ? sharedLlmRequestBody(options.shared) : {}),
    }),
  });
  const data = await parseVisionScanApiResponse<{ prompt?: string; error?: string }>(response);
  if (!response.ok || !data.prompt?.trim()) {
    throw new Error(data.error ?? 'Vision scan failed.');
  }
  return data.prompt.trim();
}
