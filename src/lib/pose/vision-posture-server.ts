/**
 * Server: the vision model's posture read of a photo in ComfyUI's input (vision-posture.ts), for
 * "From a photo". Null whenever it cannot answer — no vision model set up, the LLM switched off,
 * the reply unreadable, the call failing — and the words then come from the joints alone, as
 * before.
 */

import { resolveVisionModel } from '@/lib/vision/model-auto';
import { visionCompletion } from '../llm/client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  type LlmRequestOptions,
} from '../llm/request-options';
import { comfyBaseUrl, parseComfyViewRef } from '../comfyui/comfy-utility-graph-server';
import {
  parseVisionPosture,
  VISION_POSTURE_PROMPT,
  VISION_POSTURE_SYSTEM_PROMPT,
  type PhotoPosture,
} from './vision-posture';

export async function readVisionPosture(input: {
  imageUrl: string;
  comfyUrl?: string;
  llm?: LlmRequestOptions;
  fetchImpl?: typeof fetch;
}): Promise<PhotoPosture | null> {
  try {
    if (!resolveRequestLlmEnabled(input.llm)) return null;
    const ref = parseComfyViewRef(input.imageUrl);
    if (!ref) return null;
    const model = await resolveVisionModel(input.llm);
    if (!model) return null;
    const view = new URLSearchParams({
      filename: ref.filename,
      subfolder: ref.subfolder ?? '',
      type: ref.type || 'input',
    });
    const response = await (input.fetchImpl ?? fetch)(
      `${comfyBaseUrl(input.comfyUrl)}/view?${view.toString()}`,
      { signal: AbortSignal.timeout(20_000) }
    );
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || 'image/png';
    const bytes = Buffer.from(await response.arrayBuffer());
    const reply = await visionCompletion({
      systemPrompt: VISION_POSTURE_SYSTEM_PROMPT,
      textPrompt: VISION_POSTURE_PROMPT,
      imageDataUrl: `data:${type};base64,${bytes.toString('base64')}`,
      maxTokens: 140,
      temperature: 0,
      model,
      endpoint: resolveRequestLlmEndpoint(input.llm),
      usageContext: { route: 'pose-photo-posture' },
    });
    return parseVisionPosture(reply);
  } catch (error) {
    console.warn(
      '[pose] vision posture read failed:',
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
