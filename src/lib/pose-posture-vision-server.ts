import { resolveVisionModel } from '@/lib/vision-model-auto';
import { visionCompletion } from './llm-client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  type LlmRequestOptions,
} from './llm-request-options';
import {
  parseVisionPosture,
  POSTURE_VISION_PROMPT,
  type VisionPosture,
} from './pose-posture-vision';

/**
 * Server: ask the vision model what the still's main person is doing (the pose check's optional
 * posture question). Null when no vision model is set up or the reply names no posture.
 */
export async function askPostureVision(options: {
  imageDataUrl: string;
  llm?: LlmRequestOptions;
}): Promise<VisionPosture | null> {
  if (!resolveRequestLlmEnabled(options.llm)) return null;
  const model = await resolveVisionModel(options.llm);
  if (!model) return null;
  const text = await visionCompletion({
    systemPrompt: '',
    textPrompt: POSTURE_VISION_PROMPT,
    imageDataUrl: options.imageDataUrl,
    maxTokens: 300,
    temperature: 0,
    model,
    endpoint: resolveRequestLlmEndpoint(options.llm),
    usageContext: { route: 'pose-posture' },
  });
  return parseVisionPosture(text);
}
