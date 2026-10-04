import {
  decideAdultGate,
  type AdultGateDecision,
  type AdultGateReply,
} from './adult-appearance-gate';
import { sharedLlmRequestBody } from './llm-request-options';
import type { SharedToolSettings } from './settings-cache';
import {
  parseVisionScanApiResponse,
  prepareVisionScanImagePayload,
  resolveStillFileForVisionScan,
} from './vision-scan-still';

type VisionShared = Pick<
  SharedToolSettings,
  | 'sessionLlmTemperature'
  | 'sessionAllowTemplateFallback'
  | 'sessionLlmModel'
  | 'sessionLlmVisionModel'
  | 'sessionLlmEnabled'
  | 'sessionLlmProvider'
  | 'sessionLlmApiKey'
>;

/**
 * Ask `/api/adult-check` about one landed adult still and decide (adult-appearance-gate.ts).
 * The LLM switched off counts as no vision model (allowed unchecked). Any other failure — the
 * still could not be read, the route failed — is uncertain, and uncertain is withheld.
 */
export async function checkStillAdultAppearance(input: {
  imageUrl: string;
  /** This take already used the stronger age sentence. */
  strongTake: boolean;
  shared?: VisionShared;
}): Promise<AdultGateDecision & { reply: AdultGateReply | null }> {
  if (input.shared?.sessionLlmEnabled === false) {
    return {
      ...decideAdultGate({ visionAvailable: false, reply: null, strongTake: input.strongTake }),
      reply: null,
    };
  }
  let available = true;
  let reply: AdultGateReply | null = null;
  try {
    const still = await resolveStillFileForVisionScan({
      file: null,
      urls: [input.imageUrl],
      fallbackName: 'adult-check-still.png',
    });
    const { image, mimeType } = await prepareVisionScanImagePayload(still);
    const response = await fetch('/api/adult-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        image,
        mimeType,
        ...(input.shared ? sharedLlmRequestBody(input.shared) : {}),
      }),
    });
    const data = await parseVisionScanApiResponse<{
      available?: boolean;
      reply?: AdultGateReply | null;
      error?: string;
    }>(response);
    if (response.ok) {
      available = data.available !== false;
      reply = data.reply ?? null;
    }
  } catch {
    reply = null;
  }
  return {
    ...decideAdultGate({ visionAvailable: available, reply, strongTake: input.strongTake }),
    reply,
  };
}
