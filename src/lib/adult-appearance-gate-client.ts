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
  /** The still must stay clothed (Day Suggestive): the bare-skin question is asked too. */
  clothed?: boolean;
  /** This take already used the strong coverage line. */
  coveredTake?: boolean;
  shared?: VisionShared;
}): Promise<AdultGateDecision & { reply: AdultGateReply | null }> {
  const decide = (visionAvailable: boolean, reply: AdultGateReply | null) =>
    decideAdultGate({
      visionAvailable,
      reply,
      strongTake: input.strongTake,
      clothed: input.clothed === true,
      coveredTake: input.coveredTake === true,
    });
  if (input.shared?.sessionLlmEnabled === false) {
    return { ...decide(false, null), reply: null };
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
        ...(input.clothed ? { clothed: true } : {}),
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
  return { ...decide(available, reply), reply };
}
